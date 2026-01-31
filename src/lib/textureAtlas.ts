/**
 * Texture atlas loader - loads block textures and combines them into an atlas
 */

import * as THREE from 'three';

// Texture size (Minecraft textures are 16x16)
const TEXTURE_SIZE = 16;
const ATLAS_COLS = 4;  // Keep at 4 columns
const ATLAS_ROWS = 5;  // 4x5 = 20 slots
const ATLAS_WIDTH = TEXTURE_SIZE * ATLAS_COLS;   // 64
const ATLAS_HEIGHT = TEXTURE_SIZE * ATLAS_ROWS;  // 80

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
  METAL: 11,
  OBSIDIAN: 12,
  PORTAL: 13,
  TELEPORTER: 14,
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
  [TEXTURE_INDICES.METAL]: '/textures/metal.png',
  [TEXTURE_INDICES.OBSIDIAN]: '/textures/obsidian.png',
  [TEXTURE_INDICES.PORTAL]: '/textures/portal.png',
  [TEXTURE_INDICES.TELEPORTER]: '/textures/teleporter.png',
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
 * Draw an image rotated by the specified degrees (0, 90, 180, 270)
 */
function drawImageRotated(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  size: number,
  degrees: number
): void {
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}

// Textures that need rotation (in degrees)
const TEXTURE_ROTATIONS: Partial<Record<number, number>> = {
  [TEXTURE_INDICES.GRASS_SIDE]: 90, // Grass side needs 90 degree rotation
};

// Textures that need color tinting (Minecraft uses greyscale + biome colormap)
// Format: [r, g, b] multipliers (0-1)
const TEXTURE_TINTS: Partial<Record<number, [number, number, number]>> = {
  [TEXTURE_INDICES.GRASS_TOP]: [0.4, 0.75, 0.35],  // Green grass tint
  [TEXTURE_INDICES.LEAVES]: [0.4, 0.65, 0.35],     // Green leaves tint (slightly different)
};

/**
 * Apply a color tint to an image
 */
function tintImage(
  img: HTMLImageElement,
  tint: [number, number, number]
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  
  // Draw original image
  ctx.drawImage(img, 0, 0);
  
  // Get image data
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Apply tint (multiply blend mode)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.floor(data[i] * tint[0]);     // R
    data[i + 1] = Math.floor(data[i + 1] * tint[1]); // G
    data[i + 2] = Math.floor(data[i + 2] * tint[2]); // B
    // Alpha stays the same
  }
  
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Create texture atlas from individual texture images
 */
async function createTextureAtlasAsync(): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_WIDTH;
  canvas.height = ATLAS_HEIGHT;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  
  // Fill with magenta for debugging (missing textures will be visible)
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
  
  // Load and draw each texture
  const loadPromises = Object.entries(TEXTURE_PATHS).map(async ([indexStr, path]) => {
    const index = parseInt(indexStr, 10);
    const col = index % ATLAS_COLS;
    const row = Math.floor(index / ATLAS_COLS);
    const x = col * TEXTURE_SIZE;
    const y = row * TEXTURE_SIZE;
    
    try {
      const img = await loadImage(path);
      const rotation = TEXTURE_ROTATIONS[index] || 0;
      const tint = TEXTURE_TINTS[index];
      
      // Apply tint if needed (for greyscale textures like grass/leaves)
      let source: HTMLImageElement | HTMLCanvasElement = img;
      if (tint) {
        source = tintImage(img, tint);
      }
      
      if (rotation !== 0) {
        // For rotated images, we need to handle canvas sources differently
        if (source instanceof HTMLCanvasElement) {
          // Convert canvas to image for rotation
          ctx.save();
          ctx.translate(x + TEXTURE_SIZE / 2, y + TEXTURE_SIZE / 2);
          ctx.rotate((rotation * Math.PI) / 180);
          ctx.drawImage(source, -TEXTURE_SIZE / 2, -TEXTURE_SIZE / 2, TEXTURE_SIZE, TEXTURE_SIZE);
          ctx.restore();
        } else {
          drawImageRotated(ctx, source, x, y, TEXTURE_SIZE, rotation);
        }
      } else {
        ctx.drawImage(source, x, y, TEXTURE_SIZE, TEXTURE_SIZE);
      }
    } catch (error) {
      console.warn(`Failed to load texture: ${path}`, error);
      // Leave magenta placeholder
    }
  });
  
  await Promise.all(loadPromises);
  
  // Draw procedural textures that don't have image files
  drawMetalTexture(ctx, TEXTURE_INDICES.METAL);
  drawObsidianTexture(ctx, TEXTURE_INDICES.OBSIDIAN);
  drawPortalTexture(ctx, TEXTURE_INDICES.PORTAL);
  
  return canvas;
}

/**
 * Draw a procedural green metal texture at the given atlas index
 */
