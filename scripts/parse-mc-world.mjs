/**
 * Parse a Minecraft world save (.mca region files) and extract block data.
 * Supports MC 1.8+ Anvil format.
 * Output: JSON with dimensions and block positions (same format as parse-litematic.mjs)
 */
import fs from 'fs';
import zlib from 'zlib';
import { parse } from 'prismarine-nbt';

// MC 1.8 block IDs to names (the ones we care about)
const BLOCK_ID_NAMES = {
  0: 'minecraft:air',
  1: 'minecraft:stone',
  2: 'minecraft:grass_block',
  3: 'minecraft:dirt',
  4: 'minecraft:cobblestone',
  5: 'minecraft:oak_planks',  // All wood planks (data value determines type)
  6: 'minecraft:sapling',
  7: 'minecraft:bedrock',
  8: 'minecraft:flowing_water',
  9: 'minecraft:water',
  10: 'minecraft:flowing_lava',
  11: 'minecraft:lava',
  12: 'minecraft:sand',
  13: 'minecraft:gravel',
  14: 'minecraft:gold_ore',
  15: 'minecraft:iron_ore',
  16: 'minecraft:coal_ore',
  17: 'minecraft:oak_log',     // All logs
  18: 'minecraft:oak_leaves',  // All leaves
  19: 'minecraft:sponge',
  20: 'minecraft:glass',
  21: 'minecraft:lapis_ore',
  22: 'minecraft:lapis_block',
  23: 'minecraft:dispenser',
  24: 'minecraft:sandstone',
  25: 'minecraft:noteblock',
  26: 'minecraft:bed',
  27: 'minecraft:powered_rail',
  28: 'minecraft:detector_rail',
  29: 'minecraft:sticky_piston',
  30: 'minecraft:cobweb',
  31: 'minecraft:tall_grass',
  32: 'minecraft:dead_bush',
  33: 'minecraft:piston',
  34: 'minecraft:piston_head',
  35: 'minecraft:wool',         // Colored wool (data value = color)
  37: 'minecraft:dandelion',
  38: 'minecraft:poppy',
  39: 'minecraft:brown_mushroom',
  40: 'minecraft:red_mushroom',
  41: 'minecraft:gold_block',
  42: 'minecraft:iron_block',
  43: 'minecraft:double_stone_slab',
  44: 'minecraft:stone_slab',
  45: 'minecraft:bricks',
  46: 'minecraft:tnt',
  47: 'minecraft:bookshelf',
  48: 'minecraft:mossy_cobblestone',
  49: 'minecraft:obsidian',
  50: 'minecraft:torch',
  51: 'minecraft:fire',
  52: 'minecraft:spawner',
  53: 'minecraft:oak_stairs',
  54: 'minecraft:chest',
  55: 'minecraft:redstone_wire',
  56: 'minecraft:diamond_ore',
  57: 'minecraft:diamond_block',
  58: 'minecraft:crafting_table',
  59: 'minecraft:wheat',
  60: 'minecraft:farmland',
  61: 'minecraft:furnace',
  62: 'minecraft:lit_furnace',
  63: 'minecraft:standing_sign',
  64: 'minecraft:oak_door',
  65: 'minecraft:ladder',
  66: 'minecraft:rail',
  67: 'minecraft:cobblestone_stairs',
  68: 'minecraft:wall_sign',
  69: 'minecraft:lever',
  70: 'minecraft:stone_pressure_plate',
  71: 'minecraft:iron_door',
  72: 'minecraft:wooden_pressure_plate',
  73: 'minecraft:redstone_ore',
  74: 'minecraft:lit_redstone_ore',
  75: 'minecraft:unlit_redstone_torch',
  76: 'minecraft:redstone_torch',
  77: 'minecraft:stone_button',
  78: 'minecraft:snow_layer',
  79: 'minecraft:ice',
  80: 'minecraft:snow_block',
  81: 'minecraft:cactus',
  82: 'minecraft:clay',
  83: 'minecraft:sugar_cane',
  84: 'minecraft:jukebox',
  85: 'minecraft:oak_fence',
  86: 'minecraft:pumpkin',
  87: 'minecraft:netherrack',
  88: 'minecraft:soul_sand',
  89: 'minecraft:glowstone',
  90: 'minecraft:portal',
  91: 'minecraft:lit_pumpkin',
  92: 'minecraft:cake',
  95: 'minecraft:stained_glass',      // Colored glass
  96: 'minecraft:trapdoor',
  97: 'minecraft:monster_egg',
  98: 'minecraft:stone_bricks',        // Stone brick variants
  99: 'minecraft:brown_mushroom_block',
  100: 'minecraft:red_mushroom_block',
  101: 'minecraft:iron_bars',
  102: 'minecraft:glass_pane',
  103: 'minecraft:melon_block',
  106: 'minecraft:vine',
  107: 'minecraft:oak_fence_gate',
  108: 'minecraft:brick_stairs',
  109: 'minecraft:stone_brick_stairs',
  110: 'minecraft:mycelium',
  111: 'minecraft:lily_pad',
  112: 'minecraft:nether_bricks',
  113: 'minecraft:nether_brick_fence',
  114: 'minecraft:nether_brick_stairs',
  116: 'minecraft:enchanting_table',
  118: 'minecraft:cauldron',
  120: 'minecraft:end_portal_frame',
  121: 'minecraft:end_stone',
  123: 'minecraft:redstone_lamp',
  124: 'minecraft:lit_redstone_lamp',
  125: 'minecraft:double_wooden_slab',
  126: 'minecraft:wooden_slab',
  128: 'minecraft:sandstone_stairs',
  129: 'minecraft:emerald_ore',
  130: 'minecraft:ender_chest',
  131: 'minecraft:tripwire_hook',
  133: 'minecraft:emerald_block',
  134: 'minecraft:spruce_stairs',
  135: 'minecraft:birch_stairs',
  136: 'minecraft:jungle_stairs',
  137: 'minecraft:command_block',
  138: 'minecraft:beacon',
  139: 'minecraft:cobblestone_wall',
  141: 'minecraft:carrots',
  142: 'minecraft:potatoes',
  143: 'minecraft:wooden_button',
  144: 'minecraft:skull',
  145: 'minecraft:anvil',
  146: 'minecraft:trapped_chest',
  147: 'minecraft:light_weighted_pressure_plate',
  148: 'minecraft:heavy_weighted_pressure_plate',
  149: 'minecraft:unpowered_comparator',
  150: 'minecraft:powered_comparator',
  151: 'minecraft:daylight_detector',
  152: 'minecraft:redstone_block',
  153: 'minecraft:quartz_ore',
  154: 'minecraft:hopper',
  155: 'minecraft:quartz_block',
  156: 'minecraft:quartz_stairs',
  157: 'minecraft:activator_rail',
  158: 'minecraft:dropper',
  159: 'minecraft:stained_hardened_clay', // Colored terracotta
  160: 'minecraft:stained_glass_pane',    // Colored glass pane
  161: 'minecraft:leaves2',               // Acacia/dark oak leaves
  162: 'minecraft:log2',                  // Acacia/dark oak log
  163: 'minecraft:acacia_stairs',
  164: 'minecraft:dark_oak_stairs',
  170: 'minecraft:hay_block',
  171: 'minecraft:carpet',               // Colored carpet
  172: 'minecraft:hardened_clay',         // Terracotta
  173: 'minecraft:coal_block',
  174: 'minecraft:packed_ice',
  175: 'minecraft:double_plant',
  176: 'minecraft:standing_banner',
  177: 'minecraft:wall_banner',
  179: 'minecraft:red_sandstone',
  180: 'minecraft:red_sandstone_stairs',
  181: 'minecraft:double_red_sandstone_slab',
  182: 'minecraft:red_sandstone_slab',
  183: 'minecraft:spruce_fence_gate',
  184: 'minecraft:birch_fence_gate',
  185: 'minecraft:jungle_fence_gate',
  186: 'minecraft:dark_oak_fence_gate',
  187: 'minecraft:acacia_fence_gate',
  188: 'minecraft:spruce_fence',
  189: 'minecraft:birch_fence',
  190: 'minecraft:jungle_fence',
  191: 'minecraft:dark_oak_fence',
  192: 'minecraft:acacia_fence',
  193: 'minecraft:spruce_door',
  194: 'minecraft:birch_door',
  195: 'minecraft:jungle_door',
  196: 'minecraft:acacia_door',
  197: 'minecraft:dark_oak_door',
  140: 'minecraft:flower_pot',
  167: 'minecraft:iron_trapdoor',
  169: 'minecraft:sea_lantern',
  166: 'minecraft:barrier',
  93: 'minecraft:unpowered_repeater',
  94: 'minecraft:powered_repeater',
};

