/**
 * Convert parsed litematic castle data to a compact binary format for game import.
 * Output: A TypeScript file with RLE-compressed castle data.
 */
import fs from 'fs';

const data = JSON.parse(fs.readFileSync('/tmp/castle-data.json', 'utf8'));

// Map Minecraft block names to our game's BlockType enum values
const BLOCK_TYPE_MAP = {
  // Existing types
  'minecraft:air': 0,
  'minecraft:grass_block': 1,
  'minecraft:dirt': 2,
  'minecraft:stone': 3,
  'minecraft:oak_log': 4,
  'minecraft:oak_wood': 4,
  'minecraft:oak_leaves': 5,
  'minecraft:sand': 6,
  'minecraft:water': 7,
  'minecraft:cobblestone': 8,
  'minecraft:oak_planks': 9,

  // New types - DEEPSLATE (14) - dark stone
  'minecraft:deepslate_bricks': 14,
  'minecraft:deepslate_tiles': 14,
  'minecraft:deepslate': 14,
  'minecraft:deepslate_brick_wall': 14,
  'minecraft:deepslate_brick_stairs': 14,
  'minecraft:deepslate_brick_slab': 14,
  'minecraft:deepslate_tile_wall': 14,
  'minecraft:deepslate_tile_stairs': 14,
  'minecraft:deepslate_tile_slab': 14,
  'minecraft:cobbled_deepslate': 14,
  'minecraft:cobbled_deepslate_stairs': 14,
  'minecraft:cobbled_deepslate_wall': 14,
  'minecraft:cobbled_deepslate_slab': 14,
  'minecraft:polished_deepslate': 14,
  'minecraft:polished_deepslate_stairs': 14,
  'minecraft:polished_deepslate_wall': 14,
  'minecraft:polished_deepslate_slab': 14,
  'minecraft:polished_blackstone': 14,
  'minecraft:polished_blackstone_stairs': 14,
  'minecraft:polished_blackstone_wall': 14,
  'minecraft:polished_blackstone_slab': 14,
  'minecraft:polished_blackstone_bricks': 14,
  'minecraft:polished_blackstone_brick_stairs': 14,
  'minecraft:blackstone': 14,

  // TUFF (15) - medium gray stone
  'minecraft:tuff': 15,
  'minecraft:tuff_bricks': 15,
  'minecraft:tuff_brick_wall': 15,
  'minecraft:tuff_brick_stairs': 15,
  'minecraft:tuff_brick_slab': 15,
  'minecraft:tuff_stairs': 15,
  'minecraft:tuff_wall': 15,
  'minecraft:tuff_slab': 15,
  'minecraft:polished_tuff': 15,
  'minecraft:polished_tuff_stairs': 15,
  'minecraft:polished_tuff_wall': 15,
  'minecraft:polished_tuff_slab': 15,

  // RED_WOOL (16) - red blocks
  'minecraft:red_wool': 16,
  'minecraft:red_mushroom_block': 16,
  'minecraft:netherrack': 16,
  'minecraft:red_glazed_terracotta': 16,
  'minecraft:red_stained_glass': 16,
  'minecraft:red_stained_glass_pane': 14, // Panes → DEEPSLATE (blend with dark walls)
  'minecraft:red_concrete_powder': 16,
  'minecraft:red_sand': 16,
  'minecraft:red_sandstone': 16,
  'minecraft:chiseled_red_sandstone': 16,
  'minecraft:crimson_stem': 16,

  // DARK_OAK (17) - dark wood
  'minecraft:dark_oak_planks': 17,
  'minecraft:acacia_planks': 17,
  'minecraft:acacia_stairs': 17,
  'minecraft:spruce_planks': 17,
  'minecraft:mangrove_planks': 17,
  'minecraft:stripped_acacia_wood': 17,
  'minecraft:stripped_spruce_wood': 17,
  'minecraft:stripped_mangrove_log': 17,

  // SNOW (18) - white blocks
  'minecraft:snow': 0,          // Snow LAYER (thin cap) - too thin for full block, skip
  'minecraft:snow_block': 18,
  'minecraft:calcite': 18,
  'minecraft:ice': 18,
  'minecraft:white_wool': 18,
  'minecraft:bone_block': 18,
  'minecraft:polished_diorite': 18,

  // ORANGE_GLASS (19) - orange (full glass blocks stay orange)
  'minecraft:orange_stained_glass': 19,
  'minecraft:orange_stained_glass_pane': 15, // Panes → TUFF (blend with walls)
  'minecraft:orange_concrete': 19,
  'minecraft:orange_wool': 19,
  'minecraft:shroomlight': 19, // Glowing orange
  'minecraft:yellow_wool': 19,

  // DRIPSTONE (20) - brownish stone
  'minecraft:dripstone_block': 20,
  'minecraft:clay': 20,
  'minecraft:cyan_terracotta': 20,

  // BLACK_GLASS (21) - dark blocks
  'minecraft:black_stained_glass': 21,
  'minecraft:black_stained_glass_pane': 14, // Panes → DEEPSLATE (blend with dark walls)
  'minecraft:black_concrete': 21,
  'minecraft:black_wool': 21,
  'minecraft:black_glazed_terracotta': 21,

  // MAGMA (22) - glowing orange-red
  'minecraft:magma_block': 22,
  'minecraft:lava': 22,

  // ANDESITE_BLOCK (23) - gray stone variants
  'minecraft:andesite': 23,
  'minecraft:diorite': 23,
  'minecraft:granite': 23,
  'minecraft:gravel': 23,
  'minecraft:stone_bricks': 23,
  'minecraft:stone_brick_wall': 23,
  'minecraft:stone_brick_stairs': 23,
  'minecraft:stone_brick_slab': 23,
  'minecraft:mossy_stone_bricks': 23,
  'minecraft:cracked_stone_bricks': 23,
  'minecraft:gray_wool': 23,
  'minecraft:gray_concrete_powder': 23,
  'minecraft:light_gray_wool': 23,

  // Map remaining to closest match
  'minecraft:copper_ore': 3,      // stone-like
  'minecraft:iron_ore': 3,
  'minecraft:coal_ore': 3,
  'minecraft:gold_ore': 3,
  'minecraft:emerald_ore': 3,
  'minecraft:glow_lichen': 5,     // leaves-like
  'minecraft:cave_vines': 5,
  'minecraft:cave_vines_plant': 5,
  'minecraft:moss_block': 5,
  'minecraft:moss_carpet': 5,
  'minecraft:pale_moss_block': 5,
  'minecraft:flowering_azalea': 5,
  'minecraft:short_grass': 0,     // air (non-solid decoration)
  'minecraft:green_wool': 5,
  'minecraft:lime_wool': 5,
};

