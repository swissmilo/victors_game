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

function grad(hash: number, x: number, y: number): number {
  const h = hash & 3;
  const u = h < 2 ? x : y;
  const v = h < 2 ? y : x;
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
  const x1 = lerp(u, grad(aa, xf, yf), grad(ba, xf - 1, yf));
  const x2 = lerp(u, grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1));

  return lerp(v, x1, x2);
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
