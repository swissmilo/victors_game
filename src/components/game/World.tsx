'use client';

import { useMemo, useEffect, useRef } from 'react';
import { useGameStore } from '@/stores';
import { ChunkMesh } from './ChunkMesh';
import { generateChunk, getTerrainHeightAt, PIZZERIA_ORIGIN, PIZZERIA_WIDTH, PIZZERIA_DEPTH } from '@/lib/worldGen';
import { DarkZone } from '@/lib/meshBuilder';
import {
  ChunkPosition,
  chunkPositionToKey,
  CHUNK_SIZE,
} from '@/types';

interface WorldProps {
  renderDistance?: number;
  unloadDistance?: number;
}

// Maximum chunks to generate per frame (prevents stuttering)
const MAX_CHUNKS_PER_FRAME = 2;

/**
 * Generate chunks in a spiral pattern from center outward
 * This prioritizes loading nearby chunks first for better perceived performance
 */
function generateSpiralChunks(centerX: number, centerZ: number, radius: number): ChunkPosition[] {
  const chunks: ChunkPosition[] = [];
  
  // Start at center
  chunks.push({ x: centerX, z: centerZ });
  
  // Spiral outward
  for (let r = 1; r <= radius; r++) {
    // Top edge (left to right)
    for (let dx = -r; dx <= r; dx++) {
      chunks.push({ x: centerX + dx, z: centerZ - r });
    }
    // Right edge (top to bottom, excluding corners)
    for (let dz = -r + 1; dz <= r - 1; dz++) {
      chunks.push({ x: centerX + r, z: centerZ + dz });
    }
    // Bottom edge (right to left)
    for (let dx = r; dx >= -r; dx--) {
      chunks.push({ x: centerX + dx, z: centerZ + r });
    }
    // Left edge (bottom to top, excluding corners)
    for (let dz = r - 1; dz >= -r + 1; dz--) {
      chunks.push({ x: centerX - r, z: centerZ + dz });
    }
  }
  
  return chunks;
}

export function World({ renderDistance = 8, unloadDistance = 12 }: WorldProps) {
  const playerPosition = useGameStore((state) => state.playerPosition);
  const isInParkour = useGameStore((state) => state.isInBlackHoleParkour);
  const worldChunks = useGameStore((state) => state.chunks);
  const parkourChunks = useGameStore((state) => state.parkourChunks);

  // Use parkour chunks when in parkour mode, otherwise use world chunks
  const chunks = isInParkour ? parkourChunks : worldChunks;

  const setChunk = useGameStore((state) => state.setChunk);
  const getChunk = useGameStore((state) => state.getChunk);
  const unloadDistantChunks = useGameStore((state) => state.unloadDistantChunks);
  
  // Compute FNAF pizzeria interior dark zone
  const darkZones: DarkZone[] = useMemo(() => {
    const terrainY = getTerrainHeightAt(
      PIZZERIA_ORIGIN.x + PIZZERIA_WIDTH / 2,
      PIZZERIA_ORIGIN.z + PIZZERIA_DEPTH / 2,
    );
    const baseY = terrainY + 10;
    const floorY = baseY + 1;
    const wallHeight = 7;
    return [{
      minX: PIZZERIA_ORIGIN.x,
      maxX: PIZZERIA_ORIGIN.x + PIZZERIA_WIDTH - 1,
      minY: floorY,
      maxY: floorY + wallHeight - 1,
      minZ: PIZZERIA_ORIGIN.z,
      maxZ: PIZZERIA_ORIGIN.z + PIZZERIA_DEPTH - 1,
      darkness: 0.15,
    }];
  }, []);

  // Track pending chunk generation
  const pendingChunksRef = useRef<ChunkPosition[]>([]);
  const isGeneratingRef = useRef(false);
  
  // Get player chunk coordinates for dependency tracking
  const playerChunkX = Math.floor(playerPosition[0] / CHUNK_SIZE);
  const playerChunkZ = Math.floor(playerPosition[2] / CHUNK_SIZE);
  
  // Determine which chunks should be loaded (spiral pattern for priority)
  const chunksToLoad = useMemo(() => {
    return generateSpiralChunks(playerChunkX, playerChunkZ, renderDistance);
  }, [playerChunkX, playerChunkZ, renderDistance]);
  
  // Generate chunks incrementally to avoid frame drops (skip when in parkour)
  useEffect(() => {
    // Don't generate world chunks when in parkour mode
    if (isInParkour) {
      pendingChunksRef.current = [];
      return;
    }

    // Find chunks that need to be generated
    const chunksToGenerate: ChunkPosition[] = [];
    for (const pos of chunksToLoad) {
      const existing = getChunk(pos);
      if (!existing) {
        chunksToGenerate.push(pos);
      }
    }

    // Update pending queue (prioritize by distance)
    pendingChunksRef.current = chunksToGenerate;

    // Process chunks incrementally
    const processChunks = () => {
      if (isGeneratingRef.current || pendingChunksRef.current.length === 0) return;

      isGeneratingRef.current = true;

      // Generate a few chunks per frame
      const toProcess = pendingChunksRef.current.splice(0, MAX_CHUNKS_PER_FRAME);

      for (const pos of toProcess) {
        // Double-check it still needs generating
        if (!getChunk(pos)) {
          const chunkData = generateChunk(pos);
          setChunk(pos, {
            position: pos,
            data: chunkData,
            isDirty: false,
          });
        }
      }

      isGeneratingRef.current = false;

      // Schedule next batch if more pending
      if (pendingChunksRef.current.length > 0) {
        requestAnimationFrame(processChunks);
      }
    };

    requestAnimationFrame(processChunks);
  }, [chunksToLoad, getChunk, setChunk, isInParkour]);
  
  // Unload distant chunks to free memory (skip when in parkour)
  useEffect(() => {
    if (!isInParkour) {
      unloadDistantChunks(playerChunkX, playerChunkZ, unloadDistance);
    }
  }, [playerChunkX, playerChunkZ, unloadDistance, unloadDistantChunks, isInParkour]);
  
  // Get list of chunks to render (only within render distance)
  const chunksToRender = useMemo(() => {
    const result: Array<{ key: string; position: ChunkPosition; distance: number }> = [];
    
    for (const pos of chunksToLoad) {
      const key = chunkPositionToKey(pos);
      if (chunks.has(key)) {
        // Calculate distance for potential LOD/culling
        const dx = pos.x - playerChunkX;
        const dz = pos.z - playerChunkZ;
        const distance = Math.sqrt(dx * dx + dz * dz);
        result.push({ key, position: pos, distance });
      }
    }
    
    // Sort by distance (nearest first) for better rendering order
    result.sort((a, b) => a.distance - b.distance);
    
    return result;
  }, [chunksToLoad, chunks, playerChunkX, playerChunkZ]);
  
  return (
    <group>
      {chunksToRender.map(({ key, position }) => {
        const chunk = chunks.get(key);
        if (!chunk) return null;
        
        return (
          <ChunkMesh
            key={key}
            position={position}
            data={chunk.data}
            darkZones={darkZones}
          />
        );
      })}
    </group>
  );
}