// Build 3D grid
const { bounds, dimensions } = data;
const W = dimensions.width;   // 97
const H = dimensions.height;  // 151
const D = dimensions.depth;   // 104

console.error(`Grid size: ${W}x${H}x${D} = ${W * H * D} voxels`);

// Create a flat 3D array (x + z*W + y*W*D)
const grid = new Uint8Array(W * D * H); // All zeros = AIR

let mapped = 0;
let unmapped = 0;
const unmappedTypes = new Set();

for (const block of data.blocks) {
  const x = block.x - bounds.minX;
  const y = block.y - bounds.minY;
  const z = block.z - bounds.minZ;

  const blockType = BLOCK_TYPE_MAP[block.block];
  if (blockType !== undefined) {
    if (blockType !== 0) { // Skip air
      const idx = x + z * W + y * W * D;
      grid[idx] = blockType;
      mapped++;
    }
  } else {
    unmapped++;
    unmappedTypes.add(block.block);
  }
}

console.error(`Mapped: ${mapped}, Unmapped: ${unmapped}`);
if (unmappedTypes.size > 0) {
  console.error('Unmapped types:', [...unmappedTypes]);
}

// RLE compress the grid
// Format: pairs of [count, blockType], where count can be up to 255
// For longer runs, use multiple entries
const rle = [];
let currentBlock = grid[0];
let currentCount = 1;

for (let i = 1; i < grid.length; i++) {
  if (grid[i] === currentBlock && currentCount < 255) {
    currentCount++;
  } else {
    rle.push(currentCount, currentBlock);
    currentBlock = grid[i];
    currentCount = 1;
  }
}
rle.push(currentCount, currentBlock);

const rleArray = new Uint8Array(rle);
console.error(`Original size: ${grid.length} bytes`);
console.error(`RLE size: ${rleArray.length} bytes`);
console.error(`Compression ratio: ${(rleArray.length / grid.length * 100).toFixed(1)}%`);

// Base64 encode
const base64 = Buffer.from(rleArray).toString('base64');
console.error(`Base64 size: ${base64.length} chars`);

// Generate TypeScript module
const tsContent = `// Auto-generated from Dark-Fantasy-Castle.litematic
// Castle dimensions: ${W}x${H}x${D} (width x height x depth)
// Non-air blocks: ${mapped}

export const CASTLE_WIDTH = ${W};
export const CASTLE_HEIGHT = ${H};
export const CASTLE_DEPTH = ${D};

// RLE-compressed block data (pairs of [count, blockType])
// Grid layout: index = x + z * WIDTH + y * WIDTH * DEPTH
const CASTLE_DATA_BASE64 = '${base64}';

let decodedGrid: Uint8Array | null = null;

export function getCastleGrid(): Uint8Array {
  if (decodedGrid) return decodedGrid;

  // Decode base64
  const binary = atob(CASTLE_DATA_BASE64);
  const rle = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    rle[i] = binary.charCodeAt(i);
  }

  // Decompress RLE
  const grid = new Uint8Array(CASTLE_WIDTH * CASTLE_DEPTH * CASTLE_HEIGHT);
  let writeIdx = 0;
  for (let i = 0; i < rle.length; i += 2) {
    const count = rle[i];
    const block = rle[i + 1];
    for (let j = 0; j < count; j++) {
      grid[writeIdx++] = block;
    }
  }

  decodedGrid = grid;
  return grid;
}

export function getCastleBlock(x: number, y: number, z: number): number {
  const grid = getCastleGrid();
  if (x < 0 || x >= CASTLE_WIDTH || y < 0 || y >= CASTLE_HEIGHT || z < 0 || z >= CASTLE_DEPTH) {
    return 0; // AIR
  }
  return grid[x + z * CASTLE_WIDTH + y * CASTLE_WIDTH * CASTLE_DEPTH];
}
`;

// Write TypeScript file
const outPath = '/Users/milo/Documents/victors_game/src/lib/castleData.ts';
fs.writeFileSync(outPath, tsContent);
console.error(`Written to ${outPath}`);
console.log('Done!');
