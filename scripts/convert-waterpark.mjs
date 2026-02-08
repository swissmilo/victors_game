/**
 * Convert parsed waterpark data to a compact binary format for game import.
 * Output: A TypeScript file with RLE-compressed waterpark data.
 */
import fs from 'fs';

const data = JSON.parse(fs.readFileSync('/tmp/waterpark-data.json', 'utf8'));

// Map Minecraft block names to our game's BlockType enum values
const BLOCK_TYPE_MAP = {
  'minecraft:air': 0,

  // Stone/cobblestone variants
  'minecraft:cobblestone': 8,
  'minecraft:stone_bricks': 23,
  'minecraft:mossy_stone_bricks': 23,
  'minecraft:cracked_stone_bricks': 23,
  'minecraft:chiseled_stone_bricks': 23,
  'minecraft:mossy_cobblestone': 8,
  'minecraft:cobblestone_wall': 8,
  'minecraft:stone_slab': 3,
  'minecraft:double_stone_slab': 3,
  'minecraft:stone_brick_stairs': 23,
  'minecraft:cobblestone_stairs': 8,

  // Wood
  'minecraft:oak_planks': 9,
  'minecraft:spruce_planks': 17,
  'minecraft:birch_planks': 9,
  'minecraft:jungle_planks': 9,
  'minecraft:acacia_planks': 17,
  'minecraft:dark_oak_planks': 17,
  'minecraft:oak_log': 4,
  'minecraft:spruce_log': 4,
  'minecraft:birch_log': 4,
  'minecraft:jungle_log': 4,
  'minecraft:acacia_log': 17,
  'minecraft:dark_oak_log': 17,
  'minecraft:oak_stairs': 9,
  'minecraft:spruce_stairs': 17,
  'minecraft:birch_stairs': 9,
  'minecraft:jungle_stairs': 9,
  'minecraft:acacia_stairs': 17,
  'minecraft:dark_oak_stairs': 17,
  'minecraft:oak_fence': 9,
  'minecraft:oak_fence_gate': 9,
  'minecraft:wooden_slab': 9,
  'minecraft:double_wooden_slab': 9,
  'minecraft:bookshelf': 9,

  // Leaves
  'minecraft:oak_leaves': 5,
  'minecraft:spruce_leaves': 5,
  'minecraft:birch_leaves': 5,
  'minecraft:jungle_leaves': 5,
  'minecraft:acacia_leaves': 5,
  'minecraft:dark_oak_leaves': 5,

  // Water/lava
  'minecraft:water': 7,
  'minecraft:flowing_water': 7,
  'minecraft:lava': 22,
  'minecraft:flowing_lava': 22,

  // Sand/sandstone
  'minecraft:sand': 6,
  'minecraft:sandstone': 6,
  'minecraft:smooth_sandstone': 6,
  'minecraft:chiseled_sandstone': 6,
  'minecraft:sandstone_stairs': 6,

  // Wool → mapped to closest game colors
  'minecraft:white_wool': 18,        // SNOW
  'minecraft:orange_wool': 19,       // ORANGE_GLASS (opaque now)
  'minecraft:magenta_wool': 16,      // RED_WOOL
  'minecraft:light_blue_wool': 18,   // SNOW (light)
  'minecraft:yellow_wool': 19,       // ORANGE_GLASS
  'minecraft:lime_wool': 5,          // LEAVES (green)
  'minecraft:pink_wool': 16,         // RED_WOOL
  'minecraft:gray_wool': 23,         // ANDESITE
  'minecraft:light_gray_wool': 23,   // ANDESITE
  'minecraft:cyan_wool': 15,         // TUFF
  'minecraft:purple_wool': 14,       // DEEPSLATE (dark)
  'minecraft:blue_wool': 7,          // WATER
  'minecraft:brown_wool': 17,        // DARK_OAK
  'minecraft:green_wool': 5,         // LEAVES
  'minecraft:red_wool': 16,          // RED_WOOL
  'minecraft:black_wool': 21,        // BLACK_GLASS (opaque now)

  // Glass
  'minecraft:glass': 18,             // SNOW (clear→white)
  'minecraft:glass_pane': 18,
  'minecraft:white_stained_glass': 18,
  'minecraft:orange_stained_glass': 19,
  'minecraft:yellow_stained_glass': 19,
  'minecraft:lime_stained_glass': 5,
  'minecraft:blue_stained_glass': 7,
  'minecraft:cyan_stained_glass': 15,
  'minecraft:light_blue_stained_glass': 18,
  'minecraft:red_stained_glass': 16,
  'minecraft:black_stained_glass': 21,
  'minecraft:white_stained_glass_pane': 18,
  'minecraft:orange_stained_glass_pane': 19,
  'minecraft:yellow_stained_glass_pane': 19,
  'minecraft:lime_stained_glass_pane': 5,
  'minecraft:blue_stained_glass_pane': 7,
  'minecraft:cyan_stained_glass_pane': 15,
  'minecraft:light_blue_stained_glass_pane': 18,
  'minecraft:red_stained_glass_pane': 16,
  'minecraft:black_stained_glass_pane': 21,

  // Terracotta
  'minecraft:hardened_clay': 20,           // DRIPSTONE
  'minecraft:white_terracotta': 18,        // SNOW
  'minecraft:orange_terracotta': 19,
  'minecraft:light_gray_terracotta': 23,   // ANDESITE
  'minecraft:gray_terracotta': 23,
  'minecraft:brown_terracotta': 20,        // DRIPSTONE
  'minecraft:red_terracotta': 16,          // RED_WOOL
  'minecraft:black_terracotta': 14,        // DEEPSLATE
  'minecraft:cyan_terracotta': 20,
  'minecraft:yellow_terracotta': 19,

  // Carpet (thin, map to AIR for cleaner look)
  'minecraft:white_carpet': 0,
  'minecraft:orange_carpet': 0,
  'minecraft:yellow_carpet': 0,
  'minecraft:lime_carpet': 0,
  'minecraft:red_carpet': 0,
  'minecraft:blue_carpet': 0,
  'minecraft:green_carpet': 0,
  'minecraft:black_carpet': 0,
  'minecraft:gray_carpet': 0,
  'minecraft:light_gray_carpet': 0,
  'minecraft:cyan_carpet': 0,
  'minecraft:magenta_carpet': 0,
  'minecraft:light_blue_carpet': 0,
  'minecraft:pink_carpet': 0,
  'minecraft:purple_carpet': 0,
  'minecraft:brown_carpet': 0,

  // Quartz (white)
  'minecraft:quartz_block': 18,      // SNOW
  'minecraft:chiseled_quartz_block': 18,
  'minecraft:quartz_pillar': 18,
  'minecraft:quartz_stairs': 18,

  // Misc
  'minecraft:gravel': 23,            // ANDESITE
  'minecraft:iron_bars': 23,         // ANDESITE
  'minecraft:iron_block': 23,
  'minecraft:gold_block': 19,        // ORANGE_GLASS
  'minecraft:diamond_block': 18,     // SNOW
  'minecraft:emerald_block': 5,      // LEAVES
  'minecraft:lapis_block': 7,        // WATER
  'minecraft:bricks': 16,            // RED_WOOL
  'minecraft:brick_stairs': 16,
  'minecraft:nether_bricks': 14,     // DEEPSLATE
  'minecraft:nether_brick_stairs': 14,
  'minecraft:nether_brick_fence': 14,
  'minecraft:netherrack': 16,
  'minecraft:soul_sand': 20,         // DRIPSTONE
  'minecraft:glowstone': 19,         // ORANGE_GLASS (glowing)
  'minecraft:redstone_block': 16,    // RED_WOOL
  'minecraft:redstone_lamp': 19,
  'minecraft:lit_redstone_lamp': 19,
  'minecraft:hay_block': 19,         // ORANGE_GLASS
  'minecraft:coal_block': 21,        // BLACK_GLASS
  'minecraft:packed_ice': 18,        // SNOW
  'minecraft:ice': 18,
  'minecraft:snow_block': 18,
  'minecraft:snow_layer': 0,         // AIR (thin)
  'minecraft:sponge': 19,
  'minecraft:obsidian': 11,          // OBSIDIAN
  'minecraft:cactus': 5,             // LEAVES
  'minecraft:pumpkin': 19,
  'minecraft:lit_pumpkin': 19,
  'minecraft:melon_block': 5,        // LEAVES
  'minecraft:tnt': 16,               // RED_WOOL
  'minecraft:clay': 20,              // DRIPSTONE
  'minecraft:farmland': 2,           // DIRT
  'minecraft:mycelium': 2,           // DIRT
  'minecraft:end_stone': 18,         // SNOW

  // Mechanical/decorative → AIR
  'minecraft:dispenser': 3,
  'minecraft:dropper': 3,
  'minecraft:hopper': 23,
  'minecraft:chest': 9,
  'minecraft:ender_chest': 14,
  'minecraft:trapped_chest': 9,
  'minecraft:crafting_table': 9,
  'minecraft:furnace': 3,
  'minecraft:lit_furnace': 3,
  'minecraft:jukebox': 17,
  'minecraft:noteblock': 17,
  'minecraft:anvil': 23,
  'minecraft:beacon': 18,
  'minecraft:command_block': 19,
  'minecraft:enchanting_table': 14,
  'minecraft:spawner': 14,

  // Missing types from MC 1.8
  'minecraft:red_mushroom_block': 16,  // RED_WOOL
  'minecraft:brown_mushroom_block': 17, // DARK_OAK
  'minecraft:gold_ore': 3,             // STONE
  'minecraft:gray_stained_glass': 23,  // ANDESITE
  'minecraft:gray_stained_glass_pane': 23,
  'minecraft:magenta_stained_glass': 16,
  'minecraft:magenta_stained_glass_pane': 16,
  'minecraft:purple_stained_glass': 14,
  'minecraft:purple_stained_glass_pane': 14,
  'minecraft:pink_stained_glass': 16,
  'minecraft:pink_stained_glass_pane': 16,
  'minecraft:brown_stained_glass': 20,
  'minecraft:brown_stained_glass_pane': 20,
  'minecraft:green_stained_glass': 5,
  'minecraft:green_stained_glass_pane': 5,

  // MC 1.8 additions
  'minecraft:red_sandstone': 6,         // SAND
  'minecraft:red_sandstone_stairs': 6,
  'minecraft:red_sandstone_slab': 6,
  'minecraft:double_red_sandstone_slab': 6,
  'minecraft:sea_lantern': 18,          // SNOW (glowing white)
  'minecraft:spruce_fence': 17,
  'minecraft:birch_fence': 9,
  'minecraft:jungle_fence': 9,
  'minecraft:dark_oak_fence': 17,
  'minecraft:acacia_fence': 17,

  // Rails/misc → AIR
  'minecraft:powered_rail': 0,
  'minecraft:detector_rail': 0,
  'minecraft:activator_rail': 0,
  'minecraft:rail': 0,
  'minecraft:redstone_wire': 0,
  'minecraft:torch': 0,
  'minecraft:fire': 0,
  'minecraft:standing_sign': 0,
  'minecraft:wall_sign': 0,
  'minecraft:standing_banner': 0,
  'minecraft:wall_banner': 0,
  'minecraft:flower_pot': 0,
  'minecraft:iron_trapdoor': 23,         // ANDESITE (metal)
  'minecraft:barrier': 0,
  'minecraft:unpowered_repeater': 0,
  'minecraft:powered_repeater': 0,
  'minecraft:spruce_door': 17,           // DARK_OAK
  'minecraft:birch_door': 9,             // PLANKS
  'minecraft:jungle_door': 9,
  'minecraft:acacia_door': 17,
  'minecraft:dark_oak_door': 17,
  'minecraft:oak_door': 9,
  'minecraft:iron_door': 23,             // ANDESITE
  'minecraft:spruce_fence_gate': 17,
  'minecraft:birch_fence_gate': 9,
  'minecraft:jungle_fence_gate': 9,
  'minecraft:dark_oak_fence_gate': 17,
  'minecraft:acacia_fence_gate': 17,
  'minecraft:trapdoor': 9,               // PLANKS
};