// Wool/glass/terracotta color data values
const COLOR_NAMES = [
  'white', 'orange', 'magenta', 'light_blue',
  'yellow', 'lime', 'pink', 'gray',
  'light_gray', 'cyan', 'purple', 'blue',
  'brown', 'green', 'red', 'black'
];

// Resolve block name with data value for colored blocks
function resolveBlockName(blockId, dataValue) {
  // Wool
  if (blockId === 35) {
    return `minecraft:${COLOR_NAMES[dataValue & 0xF]}_wool`;
  }
  // Stained glass
  if (blockId === 95) {
    return `minecraft:${COLOR_NAMES[dataValue & 0xF]}_stained_glass`;
  }
  // Stained glass pane
  if (blockId === 160) {
    return `minecraft:${COLOR_NAMES[dataValue & 0xF]}_stained_glass_pane`;
  }
  // Stained clay (terracotta)
  if (blockId === 159) {
    return `minecraft:${COLOR_NAMES[dataValue & 0xF]}_terracotta`;
  }
  // Carpet
  if (blockId === 171) {
    return `minecraft:${COLOR_NAMES[dataValue & 0xF]}_carpet`;
  }
  // Planks
  if (blockId === 5) {
    const types = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak'];
    return `minecraft:${types[dataValue & 0x7] || 'oak'}_planks`;
  }
  // Logs
  if (blockId === 17) {
    const types = ['oak', 'spruce', 'birch', 'jungle'];
    return `minecraft:${types[dataValue & 0x3] || 'oak'}_log`;
  }
  if (blockId === 162) {
    const types = ['acacia', 'dark_oak'];
    return `minecraft:${types[dataValue & 0x1] || 'acacia'}_log`;
  }
  // Stone brick variants
  if (blockId === 98) {
    const variants = ['stone_bricks', 'mossy_stone_bricks', 'cracked_stone_bricks', 'chiseled_stone_bricks'];
    return `minecraft:${variants[dataValue & 0x3] || 'stone_bricks'}`;
  }
  // Sandstone variants
  if (blockId === 24) {
    const variants = ['sandstone', 'chiseled_sandstone', 'smooth_sandstone'];
    return `minecraft:${variants[dataValue & 0x3] || 'sandstone'}`;
  }
  // Leaves
  if (blockId === 18) {
    const types = ['oak', 'spruce', 'birch', 'jungle'];
    return `minecraft:${types[dataValue & 0x3] || 'oak'}_leaves`;
  }
  if (blockId === 161) {
    const types = ['acacia', 'dark_oak'];
    return `minecraft:${types[dataValue & 0x1] || 'acacia'}_leaves`;
  }
  // Quartz variants
  if (blockId === 155) {
    if (dataValue === 1) return 'minecraft:chiseled_quartz_block';
    if (dataValue >= 2) return 'minecraft:quartz_pillar';
    return 'minecraft:quartz_block';
  }

  return BLOCK_ID_NAMES[blockId] || `minecraft:unknown_${blockId}`;
}

