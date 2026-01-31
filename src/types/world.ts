// World and chunk type definitions

import { BlockType } from './blocks';

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 64;

export interface ChunkPosition {
  x: number;
  z: number;
}

export interface BlockPosition {
  x: number;
  y: number;
  z: number;
}

export type WorldPosition = BlockPosition;

// Chunk data is a flat array for performance
// Index = x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE
export type ChunkData = Uint8Array;

export interface Chunk {
  position: ChunkPosition;
  data: ChunkData;
  isDirty: boolean; // Needs mesh regeneration
}

export function getBlockIndex(x: number, y: number, z: number): number {
  return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
}

export function getBlockFromChunk(chunk: ChunkData, x: number, y: number, z: number): BlockType {
  if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
    return BlockType.AIR;
  }
  return chunk[getBlockIndex(x, y, z)] as BlockType;
}

export function setBlockInChunk(chunk: ChunkData, x: number, y: number, z: number, block: BlockType): void {
  if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
    return;
  }
  chunk[getBlockIndex(x, y, z)] = block;
}

export function createEmptyChunkData(): ChunkData {
  return new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
}

export function worldToChunkPosition(worldX: number, worldZ: number): ChunkPosition {
  return {
    x: Math.floor(worldX / CHUNK_SIZE),
    z: Math.floor(worldZ / CHUNK_SIZE),
  };
}

export function worldToLocalPosition(worldX: number, worldY: number, worldZ: number): BlockPosition {
  return {
    x: ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
    y: worldY,
    z: ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
  };
}

export function chunkPositionToKey(pos: ChunkPosition): string {
  return `${pos.x},${pos.z}`;
}

export function keyToChunkPosition(key: string): ChunkPosition {
  const [x, z] = key.split(',').map(Number);
  return { x, z };
}
