// Simple Perlin-like noise implementation for terrain generation

// Permutation table for noise
const permutation = [
  151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140,
  36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234,
  75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237,
  149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48,
  27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220, 105,
  92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73,
  209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86,
  164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38,
  147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189,
  28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101,
  155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232,
  178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12,
  191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31,
  181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254,
  138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215,
  61, 156, 180,
];

// Double the permutation table to avoid overflow
const p = [...permutation, ...permutation];

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(t: number, a: number, b: number): number {
  return a + t * (b - a);
}

function grad2D(hash: number, x: number, y: number): number {
  const h = hash & 3;
  const u = h < 2 ? x : y;
  const v = h < 2 ? y : x;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function grad3D(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/**
 * 2D Perlin noise function
 * @param x X coordinate
 * @param y Y coordinate
 * @returns Noise value between -1 and 1
 */
export function noise2D(x: number, y: number): number {
  // Find unit grid cell containing point
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;

  // Get relative position within cell
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);

  // Compute fade curves
  const u = fade(xf);
  const v = fade(yf);

  // Hash coordinates of the 4 cube corners
  const aa = p[p[X] + Y];
  const ab = p[p[X] + Y + 1];
  const ba = p[p[X + 1] + Y];
  const bb = p[p[X + 1] + Y + 1];

  // Blend results from 4 corners
  const x1 = lerp(u, grad2D(aa, xf, yf), grad2D(ba, xf - 1, yf));
  const x2 = lerp(u, grad2D(ab, xf, yf - 1), grad2D(bb, xf - 1, yf - 1));

  return lerp(v, x1, x2);
}

/**
 * 3D Perlin noise function
 * @param x X coordinate
 * @param y Y coordinate
 * @param z Z coordinate
 * @returns Noise value between -1 and 1
 */
export function noise3D(x: number, y: number, z: number): number {
  // Find unit grid cell containing point
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;

  // Get relative position within cell
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const zf = z - Math.floor(z);

  // Compute fade curves
  const u = fade(xf);
  const v = fade(yf);
  const w = fade(zf);

  // Hash coordinates of the 8 cube corners
  const aaa = p[p[p[X] + Y] + Z];
  const aba = p[p[p[X] + Y + 1] + Z];
  const aab = p[p[p[X] + Y] + Z + 1];
  const abb = p[p[p[X] + Y + 1] + Z + 1];
  const baa = p[p[p[X + 1] + Y] + Z];
  const bba = p[p[p[X + 1] + Y + 1] + Z];
  const bab = p[p[p[X + 1] + Y] + Z + 1];
  const bbb = p[p[p[X + 1] + Y + 1] + Z + 1];

  // Blend results from 8 corners
  const x1 = lerp(u, grad3D(aaa, xf, yf, zf), grad3D(baa, xf - 1, yf, zf));
  const x2 = lerp(u, grad3D(aba, xf, yf - 1, zf), grad3D(bba, xf - 1, yf - 1, zf));
  const y1 = lerp(v, x1, x2);

  const x3 = lerp(u, grad3D(aab, xf, yf, zf - 1), grad3D(bab, xf - 1, yf, zf - 1));
  const x4 = lerp(u, grad3D(abb, xf, yf - 1, zf - 1), grad3D(bbb, xf - 1, yf - 1, zf - 1));
  const y2 = lerp(v, x3, x4);

  return lerp(w, y1, y2);
}

/**
 * Fractal Brownian Motion - combines multiple octaves of noise
 * @param x X coordinate
 * @param y Y coordinate
 * @param octaves Number of noise layers
 * @param persistence How much each octave contributes
 * @param scale Initial scale of the noise
 * @returns Noise value normalized to roughly 0-1
 */
export function fbm(
  x: number,
  y: number,
  octaves: number = 4,
  persistence: number = 0.5,
  scale: number = 0.01
): number {
  let total = 0;
  let frequency = scale;
  let amplitude = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    total += noise2D(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }

  // Normalize to 0-1 range
  return (total / maxValue + 1) / 2;
}

/**
 * 3D Fractal Brownian Motion for caves
 * @param x X coordinate
 * @param y Y coordinate
 * @param z Z coordinate
 * @param octaves Number of noise layers
 * @param persistence How much each octave contributes
 * @param scale Initial scale of the noise
 * @returns Noise value normalized to roughly 0-1
 */
export function fbm3D(
  x: number,
  y: number,
  z: number,
  octaves: number = 3,
  persistence: number = 0.5,
  scale: number = 0.05
): number {
  let total = 0;
  let frequency = scale;
  let amplitude = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    total += noise3D(x * frequency, y * frequency, z * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }

  // Normalize to 0-1 range
  return (total / maxValue + 1) / 2;
}

/**
 * Ridge noise - creates sharp ridges useful for mountain peaks
 * @param x X coordinate
 * @param y Y coordinate
 * @param scale Scale of the noise
 * @returns Noise value between 0 and 1
 */
export function ridgeNoise(x: number, y: number, scale: number = 0.01): number {
  const n = noise2D(x * scale, y * scale);
  return 1 - Math.abs(n);
}

/**
 * Multi-octave ridge noise for dramatic mountain ranges
 */
export function ridgeFbm(
  x: number,
  y: number,
  octaves: number = 4,
  persistence: number = 0.5,
  scale: number = 0.01
): number {
  let total = 0;
  let frequency = scale;
  let amplitude = 1;
  let maxValue = 0;
  let weight = 1;

  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise2D(x * frequency, y * frequency));
    // Weight successive octaves by previous
    const weighted = n * n * weight;
    weight = Math.min(1, weighted * 2);
    
    total += weighted * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }

  return total / maxValue;
}

/**
 * Domain warping - distorts coordinates for more organic shapes
 */
export function warpedFbm(
  x: number,
  y: number,
  octaves: number = 4,
  persistence: number = 0.5,
  scale: number = 0.01,
  warpStrength: number = 20
): number {
  // First pass - get warp offsets
  const warpX = fbm(x + 100, y + 100, 2, 0.5, scale * 0.5);
  const warpY = fbm(x + 200, y + 200, 2, 0.5, scale * 0.5);
  
  // Apply warping
  const warpedX = x + (warpX - 0.5) * warpStrength;
  const warpedY = y + (warpY - 0.5) * warpStrength;
  
  // Get noise at warped coordinates
  return fbm(warpedX, warpedY, octaves, persistence, scale);
}

/**
 * Voronoi-like noise for creating distinct regions
 */
export function cellNoise(x: number, y: number, scale: number = 0.02): number {
  const sx = x * scale;
  const sy = y * scale;
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  
  let minDist = 10;
  
  // Check 3x3 neighborhood
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const cx = ix + dx;
      const cy = iy + dy;
      // Pseudo-random point in cell
      const px = cx + (noise2D(cx * 127.1, cy * 311.7) + 1) * 0.5;
      const py = cy + (noise2D(cx * 269.5, cy * 183.3) + 1) * 0.5;
      
      const dist = Math.sqrt((sx - px) * (sx - px) + (sy - py) * (sy - py));
      minDist = Math.min(minDist, dist);
    }
  }
  
  return minDist;
}
