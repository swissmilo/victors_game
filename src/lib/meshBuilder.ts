/**
 * Chunk mesh builder - generates optimized geometry for voxel chunks
 * Uses face culling to only render visible faces between solid and non-solid blocks
 */

import * as THREE from 'three';
import { BlockType, BLOCK_DEFINITIONS, ChunkData, CHUNK_SIZE, CHUNK_HEIGHT, getBlockFromChunk } from '@/types';
import { getTextureUVs } from './textureAtlas';

/** A region where vertex colors are darkened (e.g. building interiors). */
export interface DarkZone {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  /** Multiplier applied to face shading (0 = black, 1 = normal). */
  darkness: number;
}

// Face directions: [dx, dy, dz, face index]
// Face indices: 0=top, 1=bottom, 2=front(+z), 3=back(-z), 4=left(-x), 5=right(+x)
const FACES = [
  { dir: [0, 1, 0], corners: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]] },   // top
  { dir: [0, -1, 0], corners: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]] },  // bottom
  { dir: [0, 0, 1], corners: [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]] },   // front
  { dir: [0, 0, -1], corners: [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0]] },  // back
  { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]] },  // left
  { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 1, 1], [1, 1, 0], [1, 0, 0]] },   // right
] as const;

export interface ChunkMeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  colors: Float32Array;
}

/**
 * Get the texture index for a block face
 */
function getTextureIndex(blockType: BlockType, faceIndex: number): number {
  const def = BLOCK_DEFINITIONS[blockType];
  if (!def) return 0;
  
  if (typeof def.textureIndex === 'number') {
    return def.textureIndex;
  }
  
  // Array format: [top, bottom, front, back, left, right]
  return def.textureIndex[faceIndex];
}

/**
 * Check if a block at the given position is solid (for face culling)
 */
function isBlockSolid(chunk: ChunkData, x: number, y: number, z: number): boolean {
  const block = getBlockFromChunk(chunk, x, y, z);
  const def = BLOCK_DEFINITIONS[block];
  return def?.solid ?? false;
}

/**
 * Check if a block is transparent
 */
function isBlockTransparent(chunk: ChunkData, x: number, y: number, z: number): boolean {
  const block = getBlockFromChunk(chunk, x, y, z);
  const def = BLOCK_DEFINITIONS[block];
  return def?.transparent ?? true;
}

/**
 * Get face shading multiplier (simulates simple ambient occlusion)
 * Top faces are bright, side faces medium, bottom faces darker
 */
function getFaceShading(faceIndex: number): number {
  switch (faceIndex) {
    case 0: return 1.0;   // Top - full brightness
    case 1: return 0.5;   // Bottom - dark
    case 2: // Front (+Z)
    case 3: return 0.85;  // Back (-Z) - medium
    case 4: // Left (-X)  
    case 5: return 0.7;   // Right (+X) - slightly darker
    default: return 0.8;
  }
}

/**
 * Check if a world-space position falls inside any dark zone and return
 * the darkness multiplier (1.0 = no darkening).
 */
function getDarkZoneMultiplier(worldX: number, worldY: number, worldZ: number, darkZones: DarkZone[]): number {
  for (const z of darkZones) {
    if (worldX >= z.minX && worldX <= z.maxX &&
        worldY >= z.minY && worldY <= z.maxY &&
        worldZ >= z.minZ && worldZ <= z.maxZ) {
      return z.darkness;
    }
  }
  return 1.0;
}

/**
 * Build mesh data for a chunk using simple face culling
 * Only renders faces between solid and non-solid blocks
 */
