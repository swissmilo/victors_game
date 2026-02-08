import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { raycastBlocks, setBlockAtWorld } from './blockInteraction';
import { 
  BlockType, 
  createEmptyChunkData, 
  setBlockInChunk,
} from '@/types';

describe('blockInteraction', () => {
  describe('raycastBlocks', () => {
    it('should return null for empty world', () => {
      const chunks = new Map();
      const origin = new THREE.Vector3(0, 50, 0);
      const direction = new THREE.Vector3(0, -1, 0);
      
      const hit = raycastBlocks(origin, direction, chunks, 10);
      
      expect(hit).toBeNull();
    });

    it('should hit a block directly below origin', () => {
      const chunkData = createEmptyChunkData();
      setBlockInChunk(chunkData, 0, 30, 0, BlockType.STONE);
      
      const chunks = new Map();
      chunks.set('0,0', { data: chunkData, position: { x: 0, z: 0 } });
      
      const origin = new THREE.Vector3(0.5, 35, 0.5);
      const direction = new THREE.Vector3(0, -1, 0);
      
      const hit = raycastBlocks(origin, direction, chunks, 10);
      
      expect(hit).not.toBeNull();
      expect(hit!.blockType).toBe(BlockType.STONE);
      expect(hit!.blockPosition.x).toBe(0);
      expect(hit!.blockPosition.y).toBe(30);
      expect(hit!.blockPosition.z).toBe(0);
    });

    it('should return correct place position', () => {
      const chunkData = createEmptyChunkData();
      setBlockInChunk(chunkData, 5, 20, 5, BlockType.DIRT);
      
      const chunks = new Map();
      chunks.set('0,0', { data: chunkData, position: { x: 0, z: 0 } });
      
      const origin = new THREE.Vector3(5.5, 25, 5.5);
      const direction = new THREE.Vector3(0, -1, 0);
      
      const hit = raycastBlocks(origin, direction, chunks, 10);
      
      expect(hit).not.toBeNull();
      // Place position should be one block above (since we hit from top)
      expect(hit!.placePosition.y).toBe(21);
    });

    it('should not hit blocks beyond max distance', () => {
      const chunkData = createEmptyChunkData();
      setBlockInChunk(chunkData, 0, 10, 0, BlockType.STONE);
      
      const chunks = new Map();
      chunks.set('0,0', { data: chunkData, position: { x: 0, z: 0 } });
      
      const origin = new THREE.Vector3(0.5, 50, 0.5);
      const direction = new THREE.Vector3(0, -1, 0);
      
      // Max distance of 5 should not reach block at y=10 from y=50
      const hit = raycastBlocks(origin, direction, chunks, 5);
      
      expect(hit).toBeNull();
    });

    it('should hit block in front of origin', () => {
      const chunkData = createEmptyChunkData();
      setBlockInChunk(chunkData, 5, 30, 8, BlockType.GRASS);
      
      const chunks = new Map();
      chunks.set('0,0', { data: chunkData, position: { x: 0, z: 0 } });
      
      const origin = new THREE.Vector3(5.5, 30.5, 5.5);
      const direction = new THREE.Vector3(0, 0, 1);
      
      const hit = raycastBlocks(origin, direction, chunks, 10);
      
      expect(hit).not.toBeNull();
      expect(hit!.blockType).toBe(BlockType.GRASS);
      expect(hit!.blockPosition.z).toBe(8);
    });
  });

  describe('setBlockAtWorld', () => {
    it('should set block in chunk', () => {
      const chunkData = createEmptyChunkData();
      const chunks = new Map();
      chunks.set('0,0', { data: chunkData, position: { x: 0, z: 0 } });
      
      const key = setBlockAtWorld(5, 20, 7, BlockType.STONE, chunks);
      
      expect(key).toBe('0,0');
      
      // Verify block was set
      const chunk = chunks.get('0,0');
      expect(chunk).toBeDefined();
    });

    it('should return null for non-existent chunk', () => {
      const chunks = new Map();
      
      const key = setBlockAtWorld(100, 20, 100, BlockType.STONE, chunks);
      
      expect(key).toBeNull();
    });

    it('should return null for invalid y coordinate', () => {
      const chunkData = createEmptyChunkData();
      const chunks = new Map();
      chunks.set('0,0', { data: chunkData, position: { x: 0, z: 0 } });
      
      const keyNegative = setBlockAtWorld(5, -1, 5, BlockType.STONE, chunks);
      const keyTooHigh = setBlockAtWorld(5, 300, 5, BlockType.STONE, chunks);
      
      expect(keyNegative).toBeNull();
      expect(keyTooHigh).toBeNull();
    });
  });
});
