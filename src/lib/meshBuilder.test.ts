import { describe, it, expect } from 'vitest';
import { buildChunkMesh, getColliderPositions } from './meshBuilder';
import { 
  BlockType, 
  createEmptyChunkData, 
  setBlockInChunk,
  CHUNK_SIZE,
} from '@/types';

describe('meshBuilder', () => {
  describe('buildChunkMesh', () => {
    it('should return empty mesh data for empty chunk', () => {
      const chunk = createEmptyChunkData();
      const meshData = buildChunkMesh(chunk);
      
      expect(meshData.positions.length).toBe(0);
      expect(meshData.normals.length).toBe(0);
      expect(meshData.uvs.length).toBe(0);
      expect(meshData.indices.length).toBe(0);
      expect(meshData.colors.length).toBe(0);
    });

    it('should generate faces for a single block', () => {
      const chunk = createEmptyChunkData();
      setBlockInChunk(chunk, 8, 8, 8, BlockType.STONE);
      
      const meshData = buildChunkMesh(chunk);
      
      // Single block exposed on all 6 sides = 6 faces
      // Each face has 4 vertices, 6 indices
      expect(meshData.positions.length).toBe(6 * 4 * 3); // 6 faces * 4 verts * 3 components
      expect(meshData.normals.length).toBe(6 * 4 * 3);
      expect(meshData.uvs.length).toBe(6 * 4 * 2); // 6 faces * 4 verts * 2 components
      expect(meshData.indices.length).toBe(6 * 6); // 6 faces * 6 indices (2 triangles)
      expect(meshData.colors.length).toBe(6 * 4 * 3);
    });

    it('should cull faces between adjacent solid blocks', () => {
      const chunk = createEmptyChunkData();
      // Place two adjacent blocks
      setBlockInChunk(chunk, 8, 8, 8, BlockType.STONE);
      setBlockInChunk(chunk, 9, 8, 8, BlockType.STONE);
      
      const meshData = buildChunkMesh(chunk);
      
      // Two blocks would have 12 faces total, but 2 are hidden (touching faces)
      // So we expect 10 faces
      const expectedFaces = 10;
      expect(meshData.positions.length).toBe(expectedFaces * 4 * 3);
      expect(meshData.indices.length).toBe(expectedFaces * 6);
    });

    it('should generate correct vertex positions', () => {
      const chunk = createEmptyChunkData();
      setBlockInChunk(chunk, 0, 0, 0, BlockType.DIRT);
      
      const meshData = buildChunkMesh(chunk);
      
      // Check that positions are within the block's bounds (0-1 for block at origin)
      const positions = meshData.positions;
      for (let i = 0; i < positions.length; i += 3) {
        expect(positions[i]).toBeGreaterThanOrEqual(0);
        expect(positions[i]).toBeLessThanOrEqual(1);
        expect(positions[i + 1]).toBeGreaterThanOrEqual(0);
        expect(positions[i + 1]).toBeLessThanOrEqual(1);
        expect(positions[i + 2]).toBeGreaterThanOrEqual(0);
        expect(positions[i + 2]).toBeLessThanOrEqual(1);
      }
    });

    it('should generate valid UV coordinates', () => {
      const chunk = createEmptyChunkData();
      setBlockInChunk(chunk, 5, 5, 5, BlockType.GRASS);
      
      const meshData = buildChunkMesh(chunk);
      
      // UV coordinates should be between 0 and 1
      const uvs = meshData.uvs;
      for (let i = 0; i < uvs.length; i++) {
        expect(uvs[i]).toBeGreaterThanOrEqual(0);
        expect(uvs[i]).toBeLessThanOrEqual(1);
      }
    });

    it('should handle blocks at chunk boundaries', () => {
      const chunk = createEmptyChunkData();
      // Place blocks at corners
      setBlockInChunk(chunk, 0, 0, 0, BlockType.STONE);
      setBlockInChunk(chunk, CHUNK_SIZE - 1, 0, CHUNK_SIZE - 1, BlockType.STONE);
      
      const meshData = buildChunkMesh(chunk);
      
      // Both blocks should be fully rendered (6 faces each)
      expect(meshData.positions.length).toBe(12 * 4 * 3);
    });
  });

  describe('getColliderPositions', () => {
    it('should return empty array for empty chunk', () => {
      const chunk = createEmptyChunkData();
      const colliders = getColliderPositions(chunk);
      
      expect(colliders).toHaveLength(0);
    });

    it('should return position for single exposed block', () => {
      const chunk = createEmptyChunkData();
      setBlockInChunk(chunk, 8, 8, 8, BlockType.STONE);
      
      const colliders = getColliderPositions(chunk);
      
      expect(colliders).toHaveLength(1);
      expect(colliders[0]).toEqual({ x: 8, y: 8, z: 8 });
    });

    it('should not include completely surrounded blocks', () => {
      const chunk = createEmptyChunkData();
      // Create a 3x3x3 cube of blocks
      for (let x = 7; x <= 9; x++) {
        for (let y = 7; y <= 9; y++) {
          for (let z = 7; z <= 9; z++) {
            setBlockInChunk(chunk, x, y, z, BlockType.STONE);
          }
        }
      }
      
      const colliders = getColliderPositions(chunk);
      
      // Center block (8,8,8) should not have a collider (fully surrounded)
      // But all 26 outer blocks should
      expect(colliders).toHaveLength(26);
      expect(colliders.find(c => c.x === 8 && c.y === 8 && c.z === 8)).toBeUndefined();
    });

    it('should not include non-solid blocks', () => {
      const chunk = createEmptyChunkData();
      setBlockInChunk(chunk, 8, 8, 8, BlockType.WATER); // Water is not solid
      
      const colliders = getColliderPositions(chunk);
      
      expect(colliders).toHaveLength(0);
    });
  });
});