export function buildChunkMesh(
  chunk: ChunkData,
  chunkWorldX?: number,
  chunkWorldZ?: number,
  darkZones?: DarkZone[],
): ChunkMeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];

  const hasDarkZones = darkZones && darkZones.length > 0 && chunkWorldX != null && chunkWorldZ != null;

  let vertexIndex = 0;

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const block = getBlockFromChunk(chunk, x, y, z);

        // Skip air blocks
        if (block === BlockType.AIR) continue;

        const blockDef = BLOCK_DEFINITIONS[block];
        if (!blockDef || !blockDef.solid) continue;

        // Compute dark zone multiplier once per block
        let darkMul = 1.0;
        if (hasDarkZones) {
          darkMul = getDarkZoneMultiplier(chunkWorldX + x, y, chunkWorldZ! + z, darkZones);
        }

        // Check each face
        for (let faceIdx = 0; faceIdx < FACES.length; faceIdx++) {
          const face = FACES[faceIdx];
          const [dx, dy, dz] = face.dir;
          const nx = x + dx;
          const ny = y + dy;
          const nz = z + dz;

          // Only render face if neighbor is not solid (or is transparent)
          const neighborSolid = isBlockSolid(chunk, nx, ny, nz);
          const neighborTransparent = isBlockTransparent(chunk, nx, ny, nz);

          if (neighborSolid && !neighborTransparent) continue;

          // Get texture UVs
          const textureIdx = getTextureIndex(block, faceIdx);
          const [u0, v0, u1, v1] = getTextureUVs(textureIdx);

          // Get shading for this face (simulates ambient occlusion)
          const faceShade = getFaceShading(faceIdx) * darkMul;

          // Add the 4 corners of the face
          for (const corner of face.corners) {
            positions.push(x + corner[0], y + corner[1], z + corner[2]);
            normals.push(dx, dy, dz);
            colors.push(faceShade, faceShade, faceShade);
          }

          // UV coordinates for the 4 corners
          uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);

          // Two triangles per face (indices) - counter-clockwise winding for front face
          indices.push(
            vertexIndex, vertexIndex + 2, vertexIndex + 1,
            vertexIndex, vertexIndex + 3, vertexIndex + 2
          );

          vertexIndex += 4;
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    colors: new Float32Array(colors),
  };
}

/**
 * Create a Three.js BufferGeometry from chunk mesh data
 */
export function createChunkGeometry(meshData: ChunkMeshData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  
  geometry.setAttribute('position', new THREE.BufferAttribute(meshData.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(meshData.normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(meshData.uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(meshData.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
  
  geometry.computeBoundingSphere();
  
  return geometry;
}

/**
 * Build mesh data for water blocks in a chunk.
 * Separate from opaque mesh so it can use a translucent material.
 */
export function buildWaterMesh(
  chunk: ChunkData,
  chunkWorldX?: number,
  chunkWorldZ?: number,
  darkZones?: DarkZone[],
): ChunkMeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];

  const hasDarkZones = darkZones && darkZones.length > 0 && chunkWorldX != null && chunkWorldZ != null;

  let vertexIndex = 0;

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const block = getBlockFromChunk(chunk, x, y, z);
        if (block !== BlockType.WATER) continue;

        let darkMul = 1.0;
        if (hasDarkZones) {
          darkMul = getDarkZoneMultiplier(chunkWorldX + x, y, chunkWorldZ! + z, darkZones);
        }

        for (let faceIdx = 0; faceIdx < FACES.length; faceIdx++) {
          const face = FACES[faceIdx];
          const [dx, dy, dz] = face.dir;
          const nx = x + dx;
          const ny = y + dy;
          const nz = z + dz;

          // Skip face if neighbor is also water (no internal faces)
          const neighbor = getBlockFromChunk(chunk, nx, ny, nz);
          if (neighbor === BlockType.WATER) continue;

          // Skip face if neighbor is solid and opaque
          const neighborDef = BLOCK_DEFINITIONS[neighbor];
          if (neighborDef?.solid && !neighborDef?.transparent) continue;

          const textureIdx = getTextureIndex(block, faceIdx);
          const [u0, v0, u1, v1] = getTextureUVs(textureIdx);
          const faceShade = getFaceShading(faceIdx) * darkMul;

          for (const corner of face.corners) {
            positions.push(x + corner[0], y + corner[1], z + corner[2]);
            normals.push(dx, dy, dz);
            colors.push(faceShade, faceShade, faceShade);
          }

          uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
          indices.push(
            vertexIndex, vertexIndex + 2, vertexIndex + 1,
            vertexIndex, vertexIndex + 3, vertexIndex + 2
          );
          vertexIndex += 4;
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    colors: new Float32Array(colors),
  };
}

/**
 * Create collision geometry for physics (simplified - just box colliders for solid blocks)
 * Returns an array of block positions that need colliders
 */
export function getColliderPositions(chunk: ChunkData): Array<{ x: number; y: number; z: number }> {
  const colliders: Array<{ x: number; y: number; z: number }> = [];
  
  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const block = getBlockFromChunk(chunk, x, y, z);
        const blockDef = BLOCK_DEFINITIONS[block];
        
        if (blockDef?.solid) {
          // Only add collider if block has at least one exposed face
          let hasExposedFace = false;
          for (const face of FACES) {
            const [dx, dy, dz] = face.dir;
            if (!isBlockSolid(chunk, x + dx, y + dy, z + dz)) {
              hasExposedFace = true;
              break;
            }
          }
          
          if (hasExposedFace) {
            colliders.push({ x, y, z });
          }
        }
      }
    }
  }
  
  return colliders;
}
