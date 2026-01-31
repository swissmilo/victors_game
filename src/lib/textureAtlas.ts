/**
 * Texture atlas loader - loads block textures and combines them into an atlas
 */

import * as THREE from 'three';

// Texture size (Minecraft textures are 16x16)
const TEXTURE_SIZE = 16;
const ATLAS_COLS = 4;
const ATLAS_ROWS = 4;
const ATLAS_SIZE = TEXTURE_SIZE * ATLAS_COLS; // 64x64

// Texture paths and their indices in the atlas
// Index = col + row * ATLAS_COLS
export const TEXTURE_INDICES = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  WOOD_SIDE: 4,
  WOOD_TOP: 5,
  LEAVES: 6,
  SAND: 7,
  WATER: 8,
  COBBLESTONE: 9,
  PLANKS: 10,
} as const;

const TEXTURE_PATHS: Record<number, string> = {
  [TEXTURE_INDICES.GRASS_TOP]: '/textures/grass_block_top.png',
  [TEXTURE_INDICES.GRASS_SIDE]: '/textures/grass_block_side.png',
  [TEXTURE_INDICES.DIRT]: '/textures/dirt.png',
  [TEXTURE_INDICES.STONE]: '/textures/stone.png',
  [TEXTURE_INDICES.WOOD_SIDE]: '/textures/oak_log.png',
  [TEXTURE_INDICES.WOOD_TOP]: '/textures/oak_log_top.png',
  [TEXTURE_INDICES.LEAVES]: '/textures/oak_leaves.png',
  [TEXTURE_INDICES.SAND]: '/textures/sand.png',
  [TEXTURE_INDICES.WATER]: '/textures/water_still.png',
  [TEXTURE_INDICES.COBBLESTONE]: '/textures/cobblestone.png',
  [TEXTURE_INDICES.PLANKS]: '/textures/oak_planks.png',
};

/**
 * Load an image from a URL
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Create texture atlas from individual texture images
 */
async function createTextureAtlasAsync(): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  
  // Fill with magenta for debugging (missing textures will be visible)
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  
  // Load and draw each texture
  const loadPromises = Object.entries(TEXTURE_PATHS).map(async ([indexStr, path]) => {
    const index = parseInt(indexStr, 10);
    const col = index % ATLAS_COLS;
    const row = Math.floor(index / ATLAS_COLS);
    const x = col * TEXTURE_SIZE;
    const y = row * TEXTURE_SIZE;
    
    try {
      const img = await loadImage(path);
      ctx.drawImage(img, x, y, TEXTURE_SIZE, TEXTURE_SIZE);
    } catch (error) {
      console.warn(`Failed to load texture: ${path}`, error);
      // Leave magenta placeholder
    }
  });
  
  await Promise.all(loadPromises);
  
  return canvas;
}

/**
 * Create a fallback atlas with solid colors (used before images load)
 */
function createFallbackAtlas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  
  // Fallback colors for each texture
  const fallbackColors: Record<number, string> = {
    [TEXTURE_INDICES.GRASS_TOP]: '#5d8c3d',
    [TEXTURE_INDICES.GRASS_SIDE]: '#6b8c42',
    [TEXTURE_INDICES.DIRT]: '#8b6914',
    [TEXTURE_INDICES.STONE]: '#7f7f7f',
    [TEXTURE_INDICES.WOOD_SIDE]: '#6b4423',
    [TEXTURE_INDICES.WOOD_TOP]: '#a07850',
    [TEXTURE_INDICES.LEAVES]: '#3d6b2d',
    [TEXTURE_INDICES.SAND]: '#d4c896',
    [TEXTURE_INDICES.WATER]: '#3b7dde',
    [TEXTURE_INDICES.COBBLESTONE]: '#5f5f5f',
    [TEXTURE_INDICES.PLANKS]: '#b89456',
  };
  
  // Fill with magenta for empty slots
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  
  // Draw fallback colors
  Object.entries(fallbackColors).forEach(([indexStr, color]) => {
    const index = parseInt(indexStr, 10);
    const col = index % ATLAS_COLS;
    const row = Math.floor(index / ATLAS_COLS);
    const x = col * TEXTURE_SIZE;
    const y = row * TEXTURE_SIZE;
    
    ctx.fillStyle = color;
    ctx.fillRect(x, y, TEXTURE_SIZE, TEXTURE_SIZE);
  });
  
  return canvas;
}

// Singleton texture and loading state
let atlasTexture: THREE.CanvasTexture | null = null;
let isLoading = false;
let loadPromise: Promise<void> | null = null;

/**
 * Get the atlas texture (may be fallback initially, updates when loaded)
 */
export function getAtlasTexture(): THREE.CanvasTexture {
  if (!atlasTexture) {
    // Create with fallback first
    const fallbackCanvas = createFallbackAtlas();
    atlasTexture = new THREE.CanvasTexture(fallbackCanvas);
    atlasTexture.magFilter = THREE.NearestFilter;
    atlasTexture.minFilter = THREE.NearestFilter;
    atlasTexture.colorSpace = THREE.SRGBColorSpace;
    
    // Start loading real textures
    if (!isLoading && typeof window !== 'undefined') {
      isLoading = true;
      loadPromise = createTextureAtlasAsync().then((canvas) => {
        if (atlasTexture) {
          atlasTexture.image = canvas;
          atlasTexture.needsUpdate = true;
        }
      }).catch((error) => {
        console.error('Failed to load texture atlas:', error);
      });
    }
  }
  return atlasTexture;
}

/**
 * Wait for textures to be fully loaded
 */
export async function waitForTexturesLoaded(): Promise<void> {
  if (loadPromise) {
    await loadPromise;
  }
}

/**
 * Get UV coordinates for a texture index in the atlas
 */
export function getTextureUVs(textureIndex: number): [number, number, number, number] {
  const col = textureIndex % ATLAS_COLS;
  const row = Math.floor(textureIndex / ATLAS_COLS);
  
  const u0 = col / ATLAS_COLS;
  const v0 = 1 - (row + 1) / ATLAS_ROWS;
  const u1 = (col + 1) / ATLAS_COLS;
  const v1 = 1 - row / ATLAS_ROWS;
  
  return [u0, v0, u1, v1];
}

// Re-export constants for use in meshBuilder
export { ATLAS_COLS as TEXTURES_PER_ROW };
