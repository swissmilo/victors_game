import { describe, it, expect } from 'vitest';
import { generateChunk } from './worldGen';
import { 
  BlockType, 
  CHUNK_SIZE, 
  CHUNK_HEIGHT, 
  getBlockFromChunk 
} from '@/types';

describe('worldGen', () => {
  describe('generateChunk', () => {
    it('should generate a valid chunk data array', () => {
      const chunk = generateChunk({ x: 0, z: 0 });
      
      expect(chunk).toBeInstanceOf(Uint8Array);
      expect(chunk.length).toBe(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
    });

    it('should have stone at the bottom layer', () => {
      const chunk = generateChunk({ x: 0, z: 0 });
      
      // Check bottom layer (y=0) - should all be stone
      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const block = getBlockFromChunk(chunk, x, 0, z);
          expect(block).toBe(BlockType.STONE);
        }
      }
    });

    it('should have air at high altitudes', () => {
      const chunk = generateChunk({ x: 0, z: 0 });
      
      // Check high layer (y=60) - should all be air
      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const block = getBlockFromChunk(chunk, x, 60, z);
          expect(block).toBe(BlockType.AIR);
        }
      }
    });

    it('should have solid terrain at ground level', () => {
      const chunk = generateChunk({ x: 0, z: 0 });
      
      // At y=20 (below typical terrain), we should have solid blocks
      let solidCount = 0;
      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const block = getBlockFromChunk(chunk, x, 20, z);
          if (block !== BlockType.AIR) {
            solidCount++;
          }
        }
      }
      
      // Most blocks at y=20 should be solid
      expect(solidCount).toBeGreaterThan(CHUNK_SIZE * CHUNK_SIZE * 0.5);
    });

    it('should be deterministic for same chunk position', () => {
      const chunk1 = generateChunk({ x: 5, z: -3 });
      const chunk2 = generateChunk({ x: 5, z: -3 });
      
      // Both chunks should be identical
      expect(chunk1).toEqual(chunk2);
    });

    it('should generate different terrain for different positions', () => {
      const chunk1 = generateChunk({ x: 0, z: 0 });
      const chunk2 = generateChunk({ x: 10, z: 10 });
      
      // Chunks should be different (extremely unlikely to be identical)
      let differences = 0;
      for (let i = 0; i < chunk1.length; i++) {
        if (chunk1[i] !== chunk2[i]) differences++;
      }
      
      expect(differences).toBeGreaterThan(0);
    });

    it('should contain appropriate block types', () => {
      const chunk = generateChunk({ x: 0, z: 0 });
      
      const blockTypes = new Set<BlockType>();
      for (let i = 0; i < chunk.length; i++) {
        blockTypes.add(chunk[i] as BlockType);
      }
      
      // Should contain at least air, stone, dirt, and grass
      expect(blockTypes.has(BlockType.AIR)).toBe(true);
      expect(blockTypes.has(BlockType.STONE)).toBe(true);
      expect(blockTypes.has(BlockType.DIRT)).toBe(true);
      expect(blockTypes.has(BlockType.GRASS)).toBe(true);
    });
  });
});
