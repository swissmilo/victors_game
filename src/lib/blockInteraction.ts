/**
 * Block interaction utilities - raycasting and block manipulation
 */

import * as THREE from 'three';
import { 
  BlockType, 
  ChunkData, 
  ChunkPosition,
  CHUNK_HEIGHT,
  getBlockFromChunk, 
  setBlockInChunk,
  worldToChunkPosition,
  worldToLocalPosition,
  chunkPositionToKey,
} from '@/types';

export interface BlockHit {
  // World position of the block
  blockPosition: THREE.Vector3;
  // Position for placing a new block (adjacent to hit face)
  placePosition: THREE.Vector3;
  // The face normal that was hit
  faceNormal: THREE.Vector3;
  // Block type at this position
  blockType: BlockType;
  // Chunk containing this block
  chunkPosition: ChunkPosition;
  // Local position within chunk
  localPosition: { x: number; y: number; z: number };
}

/**
 * Perform a raycast against the voxel world to find the targeted block
 */
export function raycastBlocks(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  chunks: Map<string, { data: ChunkData; position: ChunkPosition }>,
  maxDistance: number = 6
): BlockHit | null {
  // Use DDA (Digital Differential Analyzer) algorithm for voxel raycast
  const tDelta = new THREE.Vector3();
  const tMax = new THREE.Vector3();
  
  // Current voxel position
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);
  
  // Direction signs
  const stepX = direction.x >= 0 ? 1 : -1;
  const stepY = direction.y >= 0 ? 1 : -1;
  const stepZ = direction.z >= 0 ? 1 : -1;
  
  // How far along the ray we must move for each component to cross a voxel boundary
  tDelta.x = direction.x !== 0 ? Math.abs(1 / direction.x) : Infinity;
  tDelta.y = direction.y !== 0 ? Math.abs(1 / direction.y) : Infinity;
  tDelta.z = direction.z !== 0 ? Math.abs(1 / direction.z) : Infinity;
  
  // Distance to first voxel boundary
  tMax.x = direction.x !== 0 
    ? ((direction.x > 0 ? (x + 1 - origin.x) : (origin.x - x)) * tDelta.x)
    : Infinity;
  tMax.y = direction.y !== 0 
    ? ((direction.y > 0 ? (y + 1 - origin.y) : (origin.y - y)) * tDelta.y)
    : Infinity;
  tMax.z = direction.z !== 0 
    ? ((direction.z > 0 ? (z + 1 - origin.z) : (origin.z - z)) * tDelta.z)
    : Infinity;
  
  let distance = 0;
  const lastNormal = new THREE.Vector3(0, 1, 0);
  
  while (distance < maxDistance) {
    // Check current voxel
    const block = getBlockAtWorld(x, y, z, chunks);
    
    if (block !== null && block !== BlockType.AIR) {
      const chunkPos = worldToChunkPosition(x, z);
      const localPos = worldToLocalPosition(x, y, z);
      
      return {
        blockPosition: new THREE.Vector3(x, y, z),
        placePosition: new THREE.Vector3(
          x + lastNormal.x,
          y + lastNormal.y,
          z + lastNormal.z
        ),
        faceNormal: lastNormal.clone(),
        blockType: block,
        chunkPosition: chunkPos,
        localPosition: localPos,
      };
    }
    
    // Move to next voxel
    if (tMax.x < tMax.y && tMax.x < tMax.z) {
      distance = tMax.x;
      tMax.x += tDelta.x;
      x += stepX;
      lastNormal.set(-stepX, 0, 0);
    } else if (tMax.y < tMax.z) {
      distance = tMax.y;
      tMax.y += tDelta.y;
      y += stepY;
      lastNormal.set(0, -stepY, 0);
    } else {
      distance = tMax.z;
      tMax.z += tDelta.z;
      z += stepZ;
      lastNormal.set(0, 0, -stepZ);
    }
  }
  
  return null;
}

/**
 * Get block at world coordinates
 */
function getBlockAtWorld(
  x: number, 
  y: number, 
  z: number, 
  chunks: Map<string, { data: ChunkData; position: ChunkPosition }>
): BlockType | null {
  if (y < 0 || y >= CHUNK_HEIGHT) return null;
  
  const chunkPos = worldToChunkPosition(x, z);
  const key = chunkPositionToKey(chunkPos);
  const chunk = chunks.get(key);
  
  if (!chunk) return null;
  
  const local = worldToLocalPosition(x, y, z);
  return getBlockFromChunk(chunk.data, local.x, local.y, local.z);
}

/**
 * Set block at world coordinates
 * Returns the chunk key that was modified (for mesh regeneration)
 */
export function setBlockAtWorld(
  x: number,
  y: number,
  z: number,
  blockType: BlockType,
  chunks: Map<string, { data: ChunkData; position: ChunkPosition }>
): string | null {
  if (y < 0 || y >= CHUNK_HEIGHT) return null;
  
  const chunkPos = worldToChunkPosition(x, z);
  const key = chunkPositionToKey(chunkPos);
  const chunk = chunks.get(key);
  
  if (!chunk) return null;
  
  const local = worldToLocalPosition(x, y, z);
  setBlockInChunk(chunk.data, local.x, local.y, local.z, blockType);
  
  return key;
}
