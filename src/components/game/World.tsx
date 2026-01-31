'use client';

import { useMemo, useEffect } from 'react';
import { useGameStore } from '@/stores';
import { ChunkMesh } from './ChunkMesh';
import { generateChunk } from '@/lib/worldGen';
import { 
  ChunkPosition, 
  chunkPositionToKey,
} from '@/types';

interface WorldProps {
  renderDistance?: number;
}

export function World({ renderDistance = 3 }: WorldProps) {
  const playerPosition = useGameStore((state) => state.playerPosition);
  const chunks = useGameStore((state) => state.chunks);
  const setChunk = useGameStore((state) => state.setChunk);
  const getChunk = useGameStore((state) => state.getChunk);
  
  // Get player chunk coordinates for dependency tracking
  const playerChunkX = Math.floor(playerPosition[0] / 16);
  const playerChunkZ = Math.floor(playerPosition[2] / 16);
  
  // Determine which chunks should be loaded based on player position
  const chunksToLoad = useMemo(() => {
    const needed: ChunkPosition[] = [];
    
    for (let dx = -renderDistance; dx <= renderDistance; dx++) {
      for (let dz = -renderDistance; dz <= renderDistance; dz++) {
        needed.push({
          x: playerChunkX + dx,
          z: playerChunkZ + dz,
        });
      }
    }
    
    return needed;
  }, [playerChunkX, playerChunkZ, renderDistance]);
  
  // Generate chunks that don't exist yet
  useEffect(() => {
    for (const pos of chunksToLoad) {
      const existing = getChunk(pos);
      if (!existing) {
        const chunkData = generateChunk(pos);
        setChunk(pos, {
          position: pos,
          data: chunkData,
          isDirty: false,
        });
      }
    }
  }, [chunksToLoad, getChunk, setChunk]);
  
  // Get list of chunks to render
  const chunksToRender = useMemo(() => {
    const result: Array<{ key: string; position: ChunkPosition }> = [];
    
    for (const pos of chunksToLoad) {
      const key = chunkPositionToKey(pos);
      if (chunks.has(key)) {
        result.push({ key, position: pos });
      }
    }
    
    return result;
  }, [chunksToLoad, chunks]);
  
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
          />
        );
      })}
    </group>
  );
}
