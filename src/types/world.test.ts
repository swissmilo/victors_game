import { describe, it, expect } from 'vitest';
import {
  CHUNK_SIZE,
  CHUNK_HEIGHT,
  getBlockIndex,
  getBlockFromChunk,
  setBlockInChunk,
  createEmptyChunkData,
  worldToChunkPosition,
  worldToLocalPosition,
  chunkPositionToKey,
  keyToChunkPosition,
} from './world';
import { BlockType } from './blocks';

describe('world utilities', () => {
  describe('getBlockIndex', () => {
    it('should return 0 for origin block', () => {
      expect(getBlockIndex(0, 0, 0)).toBe(0);
    });

    it('should calculate correct index for x axis', () => {
      expect(getBlockIndex(1, 0, 0)).toBe(1);
      expect(getBlockIndex(15, 0, 0)).toBe(15);
    });

    it('should calculate correct index for z axis', () => {
      expect(getBlockIndex(0, 0, 1)).toBe(CHUNK_SIZE);
      expect(getBlockIndex(0, 0, 15)).toBe(15 * CHUNK_SIZE);
    });

    it('should calculate correct index for y axis', () => {
      expect(getBlockIndex(0, 1, 0)).toBe(CHUNK_SIZE * CHUNK_SIZE);
      expect(getBlockIndex(0, 10, 0)).toBe(10 * CHUNK_SIZE * CHUNK_SIZE);
    });

    it('should calculate correct index for combined coordinates', () => {
      const x = 5, y = 10, z = 7;
      const expected = x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
      expect(getBlockIndex(x, y, z)).toBe(expected);
    });
  });

  describe('createEmptyChunkData', () => {
    it('should create a Uint8Array of correct size', () => {
      const chunk = createEmptyChunkData();
      expect(chunk).toBeInstanceOf(Uint8Array);
      expect(chunk.length).toBe(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
    });

    it('should initialize all blocks to AIR (0)', () => {
      const chunk = createEmptyChunkData();
      for (let i = 0; i < chunk.length; i++) {
        expect(chunk[i]).toBe(BlockType.AIR);
      }
    });
  });

  describe('getBlockFromChunk and setBlockInChunk', () => {
    it('should get and set blocks correctly', () => {
      const chunk = createEmptyChunkData();
      
      setBlockInChunk(chunk, 5, 10, 7, BlockType.STONE);
      expect(getBlockFromChunk(chunk, 5, 10, 7)).toBe(BlockType.STONE);
    });

    it('should return AIR for out of bounds coordinates', () => {
      const chunk = createEmptyChunkData();
      
      expect(getBlockFromChunk(chunk, -1, 0, 0)).toBe(BlockType.AIR);
      expect(getBlockFromChunk(chunk, 0, -1, 0)).toBe(BlockType.AIR);
      expect(getBlockFromChunk(chunk, 0, 0, -1)).toBe(BlockType.AIR);
      expect(getBlockFromChunk(chunk, CHUNK_SIZE, 0, 0)).toBe(BlockType.AIR);
      expect(getBlockFromChunk(chunk, 0, CHUNK_HEIGHT, 0)).toBe(BlockType.AIR);
      expect(getBlockFromChunk(chunk, 0, 0, CHUNK_SIZE)).toBe(BlockType.AIR);
    });

    it('should not modify chunk for out of bounds set', () => {
      const chunk = createEmptyChunkData();
      const originalLength = chunk.length;
      
      setBlockInChunk(chunk, -1, 0, 0, BlockType.STONE);
      setBlockInChunk(chunk, 100, 100, 100, BlockType.STONE);
      
      // Chunk should remain unchanged
      expect(chunk.length).toBe(originalLength);
      for (let i = 0; i < chunk.length; i++) {
        expect(chunk[i]).toBe(BlockType.AIR);
      }
    });
  });

  describe('worldToChunkPosition', () => {
    it('should return chunk 0,0 for positions within first chunk', () => {
      expect(worldToChunkPosition(0, 0)).toEqual({ x: 0, z: 0 });
      expect(worldToChunkPosition(15, 15)).toEqual({ x: 0, z: 0 });
    });

    it('should calculate correct chunk for positive coordinates', () => {
      expect(worldToChunkPosition(16, 0)).toEqual({ x: 1, z: 0 });
      expect(worldToChunkPosition(32, 48)).toEqual({ x: 2, z: 3 });
    });

    it('should calculate correct chunk for negative coordinates', () => {
      expect(worldToChunkPosition(-1, 0)).toEqual({ x: -1, z: 0 });
      expect(worldToChunkPosition(-16, -32)).toEqual({ x: -1, z: -2 });
      expect(worldToChunkPosition(-17, 0)).toEqual({ x: -2, z: 0 });
    });
  });

  describe('worldToLocalPosition', () => {
    it('should return local position within chunk', () => {
      expect(worldToLocalPosition(0, 10, 0)).toEqual({ x: 0, y: 10, z: 0 });
      expect(worldToLocalPosition(5, 20, 7)).toEqual({ x: 5, y: 20, z: 7 });
    });

    it('should wrap around for positions in other chunks', () => {
      expect(worldToLocalPosition(16, 10, 0)).toEqual({ x: 0, y: 10, z: 0 });
      expect(worldToLocalPosition(20, 10, 35)).toEqual({ x: 4, y: 10, z: 3 });
    });

    it('should handle negative coordinates', () => {
      expect(worldToLocalPosition(-1, 10, 0)).toEqual({ x: 15, y: 10, z: 0 });
      expect(worldToLocalPosition(-16, 10, -1)).toEqual({ x: 0, y: 10, z: 15 });
    });
  });

  describe('chunkPositionToKey and keyToChunkPosition', () => {
    it('should convert position to key and back', () => {
      const pos = { x: 5, z: -3 };
      const key = chunkPositionToKey(pos);
      expect(key).toBe('5,-3');
      expect(keyToChunkPosition(key)).toEqual(pos);
    });

    it('should handle origin chunk', () => {
      const pos = { x: 0, z: 0 };
      const key = chunkPositionToKey(pos);
      expect(key).toBe('0,0');
      expect(keyToChunkPosition(key)).toEqual(pos);
    });

    it('should handle large coordinates', () => {
      const pos = { x: 1000, z: -2000 };
      const key = chunkPositionToKey(pos);
      expect(keyToChunkPosition(key)).toEqual(pos);
    });
  });
});
