/**
 * Procedural texture atlas generator for block textures
 * Creates a 256x256 atlas with 16x16 pixel textures
 */

import * as THREE from 'three';

const TEXTURE_SIZE = 16;
const ATLAS_SIZE = 256;
const TEXTURES_PER_ROW = ATLAS_SIZE / TEXTURE_SIZE; // 16

// Texture indices match BLOCK_DEFINITIONS textureIndex values
// 0 = grass_top, 1 = grass_side, 2 = dirt, 3 = stone
// 4 = wood_side, 5 = wood_top, 6 = leaves, 7 = sand
// 8 = water, 9 = cobblestone, 10 = planks

type ColorRGB = [number, number, number];

interface TextureGenerator {
  baseColor: ColorRGB;
  pattern?: 'solid' | 'noise' | 'brick' | 'stripes' | 'checkers';
  noiseAmount?: number;
  secondaryColor?: ColorRGB;
}

const TEXTURE_GENERATORS: Record<number, TextureGenerator> = {
  0: { baseColor: [86, 125, 70], pattern: 'noise', noiseAmount: 20 }, // grass_top
  1: { baseColor: [86, 125, 70], pattern: 'noise', noiseAmount: 15, secondaryColor: [139, 90, 43] }, // grass_side
  2: { baseColor: [139, 90, 43], pattern: 'noise', noiseAmount: 25 }, // dirt
  3: { baseColor: [128, 128, 128], pattern: 'noise', noiseAmount: 30 }, // stone
  4: { baseColor: [139, 90, 50], pattern: 'stripes', secondaryColor: [100, 60, 30] }, // wood_side
  5: { baseColor: [139, 100, 60], pattern: 'noise', noiseAmount: 15, secondaryColor: [100, 70, 40] }, // wood_top (rings)
  6: { baseColor: [50, 120, 50], pattern: 'noise', noiseAmount: 40 }, // leaves
  7: { baseColor: [210, 200, 140], pattern: 'noise', noiseAmount: 15 }, // sand
  8: { baseColor: [50, 100, 200], pattern: 'noise', noiseAmount: 10 }, // water
  9: { baseColor: [100, 100, 100], pattern: 'brick', secondaryColor: [80, 80, 80] }, // cobblestone
  10: { baseColor: [180, 140, 90], pattern: 'stripes', secondaryColor: [150, 110, 60] }, // planks
};

/**
 * Generate a single texture on the canvas
 */
function generateTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  generator: TextureGenerator
): void {
  const { baseColor, pattern = 'solid', noiseAmount = 0, secondaryColor } = generator;
  
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      let r = baseColor[0];
      let g = baseColor[1];
      let b = baseColor[2];
      
      switch (pattern) {
        case 'noise': {
          const noise = (Math.random() - 0.5) * noiseAmount;
          r = Math.max(0, Math.min(255, r + noise));
          g = Math.max(0, Math.min(255, g + noise));
          b = Math.max(0, Math.min(255, b + noise));
          break;
        }
        
        case 'brick': {
          // Cobblestone-like pattern
          const brickX = (px + (py % 8 < 4 ? 0 : 4)) % 8;
          const brickY = py % 4;
          if (brickX === 0 || brickY === 0) {
            if (secondaryColor) {
              r = secondaryColor[0];
              g = secondaryColor[1];
              b = secondaryColor[2];
            }
          }
          const noise = (Math.random() - 0.5) * 20;
          r = Math.max(0, Math.min(255, r + noise));
          g = Math.max(0, Math.min(255, g + noise));
          b = Math.max(0, Math.min(255, b + noise));
          break;
        }
        
        case 'stripes': {
          // Vertical stripes for wood
          if (secondaryColor && (px % 4 === 0 || px % 4 === 1)) {
            r = secondaryColor[0];
            g = secondaryColor[1];
            b = secondaryColor[2];
          }
          const noise = (Math.random() - 0.5) * 15;
          r = Math.max(0, Math.min(255, r + noise));
          g = Math.max(0, Math.min(255, g + noise));
          b = Math.max(0, Math.min(255, b + noise));
          break;
        }
        
        case 'checkers': {
          if ((px + py) % 2 === 0 && secondaryColor) {
            r = secondaryColor[0];
            g = secondaryColor[1];
            b = secondaryColor[2];
          }
          break;
        }
      }
      
      ctx.fillStyle = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
      ctx.fillRect(x + px, y + py, 1, 1);
    }
  }
}

/**
 * Create the full texture atlas
 */
export function createTextureAtlas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  
  // Fill with magenta for debugging (missing textures will be visible)
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  
  // Generate each texture
  for (const [indexStr, generator] of Object.entries(TEXTURE_GENERATORS)) {
    const index = parseInt(indexStr, 10);
    const col = index % TEXTURES_PER_ROW;
    const row = Math.floor(index / TEXTURES_PER_ROW);
    const x = col * TEXTURE_SIZE;
    const y = row * TEXTURE_SIZE;
    
    generateTexture(ctx, x, y, generator);
  }
  
  return canvas;
}

/**
 * Create a Three.js texture from the atlas
 */
export function createAtlasTexture(): THREE.CanvasTexture {
  const canvas = createTextureAtlas();
  const texture = new THREE.CanvasTexture(canvas);
  
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  
  return texture;
}

/**
 * Singleton texture atlas for the game
 */
let atlasTexture: THREE.CanvasTexture | null = null;

export function getAtlasTexture(): THREE.CanvasTexture {
  if (!atlasTexture) {
    atlasTexture = createAtlasTexture();
  }
  return atlasTexture;
}