// Read a region file and extract chunk data
async function readRegionFile(filePath) {
  const data = fs.readFileSync(filePath);
  const chunks = [];

  // Parse header: 1024 entries, 4 bytes each
  for (let i = 0; i < 1024; i++) {
    const offset = data.readUInt8(i * 4) << 16 | data.readUInt8(i * 4 + 1) << 8 | data.readUInt8(i * 4 + 2);
    const sectorCount = data.readUInt8(i * 4 + 3);

    if (offset === 0 || sectorCount === 0) continue;

    const byteOffset = offset * 4096;
    if (byteOffset >= data.length) continue;

    // Read chunk data
    const length = data.readUInt32BE(byteOffset);
    const compressionType = data.readUInt8(byteOffset + 4);

    if (length <= 1 || byteOffset + 5 + length - 1 > data.length) continue;

    const compressedData = data.subarray(byteOffset + 5, byteOffset + 4 + length);

    try {
      let decompressed;
      if (compressionType === 1) {
        decompressed = zlib.gunzipSync(compressedData);
      } else if (compressionType === 2) {
        decompressed = zlib.inflateSync(compressedData);
      } else {
        continue;
      }

      const { parsed } = await parse(decompressed);
      const chunkX = i % 32;
      const chunkZ = Math.floor(i / 32);
      chunks.push({ chunkX, chunkZ, nbt: parsed });
    } catch (e) {
      // Skip corrupt chunks
    }
  }

  return chunks;
}