function drawMetalTexture(ctx: CanvasRenderingContext2D, textureIndex: number): void {
  const col = textureIndex % ATLAS_COLS;
  const row = Math.floor(textureIndex / ATLAS_COLS);
  const x = col * TEXTURE_SIZE;
  const y = row * TEXTURE_SIZE;
  
  // Base green metal color
  ctx.fillStyle = '#2e8b57';
  ctx.fillRect(x, y, TEXTURE_SIZE, TEXTURE_SIZE);
  
  // Add some metallic sheen/rivets pattern
  ctx.fillStyle = '#3cb371';  // Lighter green for highlights
  for (let py = 0; py < TEXTURE_SIZE; py += 4) {
    for (let px = 0; px < TEXTURE_SIZE; px += 4) {
      if ((px + py) % 8 === 0) {
        ctx.fillRect(x + px, y + py, 2, 2);
      }
    }
  }
  
  // Add rivet dots
  ctx.fillStyle = '#1e6b47';  // Darker for rivets
  const rivetPositions = [[2, 2], [13, 2], [2, 13], [13, 13], [7, 7]];
  rivetPositions.forEach(([rx, ry]) => {
    ctx.beginPath();
    ctx.arc(x + rx, y + ry, 1.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * Draw obsidian texture - dark with purple sheen
 */
function drawObsidianTexture(ctx: CanvasRenderingContext2D, textureIndex: number): void {
  const col = textureIndex % ATLAS_COLS;
  const row = Math.floor(textureIndex / ATLAS_COLS);
  const x = col * TEXTURE_SIZE;
  const y = row * TEXTURE_SIZE;
  
  // Dark base
  ctx.fillStyle = '#1a0a2e';
  ctx.fillRect(x, y, TEXTURE_SIZE, TEXTURE_SIZE);
  
  // Add subtle purple variations
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      if ((px * py) % 7 === 0) {
        ctx.fillStyle = '#2d1b4e';
        ctx.fillRect(x + px, y + py, 1, 1);
      } else if ((px + py) % 11 === 0) {
        ctx.fillStyle = '#3d2b5e';
        ctx.fillRect(x + px, y + py, 1, 1);
      }
    }
  }
}

/**
 * Draw portal texture - swirling purple/black pattern
 */
function drawPortalTexture(ctx: CanvasRenderingContext2D, textureIndex: number): void {
  const col = textureIndex % ATLAS_COLS;
  const row = Math.floor(textureIndex / ATLAS_COLS);
  const x = col * TEXTURE_SIZE;
  const y = row * TEXTURE_SIZE;
  
  // Dark purple/black base
  ctx.fillStyle = '#0a0015';
  ctx.fillRect(x, y, TEXTURE_SIZE, TEXTURE_SIZE);
  
  // Add swirling stars/sparkles
  const sparkles = [
    [3, 4, '#8b00ff'], [7, 2, '#9932cc'], [12, 5, '#6a0dad'],
    [2, 9, '#9400d3'], [8, 8, '#8b008b'], [14, 10, '#800080'],
    [5, 13, '#9932cc'], [10, 14, '#8b00ff'], [1, 1, '#6a0dad'],
    [15, 15, '#9400d3'], [6, 6, '#bf00ff'], [11, 3, '#7b00ff'],
    [4, 11, '#a020f0'], [9, 12, '#9370db'], [13, 7, '#8a2be2'],
  ];
  
  sparkles.forEach(([sx, sy, color]) => {
    ctx.fillStyle = color as string;
    ctx.fillRect(x + (sx as number), y + (sy as number), 1, 1);
  });
  
  // Add some cyan/teal accents like in the reference image
  const cyanSparkles = [
    [2, 6], [5, 3], [9, 7], [12, 11], [7, 14], [14, 4], [3, 12],
  ];
  cyanSparkles.forEach(([sx, sy]) => {
    ctx.fillStyle = '#00ced1';
    ctx.fillRect(x + sx, y + sy, 1, 1);
  });
}

/**
 * Create a fallback atlas with solid colors (used before images load)
 */
function createFallbackAtlas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_WIDTH;
  canvas.height = ATLAS_HEIGHT;
  
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
    [TEXTURE_INDICES.LEAVES]: '#d65db1',  // Pink/purple to match texture pack
    [TEXTURE_INDICES.SAND]: '#d4c896',
    [TEXTURE_INDICES.WATER]: '#3b7dde',
    [TEXTURE_INDICES.COBBLESTONE]: '#5f5f5f',
    [TEXTURE_INDICES.PLANKS]: '#b89456',
    [TEXTURE_INDICES.METAL]: '#2e8b57',  // Sea green for metal tank
    [TEXTURE_INDICES.OBSIDIAN]: '#1a0a2e',  // Dark purple/black
    [TEXTURE_INDICES.PORTAL]: '#8b00ff',  // Purple portal
    [TEXTURE_INDICES.TELEPORTER]: '#00e5e5',  // Cyan teleporter
  };
  
  // Fill with magenta for empty slots
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
  
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

// Shared material instance for all chunk meshes (reduces GPU memory)
let sharedChunkMaterial: THREE.MeshLambertMaterial | null = null;

/**
 * Get a shared material for chunk rendering
 * Using a single material for all chunks improves batching and reduces memory
 */
export function getSharedChunkMaterial(): THREE.MeshLambertMaterial {
  if (!sharedChunkMaterial) {
    const texture = getAtlasTexture();
    sharedChunkMaterial = new THREE.MeshLambertMaterial({
      map: texture,
      vertexColors: true,
    });
  }
  return sharedChunkMaterial;
}
