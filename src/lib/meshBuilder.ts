/**
 * Chunk mesh builder - generates optimized geometry for voxel chunks
 * Uses face culling to only render visible faces between solid and non-solid blocks
 */

import * as THREE from 'three';
import { BlockType, BLOCK_DEFINITIONS, ChunkData, CHUNK_SIZE, CHUNK_HEIGHT, getBlockFromChunk } from '@/types';

// Face directions: [dx, dy, dz, face index]
// Face indices: 0=top, 1=bottom, 2=front(+z), 3=back(-z), 4=left(-x), 5=right(+x)
const FACES = [
  { dir: [0, 1, 0], corners: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], uvRow: 0 },   // top
  { dir: [0, -1, 0], corners: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]], uvRow: 1 },  // bottom
  { dir: [0, 0, 1], corners: [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]], uvRow: 2 },   // front
  { dir: [0, 0, -1], corners: [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0]], uvRow: 3 },  // back
  { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]], uvRow: 4 },  // left
  { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 1, 1], [1, 1, 0], [1, 0, 0]], uvRow: 5 },   // right
] as const;

// Texture atlas configuration
const TEXTURE_SIZE = 16; // pixels per texture
const ATLAS_SIZE = 256;  // total atlas size in pixels
const TEXTURES_PER_ROW = ATLAS_SIZE / TEXTURE_SIZE; // 16 textures per row

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
 * Get UV coordinates for a texture index in the atlas
 */
function getUVs(textureIndex: number): [number, number, number, number] {
  const col = textureIndex % TEXTURES_PER_ROW;
  const row = Math.floor(textureIndex / TEXTURES_PER_ROW);
  
  const u0 = col / TEXTURES_PER_ROW;
  const v0 = 1 - (row + 1) / TEXTURES_PER_ROW;
  const u1 = (col + 1) / TEXTURES_PER_ROW;
  const v1 = 1 - row / TEXTURES_PER_ROW;
  
  return [u0, v0, u1, v1];
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
 * Get base color for a block type (brighter, Minecraft-like colors)
 */
function getBlockBaseColor(blockType: BlockType): [number, number, number] {
  switch (blockType) {
    case BlockType.GRASS: return [0.4, 0.75, 0.35];  // Bright green
    case BlockType.DIRT: return [0.6, 0.4, 0.25];    // Brown
    case BlockType.STONE: return [0.55, 0.55, 0.55]; // Gray
    case BlockType.WOOD: return [0.55, 0.35, 0.2];   // Dark brown
    case BlockType.LEAVES: return [0.3, 0.6, 0.25];  // Dark green
    case BlockType.SAND: return [0.9, 0.85, 0.6];    // Light tan
    case BlockType.WATER: return [0.3, 0.5, 0.9];    // Blue
    case BlockType.COBBLESTONE: return [0.5, 0.5, 0.5]; // Gray
    case BlockType.PLANKS: return [0.7, 0.55, 0.35]; // Light brown
    default: return [1, 0, 1]; // Magenta for unknown
  }
}

/**
 * Get color for a block face with shading based on face direction
 * Top faces are brighter, side faces medium, bottom faces darker
 */
function getBlockColor(blockType: BlockType, faceIndex: number): [number, number, number] {
  const base = getBlockBaseColor(blockType);
  
  // Special handling for grass - top is green, sides/bottom are dirt-colored
  if (blockType === BlockType.GRASS) {
    if (faceIndex === 0) {
      // Top face - bright green
      return [0.45, 0.8, 0.35];
    } else if (faceIndex === 1) {
      // Bottom face - dirt
      return [0.5, 0.35, 0.2];
    } else {
      // Side faces - greenish brown gradient
      return [0.45, 0.55, 0.3];
    }
  }
  
  // Apply face-based shading for depth
  let brightness: number;
  switch (faceIndex) {
    case 0: brightness = 1.0; break;   // Top - full brightness
    case 1: brightness = 0.5; break;   // Bottom - dark
    case 2: // Front (+Z)
    case 3: brightness = 0.8; break;   // Back (-Z) - medium
    case 4: // Left (-X)  
    case 5: brightness = 0.7; break;   // Right (+X) - slightly darker
    default: brightness = 0.8;
  }
  
  return [
    base[0] * brightness,
    base[1] * brightness,
    base[2] * brightness,
  ];
}

/**
 * Build mesh data for a chunk using simple face culling
 * Only renders faces between solid and non-solid blocks
 */
export function buildChunkMesh(chunk: ChunkData): ChunkMeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  
  let vertexIndex = 0;
  
  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const block = getBlockFromChunk(chunk, x, y, z);
        
        // Skip air blocks
        if (block === BlockType.AIR) continue;
        
        const blockDef = BLOCK_DEFINITIONS[block];
        if (!blockDef || !blockDef.solid) continue;
        
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
          const [u0, v0, u1, v1] = getUVs(textureIdx);
          
          // Get color for this specific face (with shading)
          const faceColor = getBlockColor(block, faceIdx);
          
          // Add the 4 corners of the face
          for (const corner of face.corners) {
            positions.push(x + corner[0], y + corner[1], z + corner[2]);
            normals.push(dx, dy, dz);
            colors.push(faceColor[0], faceColor[1], faceColor[2]);
          }
          
          // UV coordinates for the 4 corners
          uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
          
          // Two triangles per face (indices)
          indices.push(
            vertexIndex, vertexIndex + 1, vertexIndex + 2,
            vertexIndex, vertexIndex + 2, vertexIndex + 3
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
