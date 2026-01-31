// World generation utilities

import { fbm } from './noise';
import {
  BlockType,
  ChunkData,
  ChunkPosition,
  CHUNK_SIZE,
  CHUNK_HEIGHT,
  createEmptyChunkData,
  setBlockInChunk,
} from '@/types';

const SEA_LEVEL = 32;
const TERRAIN_HEIGHT = 20;
const BASE_HEIGHT = 24;

/**
 * Generate terrain for a single chunk
 */
export function generateChunk(position: ChunkPosition): ChunkData {
  const chunk = createEmptyChunkData();
  const worldX = position.x * CHUNK_SIZE;
  const worldZ = position.z * CHUNK_SIZE;

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      // Get height from noise
      const noiseValue = fbm(worldX + x, worldZ + z, 4, 0.5, 0.02);
      const height = Math.floor(BASE_HEIGHT + noiseValue * TERRAIN_HEIGHT);
      
      // Fill blocks from bottom to height
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        let blockType = BlockType.AIR;

        if (y === 0) {
          // Bedrock at bottom (using stone for now)
          blockType = BlockType.STONE;
        } else if (y < height - 4) {
          // Deep stone layer
          blockType = BlockType.STONE;
        } else if (y < height - 1) {
          // Dirt layer
          blockType = BlockType.DIRT;
        } else if (y < height) {
          // Top layer - grass or sand near water
          if (height <= SEA_LEVEL + 1) {
            blockType = BlockType.SAND;
          } else {
            blockType = BlockType.GRASS;
          }
        } else if (y < SEA_LEVEL) {
          // Water below sea level
          blockType = BlockType.WATER;
        }

        setBlockInChunk(chunk, x, y, z, blockType);
      }
    }
  }

  return chunk;
}

/**
 * Generate a simple tree at the given position
 */
export function generateTree(
  chunk: ChunkData,
  x: number,
  baseY: number,
  z: number
): void {
  const trunkHeight = 4 + Math.floor(Math.random() * 3);
  
  // Generate trunk
  for (let y = 0; y < trunkHeight; y++) {
    setBlockInChunk(chunk, x, baseY + y, z, BlockType.WOOD);
  }
  
  // Generate leaves (simple sphere-ish shape)
  const leafStart = baseY + trunkHeight - 2;
  const leafEnd = baseY + trunkHeight + 2;
  
  for (let ly = leafStart; ly < leafEnd; ly++) {
    const radius = ly === leafEnd - 1 ? 1 : 2;
    for (let lx = -radius; lx <= radius; lx++) {
      for (let lz = -radius; lz <= radius; lz++) {
        if (lx === 0 && lz === 0 && ly < baseY + trunkHeight) {
          continue; // Skip trunk position
        }
        // Skip corners for rounder shape
        if (Math.abs(lx) === radius && Math.abs(lz) === radius) {
          continue;
        }
        const px = x + lx;
        const pz = z + lz;
        if (px >= 0 && px < CHUNK_SIZE && pz >= 0 && pz < CHUNK_SIZE) {
          setBlockInChunk(chunk, px, ly, pz, BlockType.LEAVES);
        }
      }
    }
  }
}