async function main() {
  const worldPath = process.argv[2] || '/Users/milo/Downloads/Weather Land by lordnoahn1 1_8';
  const regionDir = `${worldPath}/region`;
  const regionFiles = fs.readdirSync(regionDir).filter(f => f.endsWith('.mca'));

  console.error(`Found ${regionFiles.length} region files`);

  const allBlocks = [];
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  // Skip these block types (terrain, non-solid, decorative, redstone, etc.)
  const SKIP_BLOCKS = new Set([
    0,    // air
    1,    // stone (underground)
    2,    // grass_block (terrain)
    3,    // dirt (terrain)
    7,    // bedrock
    6,    // sapling
    26,   // bed
    27, 28, 66, 157, // rails
    30,   // cobweb
    31, 32, // tall grass, dead bush
    33, 34, 29, // pistons
    37, 38, // flowers
    39, 40, // mushrooms
    50,   // torch
    51,   // fire
    55,   // redstone wire
    59,   // wheat
    63, 68, // signs
    65,   // ladder
    69,   // lever
    70, 72, 147, 148, // pressure plates
    75, 76, // redstone torches
    77, 143, // buttons
    83,   // sugar cane
    90,   // portal
    92,   // cake
    // 96 = trapdoor - keep for solid mapping
    106,  // vine
    111,  // lily pad
    116,  // enchanting table
    118,  // cauldron
    120,  // end portal frame
    131,  // tripwire hook
    141, 142, // crops
    144,  // skull
    149, 150, 151, // comparators, daylight sensor
    175,  // double plant
  ]);

  for (const regionFile of regionFiles) {
    // Parse region coordinates from filename (r.X.Z.mca)
    const match = regionFile.match(/r\.(-?\d+)\.(-?\d+)\.mca/);
    if (!match) continue;

    const regionX = parseInt(match[1]);
    const regionZ = parseInt(match[2]);

    console.error(`Processing region ${regionX},${regionZ} (${regionFile})`);

    const chunks = await readRegionFile(`${regionDir}/${regionFile}`);
    console.error(`  ${chunks.length} chunks found`);

    for (const chunk of chunks) {
      const level = chunk.nbt.value?.Level?.value;
      if (!level) continue;

      const chunkWorldX = (regionX * 32 + chunk.chunkX) * 16;
      const chunkWorldZ = (regionZ * 32 + chunk.chunkZ) * 16;

      // Get sections
      const sections = level.Sections?.value?.value;
      if (!sections) continue;

      for (const section of sections) {
        const sectionY = section.Y?.value;
        if (sectionY === undefined) continue;

        const blocks = section.Blocks?.value;
        if (!blocks) continue;

        // Data values (4 bits per block, nibble array)
        const blockData = section.Data?.value;

        // Optional Add array for block IDs > 255
        const addArray = section.Add?.value;

        for (let y = 0; y < 16; y++) {
          for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
              const idx = (y * 16 + z) * 16 + x;
              let blockId = blocks[idx] & 0xFF; // Ensure unsigned

              // Handle Add array (extends block ID to 12 bits)
              if (addArray) {
                const addIdx = idx >> 1;
                const addVal = (idx & 1) === 0
                  ? addArray[addIdx] & 0xF
                  : (addArray[addIdx] >> 4) & 0xF;
                blockId |= (addVal << 8);
              }

              if (blockId === 0 || SKIP_BLOCKS.has(blockId)) continue;

              // Get data value
              let dataValue = 0;
              if (blockData) {
                const dataIdx = idx >> 1;
                dataValue = (idx & 1) === 0
                  ? blockData[dataIdx] & 0xF
                  : (blockData[dataIdx] >> 4) & 0xF;
              }

              const wx = chunkWorldX + x;
              const wy = sectionY * 16 + y;
              const wz = chunkWorldZ + z;

              const blockName = resolveBlockName(blockId, dataValue);

              minX = Math.min(minX, wx);
              minY = Math.min(minY, wy);
              minZ = Math.min(minZ, wz);
              maxX = Math.max(maxX, wx);
              maxY = Math.max(maxY, wy);
              maxZ = Math.max(maxZ, wz);

              allBlocks.push({ x: wx, y: wy, z: wz, block: blockName });
            }
          }
        }
      }
    }
  }

  console.error(`\n=== SUMMARY ===`);
  console.error(`Total non-air blocks: ${allBlocks.length}`);
  console.error(`Bounding box: (${minX},${minY},${minZ}) to (${maxX},${maxY},${maxZ})`);
  console.error(`Dimensions: ${maxX - minX + 1} x ${maxY - minY + 1} x ${maxZ - minZ + 1}`);

  // Count block types
  const blockCounts = {};
  for (const b of allBlocks) {
    blockCounts[b.block] = (blockCounts[b.block] || 0) + 1;
  }
  console.error('\nTop block types:');
  for (const [name, count] of Object.entries(blockCounts).sort((a, b) => b[1] - a[1]).slice(0, 30)) {
    console.error(`  ${name}: ${count}`);
  }

  // Output JSON
  const output = {
    bounds: { minX, minY, minZ, maxX, maxY, maxZ },
    dimensions: {
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      depth: maxZ - minZ + 1
    },
    blockCount: allBlocks.length,
    blocks: allBlocks
  };

  console.log(JSON.stringify(output));
}

main().catch(e => { console.error(e); process.exit(1); });
