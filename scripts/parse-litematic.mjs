/**
 * Parse a Litematica .litematic file and extract block data
 * Output: JSON with dimensions, palette, and block positions
 */
import fs from 'fs';
import { parse } from 'prismarine-nbt';

async function parseLitematic(filePath) {
  const buffer = fs.readFileSync(filePath);
  const { parsed } = await parse(buffer);

  const root = parsed.value;

  // Print top-level keys
  console.error('Top-level keys:', Object.keys(root));

  // Litematica format stores regions
  const regions = root.Regions?.value;
  if (!regions) {
    console.error('No Regions found. Full structure:', JSON.stringify(parsed, null, 2).slice(0, 5000));
    return;
  }

  console.error('Regions:', Object.keys(regions));

  const allBlocks = [];
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const [regionName, regionData] of Object.entries(regions)) {
    const region = regionData.value;
    console.error(`\nRegion: ${regionName}`);
    console.error('Region keys:', Object.keys(region));

    // Get dimensions
    const size = region.Size?.value;
    const sizeX = Math.abs(size?.x?.value || 0);
    const sizeY = Math.abs(size?.y?.value || 0);
    const sizeZ = Math.abs(size?.z?.value || 0);
    console.error(`Size: ${sizeX} x ${sizeY} x ${sizeZ}`);

    // Get position offset
    const pos = region.Position?.value;
    const posX = pos?.x?.value || 0;
    const posY = pos?.y?.value || 0;
    const posZ = pos?.z?.value || 0;
    console.error(`Position: ${posX}, ${posY}, ${posZ}`);

    // Get block state palette
    const palette = region.BlockStatePalette?.value?.value;
    if (!palette) {
      console.error('No BlockStatePalette found');
      continue;
    }

    console.error(`Palette size: ${palette.length}`);

    // Print palette entries (block names)
    const paletteNames = palette.map((entry, i) => {
      const name = entry.Name?.value || 'unknown';
      const props = entry.Properties?.value;
      return { index: i, name, properties: props };
    });

    // Count unique block names
    const uniqueNames = new Set(paletteNames.map(p => p.name));
    console.error(`Unique block types: ${uniqueNames.size}`);
    for (const name of [...uniqueNames].sort()) {
      console.error(`  - ${name}`);
    }

    // Get block data (packed long array)
    const blockStates = region.BlockStates?.value;
    if (!blockStates) {
      console.error('No BlockStates found');
      continue;
    }

    console.error(`BlockStates array length: ${blockStates.length}`);

    // Calculate bits per entry
    const bitsPerEntry = Math.max(2, Math.ceil(Math.log2(palette.length)));
    console.error(`Bits per entry: ${bitsPerEntry}`);

    const totalBlocks = sizeX * sizeY * sizeZ;
    console.error(`Total blocks: ${totalBlocks}`);

    // Decode packed block states
    // Litematica uses spanning format: indices form a continuous bit stream
    // across long boundaries (unlike Minecraft chunks which pad each long)
    const mask = (1n << BigInt(bitsPerEntry)) - 1n;
    const bpe = BigInt(bitsPerEntry);

    // Convert blockStates to unsigned BigInt array
    const longs = blockStates.map(v => {
      let val;
      if (Array.isArray(v)) {
        // prismarine-nbt SignedBigInt: [high32, low32]
        const high = BigInt(v[0] >>> 0);
        const low = BigInt(v[1] >>> 0);
        val = (high << 32n) | low;
      } else {
        val = BigInt(v);
      }
      // Ensure unsigned
      if (val < 0n) val = val + (1n << 64n);
      return val;
    });

    let blockIndex = 0;
    const blocks = [];

    // Read indices from continuous bit stream (spanning across longs)
    for (let blockIndex = 0; blockIndex < totalBlocks; blockIndex++) {
      const globalBitOffset = BigInt(blockIndex) * bpe;
      const longIdx = Number(globalBitOffset / 64n);
      const bitOffset = Number(globalBitOffset % 64n);

      let paletteIndex;
      if (bitOffset + bitsPerEntry <= 64) {
        // Fits within a single long
        paletteIndex = Number((longs[longIdx] >> BigInt(bitOffset)) & mask);
      } else {
        // Spans two longs - take remaining bits from current, rest from next
        const bitsFromCurrent = 64 - bitOffset;
        const bitsFromNext = bitsPerEntry - bitsFromCurrent;
        const lowPart = Number((longs[longIdx] >> BigInt(bitOffset)) & ((1n << BigInt(bitsFromCurrent)) - 1n));
        const highPart = Number(longs[longIdx + 1] & ((1n << BigInt(bitsFromNext)) - 1n));
        paletteIndex = lowPart | (highPart << bitsFromCurrent);
      }

      if (paletteIndex >= 0 && paletteIndex < palette.length) {
        const blockName = paletteNames[paletteIndex].name;

        // Convert linear index to 3D coordinates
        // Litematica uses x + z * sizeX + y * sizeX * sizeZ
        const y = Math.floor(blockIndex / (sizeX * sizeZ));
        const remainder = blockIndex % (sizeX * sizeZ);
        const z = Math.floor(remainder / sizeX);
        const x = remainder % sizeX;

        if (blockName !== 'minecraft:air' && blockName !== 'minecraft:cave_air') {
          const wx = posX + x;
          const wy = posY + y;
          const wz = posZ + z;

          minX = Math.min(minX, wx);
          minY = Math.min(minY, wy);
          minZ = Math.min(minZ, wz);
          maxX = Math.max(maxX, wx);
          maxY = Math.max(maxY, wy);
          maxZ = Math.max(maxZ, wz);

          allBlocks.push({
            x: wx, y: wy, z: wz,
            block: blockName
          });
        }
      }
    }

    console.error(`Decoded blocks (non-air): ${allBlocks.length} / ${totalBlocks}`);
  }

  // Output summary
  console.error(`\n=== SUMMARY ===`);
  console.error(`Total non-air blocks: ${allBlocks.length}`);
  console.error(`Bounding box: (${minX},${minY},${minZ}) to (${maxX},${maxY},${maxZ})`);
  console.error(`Dimensions: ${maxX - minX + 1} x ${maxY - minY + 1} x ${maxZ - minZ + 1}`);

  // Count block types
  const blockCounts = {};
  for (const b of allBlocks) {
    blockCounts[b.block] = (blockCounts[b.block] || 0) + 1;
  }
  console.error('\nBlock type counts:');
  for (const [name, count] of Object.entries(blockCounts).sort((a, b) => b[1] - a[1])) {
    console.error(`  ${name}: ${count}`);
  }

  // Output JSON to stdout
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

parseLitematic(process.argv[2] || '/Users/milo/Downloads/Dark-Fantasy-Castle.litematic');