// Build 3D grid
const { bounds, dimensions } = data;
const W = dimensions.width;   // 233
const H = dimensions.height;  // 49
const D = dimensions.depth;   // 301

console.error(`Grid size: ${W}x${H}x${D} = ${W * H * D} voxels`);

const grid = new Uint8Array(W * D * H);

let mapped = 0;
let unmapped = 0;
const unmappedTypes = new Set();

for (const block of data.blocks) {
  const x = block.x - bounds.minX;
  const y = block.y - bounds.minY;
  const z = block.z - bounds.minZ;

  const blockType = BLOCK_TYPE_MAP[block.block];
  if (blockType !== undefined) {
    if (blockType !== 0) {
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

// RLE compress
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

const base64 = Buffer.from(rleArray).toString('base64');
console.error(`Base64 size: ${base64.length} chars`);

const tsContent = `// Auto-generated from Weather Land waterpark MC world
// Waterpark dimensions: ${W}x${H}x${D} (width x height x depth)
// Non-air blocks: ${mapped}

export const WATERPARK_WIDTH = ${W};
export const WATERPARK_HEIGHT = ${H};
export const WATERPARK_DEPTH = ${D};

// RLE-compressed block data (pairs of [count, blockType])
// Grid layout: index = x + z * WIDTH + y * WIDTH * DEPTH
const WATERPARK_DATA_BASE64 = '${base64}';

let decodedGrid: Uint8Array | null = null;

export function getWaterparkGrid(): Uint8Array {
  if (decodedGrid) return decodedGrid;

  const binary = atob(WATERPARK_DATA_BASE64);
  const rle = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    rle[i] = binary.charCodeAt(i);
  }

  const grid = new Uint8Array(WATERPARK_WIDTH * WATERPARK_DEPTH * WATERPARK_HEIGHT);
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

export function getWaterparkBlock(x: number, y: number, z: number): number {
  const grid = getWaterparkGrid();
  if (x < 0 || x >= WATERPARK_WIDTH || y < 0 || y >= WATERPARK_HEIGHT || z < 0 || z >= WATERPARK_DEPTH) {
    return 0;
  }
  return grid[x + z * WATERPARK_WIDTH + y * WATERPARK_WIDTH * WATERPARK_DEPTH];
}
`;

const outPath = '/Users/milo/Documents/victors_game/src/lib/waterparkData.ts';
fs.writeFileSync(outPath, tsContent);
console.error(`Written to ${outPath}`);
console.log('Done!');
