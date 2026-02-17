// World generation utilities

import { fbm, fbm3D, ridgeFbm, warpedFbm, cellNoise } from './noise';
import {
  BlockType,
  ChunkData,
  ChunkPosition,
  CHUNK_SIZE,
  CHUNK_HEIGHT,
  createEmptyChunkData,
  setBlockInChunk,
} from '@/types';
import { CASTLE_WIDTH, CASTLE_HEIGHT, CASTLE_DEPTH, getCastleBlock } from './castleData';
import { WATERPARK_WIDTH, WATERPARK_HEIGHT, WATERPARK_DEPTH, getWaterparkBlock } from './waterparkData';

const SEA_LEVEL = 32;
const BASE_HEIGHT = 25;
const MIN_HEIGHT = 8;
const MAX_HEIGHT = 58; // Terrain max (structures can go higher with CHUNK_HEIGHT=256)

// Cave parameters
const CAVE_SCALE = 0.055;
const CAVE_THRESHOLD = 0.40;
const CAVE_ENTRANCE_SCALE = 0.03;

// Lake for pirate ship (large ocean)
const LAKE_CENTER = { x: -50, z: -50 };
const LAKE_RADIUS = 60;
const LAKE_WATER_LEVEL = 28;
const LAKE_FLOOR_LEVEL = 20;

// Gothic Mansion location (near spawn)
const MANSION_ORIGIN = { x: 25, z: 20 };
const MANSION_WIDTH = 40;  // Total width including towers
const MANSION_DEPTH = 24;  // Total depth

// Portal system - pairs of linked portals
export interface PortalLocation {
  id: string;
  linkedTo: string;
  // World coordinates of the portal interior (where player can stand)
  x: number;
  y: number;  // Base Y (ground level)
  z: number;
  // Facing direction for exit (which way player faces after teleporting)
  exitYaw: number;
}

// Portal registry - will be populated during world generation
export const PORTAL_LOCATIONS: PortalLocation[] = [];

/**
 * Seeded random number generator for consistent structure generation
 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * Get the terrain height at a world position using advanced layered noise
 */
function getTerrainHeightAt(worldX: number, worldZ: number): number {
  // Layer 1: Continental/biome scale (very low frequency)
  // Determines major landmasses vs lowlands
  const continental = warpedFbm(worldX, worldZ, 2, 0.5, 0.002, 50);
  
  // Layer 2: Mountain ridges using multi-octave ridge noise
  // Creates dramatic sharp mountain ranges
  const ridges = ridgeFbm(worldX, worldZ, 5, 0.5, 0.006);
  const ridgeHeight = Math.pow(ridges, 1.5) * 35; // 0-35 blocks
  
  // Layer 3: Valleys carved using inverted warped noise
  const valleyNoise = warpedFbm(worldX + 500, worldZ + 500, 3, 0.6, 0.008, 30);
  const valley = Math.pow(valleyNoise, 0.5); // Square root for sharper valleys
  
  // Layer 4: Cell noise for plateau/mesa regions
  const cells = cellNoise(worldX, worldZ, 0.015);
  const plateaus = cells > 0.3 ? (cells - 0.3) * 15 : 0;
  
  // Layer 5: Fine detail
  const detail = fbm(worldX, worldZ, 4, 0.5, 0.03);
  const detailHeight = (detail - 0.5) * 6;
  
  // Combine layers based on continental value
  let height = BASE_HEIGHT;
  
  // Continental raises/lowers base terrain
  height += (continental - 0.5) * 12;
  
  // Mountains in highland areas (continental > 0.45)
  const mountainMask = Math.max(0, Math.min(1, (continental - 0.4) * 3));
  height += ridgeHeight * mountainMask;
  
  // Valleys cut deeper in lowland areas
  const valleyMask = Math.max(0, Math.min(1, (0.6 - continental) * 2.5));
  height -= (1 - valley) * 18 * valleyMask;
  
  // Plateaus in mid-range areas
  const plateauMask = 1 - Math.abs(continental - 0.5) * 2;
  height += plateaus * Math.max(0, plateauMask);
  
  // Always add fine detail
  height += detailHeight;
  
  // Clamp to valid range
  return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.floor(height)));
}

/**
 * Check if a position should be a cave entrance (opens to surface)
 */
function isCaveEntrance(worldX: number, worldZ: number): boolean {
  // Use cell noise to create distinct entrance locations
  const entranceNoise = cellNoise(worldX, worldZ, CAVE_ENTRANCE_SCALE);
  // Entrance where cell distance is very small (near cell center)
  return entranceNoise < 0.12;
}

/**
 * Check if a position should be a cave
 */
function isCave(worldX: number, worldY: number, worldZ: number, surfaceHeight: number): boolean {
  // Check for cave entrance that extends to surface
  const isEntrance = isCaveEntrance(worldX, worldZ);
  
  // Cave entrances can go closer to surface
  const minDepthFromSurface = isEntrance ? 0 : 4;
  
  // No caves at very bottom (bedrock layer)
  if (worldY <= 2) return false;
  
  // No caves above surface
  if (worldY >= surfaceHeight) return false;
  
  // No regular caves too close to surface (unless entrance)
  if (worldY >= surfaceHeight - minDepthFromSurface) return false;
  
  // Main cave noise - sponge-like caves
  const caveNoise = fbm3D(worldX, worldY, worldZ, 3, 0.5, CAVE_SCALE);
  
  // Horizontal tunnel noise (stretched vertically for horizontal tunnels)
  const tunnelNoise = fbm3D(worldX, worldY * 0.4, worldZ, 2, 0.5, 0.035);
  
  // Vertical shaft noise (stretched horizontally for vertical shafts)
  const shaftNoise = fbm3D(worldX * 0.3, worldY, worldZ * 0.3, 2, 0.5, 0.04);
  
  // Combine different cave types
  const combined = Math.min(caveNoise, Math.min(tunnelNoise, shaftNoise));
  
  // Cave entrances have higher threshold (bigger opening)
  const threshold = isEntrance ? CAVE_THRESHOLD + 0.08 : CAVE_THRESHOLD;
  
  // Caves more common at mid-depths, less at very bottom and near surface
  const depthRatio = worldY / surfaceHeight;
  const depthFactor = 1 - Math.abs(depthRatio - 0.4) * 0.5;
  
  return combined * depthFactor < threshold;
}

// Block placement helper type
type PlaceBlockFn = (wx: number, wy: number, wz: number, block: BlockType) => void;

/**
 * Generate a gothic tower with spire
 */
function generateTower(
  placeBlock: PlaceBlockFn,
  baseX: number,
  baseY: number, 
  baseZ: number,
  towerSize: number,
  towerHeight: number,
  spireHeight: number,
  random: () => number
): void {
  // Tower walls
  for (let y = 0; y < towerHeight; y++) {
    for (let x = 0; x < towerSize; x++) {
      for (let z = 0; z < towerSize; z++) {
        const isEdge = x === 0 || x === towerSize - 1 || z === 0 || z === towerSize - 1;
        const isCorner = (x === 0 || x === towerSize - 1) && (z === 0 || z === towerSize - 1);
        
        if (isEdge) {
          // Windows on each floor (every 4-5 blocks high)
          const floorLevel = y % 5;
          const isWindowLevel = floorLevel >= 2 && floorLevel <= 3;
          const isWindowPos = !isCorner && (x === Math.floor(towerSize / 2) || z === Math.floor(towerSize / 2));
          
          if (isWindowLevel && isWindowPos) {
            // Leave window opening
          } else {
            // Stone walls with occasional gaps
            if (random() > 0.02) {
              placeBlock(baseX + x, baseY + y, baseZ + z, BlockType.COBBLESTONE);
            }
          }
          
          // Corner pillars
          if (isCorner) {
            placeBlock(baseX + x, baseY + y, baseZ + z, BlockType.STONE);
          }
        }
        
        // Floor every 5 blocks
        if (y > 0 && y % 5 === 0 && !isEdge) {
          placeBlock(baseX + x, baseY + y, baseZ + z, BlockType.PLANKS);
        }
      }
    }
  }
  
  // Battlements at top of tower
  for (let x = 0; x < towerSize; x++) {
    for (let z = 0; z < towerSize; z++) {
      const isEdge = x === 0 || x === towerSize - 1 || z === 0 || z === towerSize - 1;
      if (isEdge) {
        // Alternating crenellations
        if ((x + z) % 2 === 0) {
          placeBlock(baseX + x, baseY + towerHeight, baseZ + z, BlockType.COBBLESTONE);
          placeBlock(baseX + x, baseY + towerHeight + 1, baseZ + z, BlockType.COBBLESTONE);
        }
      }
    }
  }
  
  // Pointed spire
  const spireBase = baseY + towerHeight + 2;
  for (let level = 0; level < spireHeight; level++) {
    const shrink = Math.floor(level / 2);
    const spireSize = towerSize - shrink * 2;
    if (spireSize < 1) break;
    
    const offset = shrink;
    for (let x = 0; x < spireSize; x++) {
      for (let z = 0; z < spireSize; z++) {
        const isEdge = x === 0 || x === spireSize - 1 || z === 0 || z === spireSize - 1;
        if (isEdge || level === spireHeight - 1) {
          placeBlock(baseX + offset + x, spireBase + level, baseZ + offset + z, BlockType.STONE);
        }
      }
    }
  }
  
  // Spire tip
  const tipX = baseX + Math.floor(towerSize / 2);
  const tipZ = baseZ + Math.floor(towerSize / 2);
  for (let i = 0; i < 4; i++) {
    placeBlock(tipX, spireBase + spireHeight + i, tipZ, BlockType.STONE);
  }
}

/**
 * Generate a peaked gable roof section
 */
function generateGableRoof(
  placeBlock: PlaceBlockFn,
  baseX: number,
  baseY: number,
  baseZ: number,
  width: number,
  depth: number,
  roofHeight: number,
  random: () => number
): void {
  for (let level = 0; level <= roofHeight; level++) {
    const inset = level;
    if (inset >= Math.floor(width / 2)) break;
    
    for (let z = -1; z <= depth + 1; z++) {
      // Left slope
      if (random() > 0.05) {
        placeBlock(baseX + inset, baseY + level, baseZ + z, BlockType.COBBLESTONE);
      }
      // Right slope
      if (random() > 0.05) {
        placeBlock(baseX + width - 1 - inset, baseY + level, baseZ + z, BlockType.COBBLESTONE);
      }
    }
    
    // Front and back gable walls
    if (level < roofHeight) {
      for (let x = inset + 1; x < width - 1 - inset; x++) {
        // Front gable
        const isGableWindow = level >= 2 && level <= 4 && x >= Math.floor(width / 2) - 1 && x <= Math.floor(width / 2) + 1;
        if (!isGableWindow && random() > 0.03) {
          placeBlock(baseX + x, baseY + level, baseZ - 1, BlockType.COBBLESTONE);
        }
        // Back gable
        if (random() > 0.03) {
          placeBlock(baseX + x, baseY + level, baseZ + depth, BlockType.COBBLESTONE);
        }
      }
    }
  }
}

/**
 * Generate a dead/spooky tree
 */
function generateDeadTree(
  placeBlock: PlaceBlockFn,
  baseX: number,
  baseY: number,
  baseZ: number,
  random: () => number
): void {
  const height = 6 + Math.floor(random() * 4);
  
  // Main trunk
  for (let y = 0; y < height; y++) {
    placeBlock(baseX, baseY + y, baseZ, BlockType.WOOD);
    // Make trunk thicker at base
    if (y < 2) {
      placeBlock(baseX + 1, baseY + y, baseZ, BlockType.WOOD);
      placeBlock(baseX, baseY + y, baseZ + 1, BlockType.WOOD);
    }
  }
  
  // Gnarled branches
  const branchY = baseY + height - 2;
  
  // Branch 1 - diagonal up-right
  for (let i = 1; i <= 3; i++) {
    placeBlock(baseX + i, branchY + i, baseZ, BlockType.WOOD);
  }
  
  // Branch 2 - diagonal up-left
  for (let i = 1; i <= 2; i++) {
    placeBlock(baseX - i, branchY + i + 1, baseZ, BlockType.WOOD);
  }
  
  // Branch 3 - forward
  for (let i = 1; i <= 2; i++) {
    placeBlock(baseX, branchY + 1, baseZ + i, BlockType.WOOD);
  }
  
  // Branch 4 - backward and up
  placeBlock(baseX, branchY, baseZ - 1, BlockType.WOOD);
  placeBlock(baseX, branchY + 1, baseZ - 2, BlockType.WOOD);
}

/**
 * Generate the Gothic Victorian Mansion
 */
function generateHauntedMansionInChunk(
  chunk: ChunkData,
  chunkWorldX: number,
  chunkWorldZ: number
): void {
  const mansionX = MANSION_ORIGIN.x;
  const mansionZ = MANSION_ORIGIN.z;
  const baseY = getTerrainHeightAt(mansionX + MANSION_WIDTH / 2, mansionZ + MANSION_DEPTH / 2);
  
  const random = seededRandom(66613); // Spooky seed
  
  // Helper to place a block if it's in this chunk
  const placeBlock: PlaceBlockFn = (wx, wy, wz, block) => {
    const localX = wx - chunkWorldX;
    const localZ = wz - chunkWorldZ;
    
    if (localX >= 0 && localX < CHUNK_SIZE && 
        localZ >= 0 && localZ < CHUNK_SIZE &&
        wy >= 0 && wy < CHUNK_HEIGHT) {
      setBlockInChunk(chunk, localX, wy, localZ, block);
    }
  };
  
  // ===== FOUNDATION =====
  for (let x = 0; x < MANSION_WIDTH; x++) {
    for (let z = 0; z < MANSION_DEPTH; z++) {
      placeBlock(mansionX + x, baseY - 1, mansionZ + z, BlockType.COBBLESTONE);
      placeBlock(mansionX + x, baseY, mansionZ + z, BlockType.COBBLESTONE);
    }
  }
  
  // ===== MAIN BUILDING - 3 FLOORS =====
  const mainStartX = 8;  // Offset from mansion origin
  const mainWidth = 24;
  const mainDepth = MANSION_DEPTH;
  const floorHeight = 5;
  const numFloors = 3;
  
  for (let floor = 0; floor < numFloors; floor++) {
    const floorY = baseY + 1 + floor * floorHeight;
    
    for (let y = 0; y < floorHeight; y++) {
      for (let x = 0; x < mainWidth; x++) {
        // Front wall
        const wx = mansionX + mainStartX + x;
        const wz = mansionZ;
        
        // Gothic arched windows (every 6 blocks, 2 wide, 3 tall with pointed top)
        const windowX = x % 6;
        const isWindowColumn = windowX >= 2 && windowX <= 3;
        const isWindowRow = y >= 1 && y <= 3;
        const isArch = y === 3 && windowX === 2 || y === 3 && windowX === 3;
        const isWindow = isWindowColumn && isWindowRow && !isArch;
        
        // Door on ground floor
        const isDoor = floor === 0 && x >= 11 && x <= 12 && y <= 3;
        
        if (!isWindow && !isDoor) {
          if (random() > 0.02) {
            placeBlock(wx, floorY + y, wz, BlockType.COBBLESTONE);
          }
        }
        
        // Back wall
        if (random() > 0.02) {
          placeBlock(wx, floorY + y, mansionZ + mainDepth - 1, BlockType.COBBLESTONE);
        }
      }
      
      // Side walls of main building
      for (let z = 1; z < mainDepth - 1; z++) {
        // Left side wall
        const isLeftWindow = y >= 1 && y <= 3 && z % 5 >= 2 && z % 5 <= 3;
        if (!isLeftWindow && random() > 0.02) {
          placeBlock(mansionX + mainStartX, floorY + y, mansionZ + z, BlockType.COBBLESTONE);
        }
        
        // Right side wall
        const isRightWindow = y >= 1 && y <= 3 && z % 5 >= 2 && z % 5 <= 3;
        if (!isRightWindow && random() > 0.02) {
          placeBlock(mansionX + mainStartX + mainWidth - 1, floorY + y, mansionZ + z, BlockType.COBBLESTONE);
        }
      }
    }
    
    // Floor surfaces
    if (floor > 0) {
      for (let x = 1; x < mainWidth - 1; x++) {
        for (let z = 1; z < mainDepth - 1; z++) {
          placeBlock(mansionX + mainStartX + x, floorY, mansionZ + z, BlockType.PLANKS);
        }
      }
    }
  }
  
  // ===== MAIN ROOF (Center Gable) =====
  const mainRoofY = baseY + 1 + numFloors * floorHeight;
  generateGableRoof(placeBlock, mansionX + mainStartX, mainRoofY, mansionZ, mainWidth, mainDepth, 10, random);
  
  // ===== LEFT TOWER =====
  generateTower(placeBlock, mansionX, baseY + 1, mansionZ, 8, 20, 10, random);
  
  // ===== RIGHT TOWER =====
  generateTower(placeBlock, mansionX + MANSION_WIDTH - 8, baseY + 1, mansionZ, 8, 20, 10, random);
  
  // ===== REAR TOWERS (smaller) =====
  generateTower(placeBlock, mansionX + 2, baseY + 1, mansionZ + MANSION_DEPTH - 6, 6, 15, 8, random);
  generateTower(placeBlock, mansionX + MANSION_WIDTH - 8, baseY + 1, mansionZ + MANSION_DEPTH - 6, 6, 15, 8, random);
  
  // ===== CENTER TOWER (tallest) =====
  const centerTowerX = mansionX + mainStartX + Math.floor(mainWidth / 2) - 4;
  const centerTowerZ = mansionZ + Math.floor(mainDepth / 2) - 4;
  generateTower(placeBlock, centerTowerX, baseY + 1 + numFloors * floorHeight, centerTowerZ, 8, 12, 12, random);
  
  // ===== FRONT STEPS =====
  for (let step = 0; step < 4; step++) {
    const stepWidth = 8 - step;
    const stepX = mansionX + mainStartX + Math.floor(mainWidth / 2) - Math.floor(stepWidth / 2);
    for (let x = 0; x < stepWidth; x++) {
      placeBlock(stepX + x, baseY + step, mansionZ - step - 1, BlockType.COBBLESTONE);
    }
  }
  
  // ===== DECORATIVE ELEMENTS =====
  
  // Window trim (stone blocks above windows)
  for (let floor = 0; floor < numFloors; floor++) {
    const floorY = baseY + 1 + floor * floorHeight;
    for (let x = 0; x < mainWidth; x += 6) {
      // Stone lintel above each window pair
      placeBlock(mansionX + mainStartX + x + 2, floorY + 4, mansionZ, BlockType.STONE);
      placeBlock(mansionX + mainStartX + x + 3, floorY + 4, mansionZ, BlockType.STONE);
    }
  }
  
  // Balconies on second and third floor
  for (let floor = 1; floor < numFloors; floor++) {
    const balconyY = baseY + 1 + floor * floorHeight;
    // Center balcony
    const balconyX = mansionX + mainStartX + Math.floor(mainWidth / 2) - 2;
    for (let x = 0; x < 4; x++) {
      placeBlock(balconyX + x, balconyY, mansionZ - 1, BlockType.COBBLESTONE);
      // Railing
      if (x === 0 || x === 3) {
        placeBlock(balconyX + x, balconyY + 1, mansionZ - 1, BlockType.COBBLESTONE);
      }
    }
  }
  
  // ===== DEAD TREES =====
  generateDeadTree(placeBlock, mansionX - 5, baseY, mansionZ + 5, random);
  generateDeadTree(placeBlock, mansionX + MANSION_WIDTH + 3, baseY, mansionZ + 8, random);
  generateDeadTree(placeBlock, mansionX + MANSION_WIDTH + 5, baseY, mansionZ + 3, random);
  generateDeadTree(placeBlock, mansionX - 3, baseY, mansionZ + MANSION_DEPTH - 5, random);
  
  // ===== COBWEB LEAVES IN CORNERS =====
  // Scatter some leaves around for cobweb effect
  for (let floor = 0; floor < numFloors; floor++) {
    const y = baseY + floor * floorHeight + floorHeight;
    placeBlock(mansionX + mainStartX + 1, y, mansionZ + 1, BlockType.LEAVES);
    placeBlock(mansionX + mainStartX + mainWidth - 2, y, mansionZ + 1, BlockType.LEAVES);
    placeBlock(mansionX + mainStartX + 1, y, mansionZ + mainDepth - 2, BlockType.LEAVES);
    placeBlock(mansionX + mainStartX + mainWidth - 2, y, mansionZ + mainDepth - 2, BlockType.LEAVES);
  }
  
  // ===== GRAVEYARD AREA (front left) =====
  // A few tombstones
  for (let i = 0; i < 5; i++) {
    const tombX = mansionX - 8 + Math.floor(random() * 6);
    const tombZ = mansionZ + 2 + i * 3;
    placeBlock(tombX, baseY, tombZ, BlockType.COBBLESTONE);
    placeBlock(tombX, baseY + 1, tombZ, BlockType.COBBLESTONE);
    if (random() > 0.5) {
      placeBlock(tombX, baseY + 2, tombZ, BlockType.COBBLESTONE);
    }
  }
  
  // ===== MILITARY WAR TANK (right side of mansion) =====
  generateWarTank(placeBlock, mansionX + MANSION_WIDTH + 10, baseY, mansionZ + 10);
  
  // ===== NETHER PORTAL (left side of mansion) =====
  generateNetherPortal(placeBlock, mansionX - 12, baseY, mansionZ + 10);
  
  // ===== INSIDE PORTAL (in the main hall) =====
  // Place portal inside the mansion against the back wall of the main hall
  const insidePortalX = mansionX + mainStartX + Math.floor(mainWidth / 2) - 2;
  const insidePortalY = baseY + 1;  // Ground floor level
  const insidePortalZ = mansionZ + mainDepth - 3;  // Near back wall
  generateNetherPortal(placeBlock, insidePortalX, insidePortalY, insidePortalZ);
  
  // Register portal locations (only once when generating the main chunk)
  if (PORTAL_LOCATIONS.length === 0) {
    // Outside portal (left of mansion)
    PORTAL_LOCATIONS.push({
      id: 'outside',
      linkedTo: 'inside',
      x: mansionX - 12 + 1.5,  // Center of portal interior
      y: baseY + 1,
      z: mansionZ + 10 + 1,    // Step into portal (slightly behind frame)
      exitYaw: 0,              // Facing +Z (south)
    });
    
    // Inside portal (in mansion)
    PORTAL_LOCATIONS.push({
      id: 'inside',
      linkedTo: 'outside',
      x: insidePortalX + 1.5,  // Center of portal interior
      y: insidePortalY + 1,
      z: insidePortalZ + 1,    // Step into portal
      exitYaw: 0,        // Facing -Z (north) toward the door
    });
  }
}

/**
 * Generate a military war tank with treads, hull, turret and cannon
 */
function generateWarTank(
  placeBlock: PlaceBlockFn,
  baseX: number,
  baseY: number,
  baseZ: number
): void {
  // Tank dimensions (facing +Z direction)
  const hullLength = 10;  // Z direction
  const hullWidth = 6;    // X direction
  const hullHeight = 3;
  
  // ===== TREADS (left and right sides) =====
  for (let z = 0; z < hullLength; z++) {
    // Left tread
    placeBlock(baseX, baseY, baseZ + z, BlockType.METAL);
    placeBlock(baseX, baseY + 1, baseZ + z, BlockType.METAL);
    // Right tread
    placeBlock(baseX + hullWidth - 1, baseY, baseZ + z, BlockType.METAL);
    placeBlock(baseX + hullWidth - 1, baseY + 1, baseZ + z, BlockType.METAL);
  }
  
  // Tread wheels (darker accents)
  for (let z = 1; z < hullLength - 1; z += 2) {
    placeBlock(baseX - 1, baseY, baseZ + z, BlockType.COBBLESTONE);
    placeBlock(baseX + hullWidth, baseY, baseZ + z, BlockType.COBBLESTONE);
  }
  
  // ===== HULL (main body) =====
  for (let y = 0; y < hullHeight; y++) {
    for (let x = 1; x < hullWidth - 1; x++) {
      for (let z = 1; z < hullLength - 1; z++) {
        // Sloped front (z = 1, 2)
        if (z <= 2 && y >= hullHeight - 1) {
          continue; // Skip for sloped front
        }
        placeBlock(baseX + x, baseY + y + 1, baseZ + z, BlockType.METAL);
      }
    }
  }
  
  // Front slope
  for (let x = 1; x < hullWidth - 1; x++) {
    placeBlock(baseX + x, baseY + 2, baseZ + 1, BlockType.METAL);
    placeBlock(baseX + x, baseY + 3, baseZ + 2, BlockType.METAL);
  }
  
  // ===== TURRET (on top of hull) =====
  const turretX = baseX + 2;
  const turretZ = baseZ + 4;
  const turretY = baseY + hullHeight + 1;
  const turretSize = 3;
  
  // Turret base
  for (let x = 0; x < turretSize; x++) {
    for (let z = 0; z < turretSize; z++) {
      placeBlock(turretX + x, turretY, turretZ + z, BlockType.METAL);
      placeBlock(turretX + x, turretY + 1, turretZ + z, BlockType.METAL);
    }
  }
  
  // Turret top (slightly smaller)
  placeBlock(turretX + 1, turretY + 2, turretZ + 1, BlockType.METAL);
  
  // ===== MAIN CANNON =====
  const cannonY = turretY + 1;
  const cannonStartZ = turretZ + turretSize;
  
  // Cannon barrel extending forward
  for (let cz = 0; cz < 5; cz++) {
    placeBlock(turretX + 1, cannonY, cannonStartZ + cz, BlockType.METAL);
  }
  
  // ===== COMMANDER HATCH =====
  placeBlock(turretX + 1, turretY + 2, turretZ, BlockType.COBBLESTONE);
  
  // ===== REAR ENGINE DECK =====
  for (let x = 1; x < hullWidth - 1; x++) {
    placeBlock(baseX + x, baseY + hullHeight + 1, baseZ + hullLength - 2, BlockType.COBBLESTONE);
  }
}

/**
 * Generate a Nether portal with obsidian frame and purple portal blocks
 */
function generateNetherPortal(
  placeBlock: PlaceBlockFn,
  baseX: number,
  baseY: number,
  baseZ: number
): void {
  const portalWidth = 4;
  const portalHeight = 5;
  
  // Build obsidian frame
  // Bottom
  for (let x = 0; x < portalWidth; x++) {
    placeBlock(baseX + x, baseY, baseZ, BlockType.OBSIDIAN);
  }
  
  // Top
  for (let x = 0; x < portalWidth; x++) {
    placeBlock(baseX + x, baseY + portalHeight, baseZ, BlockType.OBSIDIAN);
  }
  
  // Left pillar
  for (let y = 0; y <= portalHeight; y++) {
    placeBlock(baseX, baseY + y, baseZ, BlockType.OBSIDIAN);
  }
  
  // Right pillar
  for (let y = 0; y <= portalHeight; y++) {
    placeBlock(baseX + portalWidth - 1, baseY + y, baseZ, BlockType.OBSIDIAN);
  }
  
  // Fill with portal blocks (inside the frame)
  for (let x = 1; x < portalWidth - 1; x++) {
    for (let y = 1; y < portalHeight; y++) {
      placeBlock(baseX + x, baseY + y, baseZ, BlockType.PORTAL);
    }
  }
  
  // Add decorative corner pillars
  placeBlock(baseX - 1, baseY, baseZ, BlockType.OBSIDIAN);
  placeBlock(baseX - 1, baseY + 1, baseZ, BlockType.OBSIDIAN);
  placeBlock(baseX + portalWidth, baseY, baseZ, BlockType.OBSIDIAN);
  placeBlock(baseX + portalWidth, baseY + 1, baseZ, BlockType.OBSIDIAN);
}

// Missile site location (twice as far from haunted house)
export const MISSILE_SITE_X = 5;
export const MISSILE_SITE_Z = 0;
export const MISSILE_SITE_Y = 30; // Ground level for launch pad

/**
 * Generate missile launch pad and control panel in a chunk
 */
function generateMissileSiteInChunk(
  chunk: ChunkData,
  chunkWorldX: number,
  chunkWorldZ: number
): void {
  const placeBlock = (worldX: number, worldY: number, worldZ: number, blockType: BlockType) => {
    const localX = worldX - chunkWorldX;
    const localZ = worldZ - chunkWorldZ;
    if (localX >= 0 && localX < CHUNK_SIZE && localZ >= 0 && localZ < CHUNK_SIZE && worldY >= 0 && worldY < CHUNK_HEIGHT) {
      setBlockInChunk(chunk, localX, worldY, localZ, blockType);
    }
  };

  // Get terrain height at missile site location and place launch pad 2 blocks above it
  const terrainHeight = getTerrainHeightAt(MISSILE_SITE_X, MISSILE_SITE_Z);
  const launchPadY = terrainHeight + 2;

  // Launch pad - 5x5 metal platform
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      placeBlock(MISSILE_SITE_X + dx, launchPadY, MISSILE_SITE_Z + dz, BlockType.METAL);
    }
  }

  // Support pillars under launch pad (go down to terrain)
  for (let y = launchPadY - 1; y >= terrainHeight; y--) {
    placeBlock(MISSILE_SITE_X - 2, y, MISSILE_SITE_Z - 2, BlockType.METAL);
    placeBlock(MISSILE_SITE_X + 2, y, MISSILE_SITE_Z - 2, BlockType.METAL);
    placeBlock(MISSILE_SITE_X - 2, y, MISSILE_SITE_Z + 2, BlockType.METAL);
    placeBlock(MISSILE_SITE_X + 2, y, MISSILE_SITE_Z + 2, BlockType.METAL);
  }

  // Control panel - 5 blocks away from launch pad
  const controlPanelX = MISSILE_SITE_X + 5;
  const controlPanelZ = MISSILE_SITE_Z;
  const controlPanelTerrainHeight = getTerrainHeightAt(controlPanelX, controlPanelZ);

  // Base at terrain level
  placeBlock(controlPanelX, controlPanelTerrainHeight, controlPanelZ, BlockType.STONE);

  // Panel upright (using cobblestone)
  placeBlock(controlPanelX, controlPanelTerrainHeight + 1, controlPanelZ, BlockType.COBBLESTONE);
  placeBlock(controlPanelX, controlPanelTerrainHeight + 2, controlPanelZ, BlockType.COBBLESTONE);

  // Button (using obsidian as a distinctive block)
  placeBlock(controlPanelX, controlPanelTerrainHeight + 2, controlPanelZ - 1, BlockType.OBSIDIAN);
}

/**
 * Check if a chunk could contain the missile site
 */
function chunkContainsMissileSite(chunkWorldX: number, chunkWorldZ: number): boolean {
  const siteMinX = MISSILE_SITE_X - 5;
  const siteMaxX = MISSILE_SITE_X + 10;
  const siteMinZ = MISSILE_SITE_Z - 5;
  const siteMaxZ = MISSILE_SITE_Z + 5;

  const chunkMinX = chunkWorldX;
  const chunkMaxX = chunkWorldX + CHUNK_SIZE;
  const chunkMinZ = chunkWorldZ;
  const chunkMaxZ = chunkWorldZ + CHUNK_SIZE;

  return !(chunkMaxX < siteMinX || chunkMinX > siteMaxX ||
           chunkMaxZ < siteMinZ || chunkMinZ > siteMaxZ);
}

/**
 * Check if a chunk could contain part of the haunted mansion
 */
/**
 * Check if a chunk overlaps the lake area
 */
function chunkContainsLake(chunkWorldX: number, chunkWorldZ: number): boolean {
  const chunkMinX = chunkWorldX;
  const chunkMaxX = chunkWorldX + CHUNK_SIZE;
  const chunkMinZ = chunkWorldZ;
  const chunkMaxZ = chunkWorldZ + CHUNK_SIZE;

  // Check if any corner of the chunk is within lake radius + margin
  const margin = CHUNK_SIZE; // Extra margin to catch edges
  const lakeMinX = LAKE_CENTER.x - LAKE_RADIUS - margin;
  const lakeMaxX = LAKE_CENTER.x + LAKE_RADIUS + margin;
  const lakeMinZ = LAKE_CENTER.z - LAKE_RADIUS - margin;
  const lakeMaxZ = LAKE_CENTER.z + LAKE_RADIUS + margin;

  return !(chunkMaxX < lakeMinX || chunkMinX > lakeMaxX ||
           chunkMaxZ < lakeMinZ || chunkMinZ > lakeMaxZ);
}

/**
 * Carve a lake into existing chunk terrain
 */
function generateLakeInChunk(chunk: ChunkData, chunkWorldX: number, chunkWorldZ: number): void {
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wx = chunkWorldX + x;
      const wz = chunkWorldZ + z;
      const dx = wx - LAKE_CENTER.x;
      const dz = wz - LAKE_CENTER.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > LAKE_RADIUS + 3) continue; // Outside lake area entirely

      if (dist <= LAKE_RADIUS) {
        // Inside lake - carve basin and fill with water
        // Shore transition: sand ring at radius 25-30
        const shoreStart = LAKE_RADIUS - 5;
        const isShore = dist > shoreStart;

        // Interpolate floor level for gradual shore slope
        let floorLevel = LAKE_FLOOR_LEVEL;
        if (isShore) {
          const shoreT = (dist - shoreStart) / (LAKE_RADIUS - shoreStart);
          const terrainHeight = getTerrainHeightAt(wx, wz);
          floorLevel = Math.floor(LAKE_FLOOR_LEVEL + (terrainHeight - LAKE_FLOOR_LEVEL) * shoreT);
        }

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          if (y <= floorLevel) {
            // Keep terrain below floor (stone/dirt)
            if (y === floorLevel) {
              setBlockInChunk(chunk, x, y, z, BlockType.SAND);
            }
            // else leave existing terrain
          } else if (y <= LAKE_WATER_LEVEL) {
            // Fill with water
            setBlockInChunk(chunk, x, y, z, BlockType.WATER);
          } else {
            // Clear above water level
            setBlockInChunk(chunk, x, y, z, BlockType.AIR);
          }
        }
      } else {
        // Just outside lake - sand beach (radius 30-33)
        const terrainHeight = getTerrainHeightAt(wx, wz);
        if (terrainHeight <= LAKE_WATER_LEVEL + 3) {
          setBlockInChunk(chunk, x, terrainHeight, z, BlockType.SAND);
          if (terrainHeight > 0) {
            setBlockInChunk(chunk, x, terrainHeight - 1, z, BlockType.SAND);
          }
        }
      }
    }
  }
}

// ===== PIRATE SHIP =====
let shipOrigin = { x: -50, z: -50 }; // Center of ship at lake center (dynamic, updated when ship moves)

/** Update ship origin when the ship moves - affects chunk generation */
export function updateShipOrigin(x: number, z: number): void {
  shipOrigin = { x, z };
}
const SHIP_LENGTH = 35;    // Z axis
const SHIP_HALF_LENGTH = 17;
const SHIP_DECK_Y = LAKE_WATER_LEVEL + 1; // Deck just above water

/** Hull half-width at a given local Z position (-17 to +17) */
function getHullHalfWidth(localZ: number): number {
  const absZ = Math.abs(localZ);
  if (localZ > 13) return Math.max(1, Math.floor(7 - (localZ - 13) * 1.5)); // Bow taper
  if (localZ > 5) return 6; // Midship
  if (localZ > -5) return 6; // Midship
  if (localZ > -13) return 6; // Aft
  return Math.max(3, Math.floor(6 - (Math.abs(localZ) - 13) * 0.7)); // Stern taper
}

/** Hull depth below deck at a given local Z */
function getHullDepth(localZ: number): number {
  const absZ = Math.abs(localZ);
  if (absZ > 15) return 3;
  if (absZ > 10) return 4;
  return 5; // Deepest in center
}

function chunkContainsShip(chunkWorldX: number, chunkWorldZ: number): boolean {
  const shipMinX = shipOrigin.x - 10;
  const shipMaxX = shipOrigin.x + 10;
  const shipMinZ = shipOrigin.z - SHIP_HALF_LENGTH - 5;
  const shipMaxZ = shipOrigin.z + SHIP_HALF_LENGTH + 8; // Extra for bowsprit

  const chunkMinX = chunkWorldX;
  const chunkMaxX = chunkWorldX + CHUNK_SIZE;
  const chunkMinZ = chunkWorldZ;
  const chunkMaxZ = chunkWorldZ + CHUNK_SIZE;

  return !(chunkMaxX < shipMinX || chunkMinX > shipMaxX ||
           chunkMaxZ < shipMinZ || chunkMinZ > shipMaxZ);
}

function generatePirateShipInChunk(
  chunk: ChunkData,
  chunkWorldX: number,
  chunkWorldZ: number
): void {
  const shipX = shipOrigin.x;
  const shipZ = shipOrigin.z;
  const deckY = SHIP_DECK_Y;

  const placeBlock: PlaceBlockFn = (wx, wy, wz, block) => {
    const localX = wx - chunkWorldX;
    const localZ = wz - chunkWorldZ;
    if (localX >= 0 && localX < CHUNK_SIZE &&
        localZ >= 0 && localZ < CHUNK_SIZE &&
        wy >= 0 && wy < CHUNK_HEIGHT) {
      setBlockInChunk(chunk, localX, wy, localZ, block);
    }
  };

  // === HULL (solid interior) ===
  for (let lz = -SHIP_HALF_LENGTH; lz <= SHIP_HALF_LENGTH; lz++) {
    const halfW = getHullHalfWidth(lz);
    const depth = getHullDepth(lz);

    for (let lx = -halfW; lx <= halfW; lx++) {
      for (let dy = -depth; dy <= 0; dy++) {
        const wx = shipX + lx;
        const wy = deckY + dy;
        const wz = shipZ + lz;

        const isEdgeX = Math.abs(lx) === halfW;
        const isBottom = dy === -depth;
        const isTop = dy === 0;

        if (isEdgeX || isBottom) {
          // Hull shell
          placeBlock(wx, wy, wz, BlockType.WOOD);
        } else if (isTop) {
          // Deck
          placeBlock(wx, wy, wz, BlockType.PLANKS);
        } else {
          // Solid interior (so you can walk inside)
          placeBlock(wx, wy, wz, BlockType.PLANKS);
        }
      }
    }
  }

  // Bow point (extra blocks for sharp front)
  for (let bz = SHIP_HALF_LENGTH + 1; bz <= SHIP_HALF_LENGTH + 4; bz++) {
    const bowWidth = Math.max(0, 2 - (bz - SHIP_HALF_LENGTH - 1));
    for (let bx = -bowWidth; bx <= bowWidth; bx++) {
      placeBlock(shipX + bx, deckY, shipZ + bz, BlockType.WOOD);
      placeBlock(shipX + bx, deckY - 1, shipZ + bz, BlockType.WOOD);
      placeBlock(shipX + bx, deckY - 2, shipZ + bz, BlockType.WOOD);
    }
  }

  // Stern transom (flat back wall)
  for (let lx = -4; lx <= 4; lx++) {
    for (let dy = -3; dy <= 4; dy++) {
      placeBlock(shipX + lx, deckY + dy, shipZ - SHIP_HALF_LENGTH, BlockType.WOOD);
    }
  }

  // === RAILINGS (single row of blocks along deck edges) ===
  for (let lz = -SHIP_HALF_LENGTH + 1; lz <= SHIP_HALF_LENGTH; lz++) {
    const halfW = getHullHalfWidth(lz);
    if (halfW >= 2) {
      placeBlock(shipX + halfW, deckY + 1, shipZ + lz, BlockType.WOOD);
      placeBlock(shipX - halfW, deckY + 1, shipZ + lz, BlockType.WOOD);
    }
  }

  // === STERN CASTLE (raised back section) ===
  const sternCastleDeckY = deckY + 3;
  for (let lz = -SHIP_HALF_LENGTH + 1; lz <= -5; lz++) {
    const halfW = getHullHalfWidth(lz);
    for (let lx = -halfW + 1; lx <= halfW - 1; lx++) {
      // Solid platform
      placeBlock(shipX + lx, sternCastleDeckY, shipZ + lz, BlockType.PLANKS);
      // Support columns at edges
      if (lz === -5 && (Math.abs(lx) === halfW - 1)) {
        for (let sy = 1; sy < 3; sy++) {
          placeBlock(shipX + lx, deckY + sy, shipZ + lz, BlockType.WOOD);
        }
      }
    }
    // Stern castle railings
    if (halfW >= 2) {
      placeBlock(shipX + halfW - 1, sternCastleDeckY + 1, shipZ + lz, BlockType.WOOD);
      placeBlock(shipX - halfW + 1, sternCastleDeckY + 1, shipZ + lz, BlockType.WOOD);
    }
  }

  // Steps up to stern castle
  placeBlock(shipX - 1, deckY + 1, shipZ - 5, BlockType.PLANKS);
  placeBlock(shipX, deckY + 1, shipZ - 5, BlockType.PLANKS);
  placeBlock(shipX + 1, deckY + 1, shipZ - 5, BlockType.PLANKS);
  placeBlock(shipX - 1, deckY + 2, shipZ - 6, BlockType.PLANKS);
  placeBlock(shipX, deckY + 2, shipZ - 6, BlockType.PLANKS);
  placeBlock(shipX + 1, deckY + 2, shipZ - 6, BlockType.PLANKS);

  // === CAPTAIN'S CABIN (enclosed room on stern castle) ===
  const cabinY = sternCastleDeckY;
  // Side walls
  for (let lz = -SHIP_HALF_LENGTH + 1; lz <= -8; lz++) {
    for (let cy = 1; cy <= 3; cy++) {
      placeBlock(shipX + 4, cabinY + cy, shipZ + lz, BlockType.WOOD);
      placeBlock(shipX - 4, cabinY + cy, shipZ + lz, BlockType.WOOD);
    }
  }
  // Back wall
  for (let lx = -4; lx <= 4; lx++) {
    for (let cy = 1; cy <= 3; cy++) {
      // Windows in back wall
      if (cy === 2 && Math.abs(lx) >= 1 && Math.abs(lx) <= 3 && Math.abs(lx) % 2 === 1) {
        continue; // Leave window opening
      }
      placeBlock(shipX + lx, cabinY + cy, shipZ - SHIP_HALF_LENGTH + 1, BlockType.WOOD);
    }
  }
  // Cabin roof
  for (let lx = -5; lx <= 5; lx++) {
    for (let lz = -SHIP_HALF_LENGTH + 1; lz <= -7; lz++) {
      placeBlock(shipX + lx, cabinY + 4, shipZ + lz, BlockType.PLANKS);
    }
  }
  // Cabin door opening
  placeBlock(shipX, cabinY + 1, shipZ - 7, BlockType.AIR);
  placeBlock(shipX, cabinY + 2, shipZ - 7, BlockType.AIR);

  // === POOP DECK (open upper deck above cabin) ===
  const poopDeckY = cabinY + 5;
  for (let lx = -5; lx <= 5; lx++) {
    for (let lz = -SHIP_HALF_LENGTH + 1; lz <= -7; lz++) {
      placeBlock(shipX + lx, poopDeckY, shipZ + lz, BlockType.PLANKS);
    }
  }
  // Poop deck railings
  for (let lz = -SHIP_HALF_LENGTH + 1; lz <= -7; lz++) {
    placeBlock(shipX + 5, poopDeckY + 1, shipZ + lz, BlockType.WOOD);
    placeBlock(shipX - 5, poopDeckY + 1, shipZ + lz, BlockType.WOOD);
  }
  // Back railing
  for (let lx = -5; lx <= 5; lx++) {
    placeBlock(shipX + lx, poopDeckY + 1, shipZ - SHIP_HALF_LENGTH + 1, BlockType.WOOD);
  }
  // Steps from stern castle to poop deck
  placeBlock(shipX - 1, cabinY + 2, shipZ - 7, BlockType.PLANKS);
  placeBlock(shipX + 1, cabinY + 2, shipZ - 7, BlockType.PLANKS);
  placeBlock(shipX - 1, cabinY + 3, shipZ - 8, BlockType.PLANKS);
  placeBlock(shipX + 1, cabinY + 3, shipZ - 8, BlockType.PLANKS);
  placeBlock(shipX - 1, cabinY + 4, shipZ - 9, BlockType.PLANKS);
  placeBlock(shipX + 1, cabinY + 4, shipZ - 9, BlockType.PLANKS);

  // === STEERING WHEEL (at front of ship on main deck) ===
  // Wheel post
  placeBlock(shipX, deckY + 1, shipZ + 15, BlockType.WOOD);
  placeBlock(shipX, deckY + 2, shipZ + 15, BlockType.WOOD);

  // === MASTS ===
  // Foremast (front) at z+8
  for (let my = 1; my <= 18; my++) {
    placeBlock(shipX, deckY + my, shipZ + 8, BlockType.WOOD);
  }
  // Mainmast (center) at z=0 - tallest
  for (let my = 1; my <= 22; my++) {
    placeBlock(shipX, deckY + my, shipZ, BlockType.WOOD);
  }
  // Mizzenmast (aft) at z-8 (on stern castle)
  for (let my = 1; my <= 16; my++) {
    placeBlock(shipX, sternCastleDeckY + my, shipZ - 10, BlockType.WOOD);
  }

  // === YARDARMS (horizontal beams) ===
  // Foremast yards
  for (let yx = -5; yx <= 5; yx++) {
    placeBlock(shipX + yx, deckY + 10, shipZ + 8, BlockType.WOOD);
    placeBlock(shipX + yx, deckY + 16, shipZ + 8, BlockType.WOOD);
  }
  // Mainmast yards
  for (let yx = -6; yx <= 6; yx++) {
    placeBlock(shipX + yx, deckY + 11, shipZ, BlockType.WOOD);
  }
  for (let yx = -5; yx <= 5; yx++) {
    placeBlock(shipX + yx, deckY + 17, shipZ, BlockType.WOOD);
  }
  for (let yx = -3; yx <= 3; yx++) {
    placeBlock(shipX + yx, deckY + 22, shipZ, BlockType.WOOD);
  }
  // Mizzenmast yards
  for (let yx = -4; yx <= 4; yx++) {
    placeBlock(shipX + yx, sternCastleDeckY + 10, shipZ - 10, BlockType.WOOD);
    placeBlock(shipX + yx, sternCastleDeckY + 15, shipZ - 10, BlockType.WOOD);
  }

  // === SAILS (sand-colored) ===
  // Foremast sails
  for (let sx = -4; sx <= 4; sx++) {
    for (let sy = 0; sy < 5; sy++) {
      placeBlock(shipX + sx, deckY + 5 + sy, shipZ + 8, BlockType.SAND);
      placeBlock(shipX + sx, deckY + 11 + sy, shipZ + 8, BlockType.SAND);
    }
  }
  // Mainmast sails
  for (let sx = -5; sx <= 5; sx++) {
    for (let sy = 0; sy < 6; sy++) {
      placeBlock(shipX + sx, deckY + 5 + sy, shipZ, BlockType.SAND);
    }
  }
  for (let sx = -4; sx <= 4; sx++) {
    for (let sy = 0; sy < 5; sy++) {
      placeBlock(shipX + sx, deckY + 12 + sy, shipZ, BlockType.SAND);
    }
  }
  for (let sx = -2; sx <= 2; sx++) {
    for (let sy = 0; sy < 4; sy++) {
      placeBlock(shipX + sx, deckY + 18 + sy, shipZ, BlockType.SAND);
    }
  }
  // Mizzenmast sails
  for (let sx = -3; sx <= 3; sx++) {
    for (let sy = 0; sy < 5; sy++) {
      placeBlock(shipX + sx, sternCastleDeckY + 5 + sy, shipZ - 10, BlockType.SAND);
      placeBlock(shipX + sx, sternCastleDeckY + 11 + sy, shipZ - 10, BlockType.SAND);
    }
  }

  // === CROW'S NEST (on mainmast) ===
  for (let cx = -1; cx <= 1; cx++) {
    for (let cz = -1; cz <= 1; cz++) {
      placeBlock(shipX + cx, deckY + 22, shipZ + cz, BlockType.PLANKS);
    }
    placeBlock(shipX + cx, deckY + 23, shipZ - 1, BlockType.WOOD);
    placeBlock(shipX + cx, deckY + 23, shipZ + 1, BlockType.WOOD);
  }
  placeBlock(shipX - 1, deckY + 23, shipZ, BlockType.WOOD);
  placeBlock(shipX + 1, deckY + 23, shipZ, BlockType.WOOD);

  // === PIRATE FLAG (top of mainmast) ===
  placeBlock(shipX, deckY + 23, shipZ, BlockType.WOOD); // Flag pole
  placeBlock(shipX, deckY + 24, shipZ, BlockType.WOOD);
  // Flag (using obsidian for black)
  placeBlock(shipX + 1, deckY + 24, shipZ, BlockType.OBSIDIAN);
  placeBlock(shipX + 2, deckY + 24, shipZ, BlockType.OBSIDIAN);
  placeBlock(shipX + 1, deckY + 23, shipZ, BlockType.OBSIDIAN);
  placeBlock(shipX + 2, deckY + 23, shipZ, BlockType.OBSIDIAN);

  // === CANNONS (metal blocks poking out of hull) ===
  for (let ci = 0; ci < 3; ci++) {
    const cz = shipZ - 4 + ci * 6;
    const halfW = getHullHalfWidth(-4 + ci * 6);
    placeBlock(shipX + halfW + 1, deckY, cz, BlockType.METAL);
    placeBlock(shipX - halfW - 1, deckY, cz, BlockType.METAL);
    placeBlock(shipX + halfW, deckY - 1, cz, BlockType.COBBLESTONE);
    placeBlock(shipX - halfW, deckY - 1, cz, BlockType.COBBLESTONE);
  }

  // === BOWSPRIT (forward beam) ===
  for (let bz = SHIP_HALF_LENGTH + 5; bz <= SHIP_HALF_LENGTH + 8; bz++) {
    placeBlock(shipX, deckY + 1, shipZ + bz, BlockType.WOOD);
  }

  // === ANCHOR (left side) ===
  placeBlock(shipX - 7, deckY, shipZ + 10, BlockType.METAL);
  placeBlock(shipX - 7, deckY - 1, shipZ + 10, BlockType.METAL);
  placeBlock(shipX - 7, deckY - 2, shipZ + 10, BlockType.METAL);
}

// Ship bounding box relative to deck Y and ship origin (for movement)
export const SHIP_BBOX = {
  minX: -10, maxX: 10,
  minY: -5, maxY: 25,   // relative to deckY
  minZ: -17, maxZ: 25,  // relative to shipZ (stern to bowsprit)
};

// Ship wheel offset from pirateShip.position (which is at [shipX, LAKE_WATER_LEVEL, shipZ])
export const SHIP_WHEEL_OFFSET: [number, number, number] = [0, SHIP_DECK_Y - LAKE_WATER_LEVEL + 2, 15];


// ===== IMPORTED DARK FANTASY CASTLE =====
// Castle origin: bottom-corner of the imported structure in world space
// The castle is 97x151x104 blocks (width x height x depth)
const CASTLE_ORIGIN = { x: 100, z: -90 };
const CASTLE_BASE_Y = 10; // Y offset in world (structure starts at this Y)

function chunkContainsCastle(chunkWorldX: number, chunkWorldZ: number): boolean {
  const margin = CHUNK_SIZE;
  const minX = CASTLE_ORIGIN.x - margin;
  const maxX = CASTLE_ORIGIN.x + CASTLE_WIDTH + margin;
  const minZ = CASTLE_ORIGIN.z - margin;
  const maxZ = CASTLE_ORIGIN.z + CASTLE_DEPTH + margin;

  const chunkMaxX = chunkWorldX + CHUNK_SIZE;
  const chunkMaxZ = chunkWorldZ + CHUNK_SIZE;

  return !(chunkMaxX < minX || chunkWorldX > maxX ||
           chunkMaxZ < minZ || chunkWorldZ > maxZ);
}

function generateCastleInChunk(chunk: ChunkData, chunkWorldX: number, chunkWorldZ: number): void {
  // Place imported castle blocks that fall within this chunk
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wx = chunkWorldX + x;
      const wz = chunkWorldZ + z;

      // Convert world coords to castle-local coords
      const castleX = wx - CASTLE_ORIGIN.x;
      const castleZ = wz - CASTLE_ORIGIN.z;

      // Skip if outside castle XZ bounds
      if (castleX < 0 || castleX >= CASTLE_WIDTH || castleZ < 0 || castleZ >= CASTLE_DEPTH) {
        continue;
      }

      // Place castle blocks at this column
      for (let castleY = 0; castleY < CASTLE_HEIGHT; castleY++) {
        const block = getCastleBlock(castleX, castleY, castleZ);
        if (block === 0) continue; // Skip air

        const worldY = CASTLE_BASE_Y + castleY;
        if (worldY < 0 || worldY >= CHUNK_HEIGHT) continue;

        setBlockInChunk(chunk, x, worldY, z, block as BlockType);
      }
    }
  }

}

// ===== IMPORTED WATERPARK =====
const WATERPARK_ORIGIN = { x: -300, z: 100 };
const WATERPARK_BASE_Y = 28; // Place at terrain level

function chunkContainsWaterpark(chunkWorldX: number, chunkWorldZ: number): boolean {
  const margin = CHUNK_SIZE;
  const minX = WATERPARK_ORIGIN.x - margin;
  const maxX = WATERPARK_ORIGIN.x + WATERPARK_WIDTH + margin;
  const minZ = WATERPARK_ORIGIN.z - margin;
  const maxZ = WATERPARK_ORIGIN.z + WATERPARK_DEPTH + margin;

  const chunkMaxX = chunkWorldX + CHUNK_SIZE;
  const chunkMaxZ = chunkWorldZ + CHUNK_SIZE;

  return !(chunkMaxX < minX || chunkWorldX > maxX ||
           chunkMaxZ < minZ || chunkWorldZ > maxZ);
}

function generateWaterparkInChunk(chunk: ChunkData, chunkWorldX: number, chunkWorldZ: number): void {
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wx = chunkWorldX + x;
      const wz = chunkWorldZ + z;

      const parkX = wx - WATERPARK_ORIGIN.x;
      const parkZ = wz - WATERPARK_ORIGIN.z;

      if (parkX < 0 || parkX >= WATERPARK_WIDTH || parkZ < 0 || parkZ >= WATERPARK_DEPTH) continue;

      for (let parkY = 0; parkY < WATERPARK_HEIGHT; parkY++) {
        const block = getWaterparkBlock(parkX, parkY, parkZ);
        if (block === 0) continue;

        const worldY = WATERPARK_BASE_Y + parkY;
        if (worldY < 0 || worldY >= CHUNK_HEIGHT) continue;

        setBlockInChunk(chunk, x, worldY, z, block as BlockType);
      }
    }
  }
}

// ===== SPACE ROCKET =====
const ROCKET_ORIGIN = { x: 200, z: 50 };
const ROCKET_PAD_Y = 30;

function chunkContainsRocket(chunkWorldX: number, chunkWorldZ: number): boolean {
  const minX = ROCKET_ORIGIN.x - 14;
  const maxX = ROCKET_ORIGIN.x + 16; // Extra for scaffolding tower
  const minZ = ROCKET_ORIGIN.z - 14;
  const maxZ = ROCKET_ORIGIN.z + 14;

  const chunkMaxX = chunkWorldX + CHUNK_SIZE;
  const chunkMaxZ = chunkWorldZ + CHUNK_SIZE;

  return !(chunkMaxX < minX || chunkWorldX > maxX ||
           chunkMaxZ < minZ || chunkWorldZ > maxZ);
}

function generateRocketInChunk(
  chunk: ChunkData,
  chunkWorldX: number,
  chunkWorldZ: number
): void {
  const rX = ROCKET_ORIGIN.x;
  const rZ = ROCKET_ORIGIN.z;
  const padY = ROCKET_PAD_Y;

  const placeBlock: PlaceBlockFn = (wx, wy, wz, block) => {
    const localX = wx - chunkWorldX;
    const localZ = wz - chunkWorldZ;
    if (localX >= 0 && localX < CHUNK_SIZE &&
        localZ >= 0 && localZ < CHUNK_SIZE &&
        wy >= 0 && wy < CHUNK_HEIGHT) {
      setBlockInChunk(chunk, localX, wy, localZ, block);
    }
  };

  // Helper: place a circle of blocks (hollow = ring only)
  const placeCircle = (cx: number, y: number, cz: number, r: number, block: BlockType, hollow: boolean) => {
    const rSq = r * r;
    const innerSq = (r - 1) * (r - 1);
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const dSq = dx * dx + dz * dz;
        if (dSq <= rSq) {
          if (hollow && dSq < innerSq) continue;
          placeBlock(cx + dx, y, cz + dz, block);
        }
      }
    }
  };

  // ===== LAUNCH PAD (22x22 metal platform) =====
  for (let dx = -11; dx <= 11; dx++) {
    for (let dz = -11; dz <= 11; dz++) {
      placeBlock(rX + dx, padY, rZ + dz, BlockType.METAL);
    }
  }
  // Pad border
  for (let dx = -11; dx <= 11; dx++) {
    placeBlock(rX + dx, padY, rZ - 11, BlockType.STONE);
    placeBlock(rX + dx, padY, rZ + 11, BlockType.STONE);
  }
  for (let dz = -11; dz <= 11; dz++) {
    placeBlock(rX - 11, padY, rZ + dz, BlockType.STONE);
    placeBlock(rX + 11, padY, rZ + dz, BlockType.STONE);
  }
  // Support pillars under pad
  for (const dx of [-11, -5, 0, 5, 11]) {
    for (const dz of [-11, -5, 0, 5, 11]) {
      if (Math.abs(dx) < 5 && Math.abs(dz) < 5) continue;
      const th = getTerrainHeightAt(rX + dx, rZ + dz);
      for (let y = th; y < padY; y++) {
        placeBlock(rX + dx, y, rZ + dz, BlockType.METAL);
      }
    }
  }

  // ===== ENGINE NOZZLES (MAGMA) =====
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (dx * dx + dz * dz <= 5) {
        placeBlock(rX + dx, padY + 1, rZ + dz, BlockType.MAGMA);
      }
    }
  }
  // Engine bell housing
  placeCircle(rX, padY + 2, rZ, 5, BlockType.ANDESITE_BLOCK, true);
  placeCircle(rX, padY + 3, rZ, 5, BlockType.ANDESITE_BLOCK, true);

  // ===== STAGE 1 (S-IC) - r=5, 25 blocks tall =====
  const s1Start = padY + 4;
  const s1H = 25;
  const s1R = 5;
  for (let dy = 0; dy < s1H; dy++) {
    placeCircle(rX, s1Start + dy, rZ, s1R, BlockType.SNOW, true);
    // Interior floors every 8 blocks
    if (dy > 0 && dy % 8 === 0) {
      for (let dx = -(s1R - 2); dx <= (s1R - 2); dx++) {
        for (let dz = -(s1R - 2); dz <= (s1R - 2); dz++) {
          if (dx * dx + dz * dz < (s1R - 1) * (s1R - 1)) {
            placeBlock(rX + dx, s1Start + dy, rZ + dz, BlockType.PLANKS);
          }
        }
      }
    }
  }
  // Vertical black stripes on Stage 1
  for (let dy = 4; dy < s1H - 2; dy++) {
    placeBlock(rX, s1Start + dy, rZ + s1R, BlockType.OBSIDIAN);
    placeBlock(rX, s1Start + dy, rZ - s1R, BlockType.OBSIDIAN);
  }

  // ===== FINS (4 at base of Stage 1) =====
  for (let fh = 0; fh < 6; fh++) {
    const fw = Math.max(1, 3 - Math.floor(fh / 2));
    const fy = s1Start + fh;
    for (let fi = 0; fi < fw; fi++) {
      placeBlock(rX + s1R + 1 + fi, fy, rZ, BlockType.ANDESITE_BLOCK);
      placeBlock(rX - s1R - 1 - fi, fy, rZ, BlockType.ANDESITE_BLOCK);
      placeBlock(rX, fy, rZ + s1R + 1 + fi, BlockType.ANDESITE_BLOCK);
      placeBlock(rX, fy, rZ - s1R - 1 - fi, BlockType.ANDESITE_BLOCK);
    }
  }

  // ===== ORANGE BAND 1 =====
  const b1Y = s1Start + s1H;
  placeCircle(rX, b1Y, rZ, s1R, BlockType.ORANGE_GLASS, true);
  placeCircle(rX, b1Y + 1, rZ, s1R, BlockType.ORANGE_GLASS, true);

  // ===== STAGE 2 (S-II) - r=4, 18 blocks tall =====
  const s2Start = b1Y + 2;
  const s2H = 18;
  const s2R = 4;
  for (let dy = 0; dy < s2H; dy++) {
    placeCircle(rX, s2Start + dy, rZ, s2R, BlockType.SNOW, true);
    if (dy > 0 && dy % 8 === 0) {
      for (let dx = -(s2R - 2); dx <= (s2R - 2); dx++) {
        for (let dz = -(s2R - 2); dz <= (s2R - 2); dz++) {
          if (dx * dx + dz * dz < (s2R - 1) * (s2R - 1)) {
            placeBlock(rX + dx, s2Start + dy, rZ + dz, BlockType.PLANKS);
          }
        }
      }
    }
  }
  // Vertical stripes on Stage 2
  for (let dy = 2; dy < s2H - 2; dy++) {
    placeBlock(rX + s2R, s2Start + dy, rZ, BlockType.OBSIDIAN);
    placeBlock(rX - s2R, s2Start + dy, rZ, BlockType.OBSIDIAN);
  }

  // ===== ORANGE BAND 2 =====
  const b2Y = s2Start + s2H;
  placeCircle(rX, b2Y, rZ, s2R, BlockType.ORANGE_GLASS, true);
  placeCircle(rX, b2Y + 1, rZ, s2R, BlockType.ORANGE_GLASS, true);

  // ===== STAGE 3 (S-IVB) - r=3, 12 blocks tall =====
  const s3Start = b2Y + 2;
  const s3H = 12;
  const s3R = 3;
  for (let dy = 0; dy < s3H; dy++) {
    placeCircle(rX, s3Start + dy, rZ, s3R, BlockType.SNOW, true);
  }

  // ===== SERVICE MODULE - r=3, 8 blocks =====
  const smStart = s3Start + s3H;
  const smH = 8;
  placeCircle(rX, smStart, rZ, s3R, BlockType.ORANGE_GLASS, true); // Orange band at base
  for (let dy = 1; dy < smH; dy++) {
    placeCircle(rX, smStart + dy, rZ, s3R, BlockType.SNOW, true);
  }
  // Windows on service module
  const winY = smStart + 4;
  placeBlock(rX + s3R, winY, rZ, BlockType.BLACK_GLASS);
  placeBlock(rX - s3R, winY, rZ, BlockType.BLACK_GLASS);
  placeBlock(rX, winY, rZ + s3R, BlockType.BLACK_GLASS);
  placeBlock(rX, winY, rZ - s3R, BlockType.BLACK_GLASS);
  placeBlock(rX + s3R, winY + 1, rZ, BlockType.BLACK_GLASS);
  placeBlock(rX - s3R, winY + 1, rZ, BlockType.BLACK_GLASS);
  placeBlock(rX, winY + 1, rZ + s3R, BlockType.BLACK_GLASS);
  placeBlock(rX, winY + 1, rZ - s3R, BlockType.BLACK_GLASS);

  // ===== NOSE CONE (tapered) =====
  const coneStart = smStart + smH;
  for (let dy = 0; dy < 10; dy++) {
    const cR = Math.max(1, Math.floor(3 - dy * 0.3));
    placeCircle(rX, coneStart + dy, rZ, cR, BlockType.SNOW, cR >= 2);
  }

  // ===== ESCAPE TOWER (spike at top) =====
  const escStart = coneStart + 10;
  for (let dy = 0; dy < 6; dy++) {
    placeBlock(rX, escStart + dy, rZ, BlockType.SNOW);
  }
  // Tower fins
  placeBlock(rX + 1, escStart + 4, rZ, BlockType.SNOW);
  placeBlock(rX - 1, escStart + 4, rZ, BlockType.SNOW);
  placeBlock(rX, escStart + 4, rZ + 1, BlockType.SNOW);
  placeBlock(rX, escStart + 4, rZ - 1, BlockType.SNOW);

  // ===== DOOR INTO ROCKET (on +X side facing scaffolding) =====
  for (let dy = 0; dy < 3; dy++) {
    placeBlock(rX + s1R, s1Start + dy, rZ, BlockType.AIR);
    placeBlock(rX + s1R, s1Start + dy, rZ - 1, BlockType.AIR);
  }

  // ===== SCAFFOLDING / GANTRY TOWER =====
  const scX = rX + 10; // Scaffold center X
  const scZ = rZ;
  const tw = 3; // Tower half-width
  const rocketTopY = escStart + 6;
  const scaffoldH = rocketTopY - padY + 4;

  // Four corner columns
  for (let dy = 1; dy <= scaffoldH; dy++) {
    const y = padY + dy;
    placeBlock(scX - tw, y, scZ - tw, BlockType.RED_WOOL);
    placeBlock(scX + tw, y, scZ - tw, BlockType.RED_WOOL);
    placeBlock(scX - tw, y, scZ + tw, BlockType.RED_WOOL);
    placeBlock(scX + tw, y, scZ + tw, BlockType.RED_WOOL);
  }

  // Horizontal cross braces every 4 blocks
  for (let dy = 4; dy <= scaffoldH; dy += 4) {
    const y = padY + dy;
    for (let bx = -tw; bx <= tw; bx++) {
      placeBlock(scX + bx, y, scZ - tw, BlockType.RED_WOOL);
      placeBlock(scX + bx, y, scZ + tw, BlockType.RED_WOOL);
    }
    for (let bz = -tw + 1; bz <= tw - 1; bz++) {
      placeBlock(scX - tw, y, scZ + bz, BlockType.RED_WOOL);
      placeBlock(scX + tw, y, scZ + bz, BlockType.RED_WOOL);
    }
  }

  // Platforms every 10 blocks + walkways to rocket
  for (let pdy = 0; pdy <= scaffoldH; pdy += 10) {
    const platY = padY + pdy;
    // Platform floor inside tower
    for (let px = -tw; px <= tw; px++) {
      for (let pz = -tw; pz <= tw; pz++) {
        placeBlock(scX + px, platY, scZ + pz, BlockType.DARK_OAK);
      }
    }
    if (pdy === 0) continue; // No walkway at ground level

    // Which rocket radius at this height
    let curR = s1R;
    if (platY >= s2Start) curR = s2R;
    if (platY >= s3Start) curR = s3R;
    if (platY >= smStart) curR = s3R;

    // Walkway connecting tower to rocket
    for (let wx = rX + curR; wx <= scX - tw; wx++) {
      placeBlock(wx, platY, scZ, BlockType.DARK_OAK);
      placeBlock(wx, platY, scZ - 1, BlockType.DARK_OAK);
      // Railings
      placeBlock(wx, platY + 1, scZ + 1, BlockType.RED_WOOL);
      placeBlock(wx, platY + 1, scZ - 2, BlockType.RED_WOOL);
    }
    // Clear doorway into rocket at this level
    for (let dy = 1; dy <= 2; dy++) {
      placeBlock(rX + curR, platY + dy, scZ, BlockType.AIR);
      placeBlock(rX + curR, platY + dy, scZ - 1, BlockType.AIR);
    }
  }

  // Spiral stairs inside scaffold tower
  for (let dy = 1; dy < scaffoldH; dy++) {
    const y = padY + dy;
    // Skip platform levels (they already have floors)
    if (dy % 10 === 0) continue;
    const phase = dy % 12;
    if (phase < 3) {
      // North side: going east
      const sx = -tw + 1 + phase;
      placeBlock(scX + sx, y, scZ - tw + 1, BlockType.DARK_OAK);
      placeBlock(scX + sx + 1, y, scZ - tw + 1, BlockType.DARK_OAK);
    } else if (phase < 6) {
      // East side: going south
      const sz = -tw + 1 + (phase - 3);
      placeBlock(scX + tw - 1, y, scZ + sz, BlockType.DARK_OAK);
      placeBlock(scX + tw - 1, y, scZ + sz + 1, BlockType.DARK_OAK);
    } else if (phase < 9) {
      // South side: going west
      const sx = tw - 1 - (phase - 6);
      placeBlock(scX + sx, y, scZ + tw - 1, BlockType.DARK_OAK);
      placeBlock(scX + sx - 1, y, scZ + tw - 1, BlockType.DARK_OAK);
    } else {
      // West side: going north
      const sz = tw - 1 - (phase - 9);
      placeBlock(scX - tw + 1, y, scZ + sz, BlockType.DARK_OAK);
      placeBlock(scX - tw + 1, y, scZ + sz - 1, BlockType.DARK_OAK);
    }
  }

  // Ground-level walkway from pad to scaffold entrance
  for (let wx = rX + 6; wx <= scX - tw; wx++) {
    placeBlock(wx, padY, scZ, BlockType.METAL);
    placeBlock(wx, padY, scZ - 1, BlockType.METAL);
  }
}

// ===== FNAF PIZZERIA =====
const PIZZERIA_ORIGIN = { x: 150, z: 200 };
const PIZZERIA_WIDTH = 50;
const PIZZERIA_DEPTH = 40;

const PIZZERIA_LOT_PAD = 12; // Parking lot extends this far beyond building

function chunkContainsPizzeria(chunkWorldX: number, chunkWorldZ: number): boolean {
  const margin = CHUNK_SIZE + PIZZERIA_LOT_PAD;
  const minX = PIZZERIA_ORIGIN.x - margin;
  const maxX = PIZZERIA_ORIGIN.x + PIZZERIA_WIDTH + margin;
  const minZ = PIZZERIA_ORIGIN.z - margin;
  const maxZ = PIZZERIA_ORIGIN.z + PIZZERIA_DEPTH + margin;

  const chunkMaxX = chunkWorldX + CHUNK_SIZE;
  const chunkMaxZ = chunkWorldZ + CHUNK_SIZE;

  return !(chunkMaxX < minX || chunkWorldX > maxX ||
           chunkMaxZ < minZ || chunkWorldZ > maxZ);
}

function generatePizzeriaInChunk(
  chunk: ChunkData,
  chunkWorldX: number,
  chunkWorldZ: number
): void {
  const ox = PIZZERIA_ORIGIN.x;
  const oz = PIZZERIA_ORIGIN.z;
  const terrainY = getTerrainHeightAt(ox + PIZZERIA_WIDTH / 2, oz + PIZZERIA_DEPTH / 2);
  const baseY = terrainY + 10; // Elevated 10 blocks above terrain
  const wallHeight = 7;
  const floorY = baseY + 1;
  const pad = PIZZERIA_LOT_PAD;

  const placeBlock: PlaceBlockFn = (wx, wy, wz, block) => {
    const localX = wx - chunkWorldX;
    const localZ = wz - chunkWorldZ;
    if (localX >= 0 && localX < CHUNK_SIZE &&
        localZ >= 0 && localZ < CHUNK_SIZE &&
        wy >= 0 && wy < CHUNK_HEIGHT) {
      setBlockInChunk(chunk, localX, wy, localZ, block);
    }
  };

  // ===== PARKING LOT (flat stone area around building) =====
  for (let x = -pad; x < PIZZERIA_WIDTH + pad; x++) {
    for (let z = -pad; z < PIZZERIA_DEPTH + pad; z++) {
      const th = getTerrainHeightAt(ox + x, oz + z);
      // Flatten terrain to parking level and clear above
      for (let y = th; y <= baseY + wallHeight + 16; y++) {
        placeBlock(ox + x, y, oz + z, BlockType.AIR);
      }
      // Parking surface at baseY - 1
      placeBlock(ox + x, baseY - 1, oz + z, BlockType.STONE);
      // Fill gap from terrain to parking surface
      for (let y = th; y < baseY - 1; y++) {
        placeBlock(ox + x, y, oz + z, BlockType.COBBLESTONE);
      }
    }
  }
  // Parking lot stripe markings (ANDESITE lines in the front lot)
  for (let x = -pad + 2; x < PIZZERIA_WIDTH + pad - 2; x += 4) {
    for (let z = -pad; z < -2; z++) {
      placeBlock(ox + x, baseY - 1, oz + z, BlockType.ANDESITE_BLOCK);
    }
  }

  // ===== BUILDING FOUNDATION =====
  for (let x = 0; x < PIZZERIA_WIDTH; x++) {
    for (let z = 0; z < PIZZERIA_DEPTH; z++) {
      placeBlock(ox + x, baseY, oz + z, BlockType.COBBLESTONE);
    }
  }

  // ===== EXTERIOR WALLS =====
  const entranceCX = Math.floor(PIZZERIA_WIDTH / 2);
  const entranceMinX = entranceCX - 2;
  const entranceMaxX = entranceCX + 2;

  // Front wall (z=0) - sandy/tan with dark upper band
  for (let x = 0; x < PIZZERIA_WIDTH; x++) {
    for (let y = 0; y < wallHeight; y++) {
      const isEntrance = x >= entranceMinX && x <= entranceMaxX && y < 4;
      if (!isEntrance) {
        // Bottom row: yellow/black checkered stripe
        if (y === 0) {
          const block = x % 2 === 0 ? BlockType.SAND : BlockType.OBSIDIAN;
          placeBlock(ox + x, floorY + y, oz, block);
        } else if (y >= wallHeight - 2) {
          // Top 2 rows: dark band
          placeBlock(ox + x, floorY + y, oz, BlockType.OBSIDIAN);
        } else {
          // Middle: sandy tan wall
          placeBlock(ox + x, floorY + y, oz, BlockType.SAND);
        }
      }
    }
  }

  // Stone arch around entrance
  for (let x = entranceMinX; x <= entranceMaxX; x++) {
    placeBlock(ox + x, floorY + 4, oz, BlockType.STONE);
  }
  for (let y = 0; y <= 4; y++) {
    placeBlock(ox + entranceMinX - 1, floorY + y, oz, BlockType.DARK_OAK);
    placeBlock(ox + entranceMaxX + 1, floorY + y, oz, BlockType.DARK_OAK);
  }
  // Decorative DARK_OAK pillars flanking entrance
  for (let y = 0; y < wallHeight; y++) {
    placeBlock(ox + entranceMinX - 2, floorY + y, oz, BlockType.DARK_OAK);
    placeBlock(ox + entranceMinX - 2, floorY + y, oz - 1, BlockType.DARK_OAK);
    placeBlock(ox + entranceMaxX + 2, floorY + y, oz, BlockType.DARK_OAK);
    placeBlock(ox + entranceMaxX + 2, floorY + y, oz - 1, BlockType.DARK_OAK);
  }

  // Side walls - sandy with checkered base stripe and dark upper
  for (let z = 1; z < PIZZERIA_DEPTH; z++) {
    for (let y = 0; y < wallHeight; y++) {
      let block: BlockType;
      if (y === 0) {
        block = z % 2 === 0 ? BlockType.SAND : BlockType.OBSIDIAN;
      } else if (y >= wallHeight - 2) {
        block = BlockType.OBSIDIAN;
      } else {
        block = BlockType.SAND;
      }
      placeBlock(ox, floorY + y, oz + z, block);
      placeBlock(ox + PIZZERIA_WIDTH - 1, floorY + y, oz + z, block);
    }
  }

  // Back wall
  for (let x = 0; x < PIZZERIA_WIDTH; x++) {
    for (let y = 0; y < wallHeight; y++) {
      let block: BlockType;
      if (y === 0) {
        block = x % 2 === 0 ? BlockType.SAND : BlockType.OBSIDIAN;
      } else if (y >= wallHeight - 2) {
        block = BlockType.OBSIDIAN;
      } else {
        block = BlockType.SAND;
      }
      placeBlock(ox + x, floorY + y, oz + PIZZERIA_DEPTH - 1, block);
    }
  }

  // DARK_OAK vertical pillars spaced along facade (like the reference wooden poles)
  for (let px = 0; px < PIZZERIA_WIDTH; px += 8) {
    for (let y = 0; y < wallHeight; y++) {
      placeBlock(ox + px, floorY + y, oz, BlockType.DARK_OAK);
    }
  }

  // Tall wooden utility poles at front corners + sides (like in reference)
  const polePositions = [
    [-3, -2], [PIZZERIA_WIDTH + 2, -2],
    [-3, PIZZERIA_DEPTH / 2], [PIZZERIA_WIDTH + 2, PIZZERIA_DEPTH / 2],
  ];
  for (const [px, pz] of polePositions) {
    for (let y = 0; y <= wallHeight + 8; y++) {
      placeBlock(ox + px, floorY + y, oz + pz, BlockType.WOOD);
    }
    // Cross beam at top
    placeBlock(ox + px - 1, floorY + wallHeight + 7, oz + pz, BlockType.WOOD);
    placeBlock(ox + px + 1, floorY + wallHeight + 7, oz + pz, BlockType.WOOD);
  }

  // ===== ROOF (teal/green - LEAVES closest match) =====
  // Main flat roof
  for (let x = 0; x < PIZZERIA_WIDTH; x++) {
    for (let z = 0; z < PIZZERIA_DEPTH; z++) {
      placeBlock(ox + x, floorY + wallHeight, oz + z, BlockType.LEAVES);
    }
  }
  // Roof overhang (awning extends 2 blocks outward on all sides)
  for (let x = -2; x < PIZZERIA_WIDTH + 2; x++) {
    for (let ovr = 1; ovr <= 2; ovr++) {
      placeBlock(ox + x, floorY + wallHeight, oz - ovr, BlockType.LEAVES);
      placeBlock(ox + x, floorY + wallHeight, oz + PIZZERIA_DEPTH - 1 + ovr, BlockType.LEAVES);
    }
  }
  for (let z = 0; z < PIZZERIA_DEPTH; z++) {
    for (let ovr = 1; ovr <= 2; ovr++) {
      placeBlock(ox - ovr, floorY + wallHeight, oz + z, BlockType.LEAVES);
      placeBlock(ox + PIZZERIA_WIDTH - 1 + ovr, floorY + wallHeight, oz + z, BlockType.LEAVES);
    }
  }
  // Roof border trim (dark edge)
  for (let x = -2; x < PIZZERIA_WIDTH + 2; x++) {
    placeBlock(ox + x, floorY + wallHeight, oz - 3, BlockType.DARK_OAK);
    placeBlock(ox + x, floorY + wallHeight, oz + PIZZERIA_DEPTH + 1, BlockType.DARK_OAK);
  }
  for (let z = -2; z < PIZZERIA_DEPTH + 2; z++) {
    placeBlock(ox - 3, floorY + wallHeight, oz + z, BlockType.DARK_OAK);
    placeBlock(ox + PIZZERIA_WIDTH + 1, floorY + wallHeight, oz + z, BlockType.DARK_OAK);
  }

  // ===== RAISED FRONT FACADE + FREDDY FACE =====
  const facadeWidth = 25;
  const facadeExtraH = 14;
  const facadeStartX = Math.floor(PIZZERIA_WIDTH / 2) - Math.floor(facadeWidth / 2);

  // Build raised facade above front wall (dark background for sign)
  for (let x = 0; x < facadeWidth; x++) {
    for (let y = 0; y < facadeExtraH; y++) {
      placeBlock(ox + facadeStartX + x, floorY + wallHeight + 1 + y, oz, BlockType.OBSIDIAN);
    }
  }
  // Facade border pillars (DARK_OAK)
  for (let y = 0; y < facadeExtraH; y++) {
    placeBlock(ox + facadeStartX - 1, floorY + wallHeight + 1 + y, oz, BlockType.DARK_OAK);
    placeBlock(ox + facadeStartX + facadeWidth, floorY + wallHeight + 1 + y, oz, BlockType.DARK_OAK);
  }
  // Facade top cap
  for (let x = -1; x <= facadeWidth; x++) {
    placeBlock(ox + facadeStartX + x, floorY + wallHeight + facadeExtraH + 1, oz, BlockType.DARK_OAK);
  }

  // Freddy Fazbear face - 13 wide x 12 tall pixel art
  // B=DARK_OAK (brown), S=SAND (muzzle), O=ORANGE_GLASS (eyes)
  // K=BLACK_GLASS (pupils/nose), R=RED_WOOL (inner ears), H=OBSIDIAN (hat)
  const face: string[] = [
    '.HHHHHHHHHHH.', // hat brim
    '...HHHHHHH...', // hat crown
    '...HHHHHHH...', // hat crown
    'RBB.......BBR', // ears
    'BBBBBBBBBBBBB', // forehead
    'BBBOKBBBKOBBB', // eyes
    'BBBBBBBBBBBBB', // cheeks
    'BBBBBSSSSSBBB', // upper muzzle
    'BBBBSSKKSSBBB', // nose
    'BBBBBSSSSSBBB', // lower muzzle
    'BBBBBKKKBBBBB', // mouth
    'BBBBBBBBBBBBB', // chin
  ];

  const faceBlockMap: Record<string, BlockType> = {
    'B': BlockType.DARK_OAK,
    'S': BlockType.SAND,
    'O': BlockType.ORANGE_GLASS,
    'K': BlockType.BLACK_GLASS,
    'R': BlockType.RED_WOOL,
    'H': BlockType.OBSIDIAN,
  };

  const faceW = 13;
  const faceH = face.length;
  const faceOffsetX = facadeStartX + Math.floor((facadeWidth - faceW) / 2);
  const faceOffsetY = floorY + wallHeight + 1 + Math.floor((facadeExtraH - faceH) / 2);

  for (let row = 0; row < faceH; row++) {
    for (let col = 0; col < faceW; col++) {
      const ch = face[faceH - 1 - row][col]; // Bottom-up (row 0 at bottom)
      if (ch !== '.' && faceBlockMap[ch]) {
        placeBlock(ox + faceOffsetX + col, faceOffsetY + row, oz, faceBlockMap[ch]);
      }
    }
  }

  // ===== ENTRANCE STEPS (from parking lot up to building floor) =====
  // Steps go from baseY (parking surface) up to floorY (baseY+1)
  // Place a wide staircase in front of the entrance
  const stepsWidth = 8;
  const stepsStartX = entranceCX - Math.floor(stepsWidth / 2);
  // The building is 1 block above parking. Add a cobblestone ramp/step.
  for (let x = 0; x < stepsWidth; x++) {
    placeBlock(ox + stepsStartX + x, baseY, oz - 1, BlockType.COBBLESTONE);
  }

  // ===== INTERIOR WALLS (DARK_OAK, 5 blocks tall) =====
  const iWallH = 5;

  // West hall wall (x=7, z=1..19) with door openings at z=2 and z=17
  for (let z = 1; z < 20; z++) {
    for (let y = 0; y < iWallH; y++) {
      const isDoor = (z >= 2 && z <= 3 && y < 3) || (z >= 16 && z <= 17 && y < 3);
      if (!isDoor) placeBlock(ox + 7, floorY + y, oz + z, BlockType.DARK_OAK);
    }
  }

  // East hall wall (x=42, z=1..19) with door openings
  for (let z = 1; z < 20; z++) {
    for (let y = 0; y < iWallH; y++) {
      const isDoor = (z >= 2 && z <= 3 && y < 3) || (z >= 16 && z <= 17 && y < 3);
      if (!isDoor) placeBlock(ox + 42, floorY + y, oz + z, BlockType.DARK_OAK);
    }
  }

  // Dividing wall (z=20, x=1..48) with 3 door openings
  for (let x = 1; x < PIZZERIA_WIDTH - 1; x++) {
    for (let y = 0; y < iWallH; y++) {
      const isDoor = (x >= 6 && x <= 7 && y < 3) ||    // west door
                     (x >= 24 && x <= 25 && y < 3) ||   // center door
                     (x >= 42 && x <= 43 && y < 3);     // east door
      if (!isDoor) placeBlock(ox + x, floorY + y, oz + 20, BlockType.DARK_OAK);
    }
  }

  // Parts & Service | Kitchen wall (x=15, z=21..38) with door
  for (let z = 21; z < PIZZERIA_DEPTH - 1; z++) {
    for (let y = 0; y < iWallH; y++) {
      const isDoor = z >= 28 && z <= 29 && y < 3;
      if (!isDoor) placeBlock(ox + 15, floorY + y, oz + z, BlockType.DARK_OAK);
    }
  }

  // Kitchen | Security Office wall (x=35, z=21..38) with door
  for (let z = 21; z < PIZZERIA_DEPTH - 1; z++) {
    for (let y = 0; y < iWallH; y++) {
      const isDoor = z >= 28 && z <= 29 && y < 3;
      if (!isDoor) placeBlock(ox + 35, floorY + y, oz + z, BlockType.DARK_OAK);
    }
  }

  // ===== MAIN DINING HALL (x=8..41, z=1..16) =====
  // Checkered floor
  for (let x = 8; x <= 41; x++) {
    for (let z = 1; z <= 16; z++) {
      const block = (x + z) % 2 === 0 ? BlockType.DEEPSLATE : BlockType.ANDESITE_BLOCK;
      placeBlock(ox + x, baseY, oz + z, block);
    }
  }

  // Booths along left wall (x=8..10, spaced every 5 along z)
  for (let bz = 3; bz <= 13; bz += 5) {
    // Seat (2 blocks long)
    for (let dz = 0; dz < 3; dz++) {
      placeBlock(ox + 8, floorY, oz + bz + dz, BlockType.RED_WOOL);     // seat
      placeBlock(ox + 8, floorY + 1, oz + bz + dz, BlockType.RED_WOOL); // back
    }
  }

  // Booths along right wall (x=41)
  for (let bz = 3; bz <= 13; bz += 5) {
    for (let dz = 0; dz < 3; dz++) {
      placeBlock(ox + 41, floorY, oz + bz + dz, BlockType.RED_WOOL);
      placeBlock(ox + 41, floorY + 1, oz + bz + dz, BlockType.RED_WOOL);
    }
  }

  // Tables in center (2x1 planks tops on wood legs, grid layout)
  for (let tx = 15; tx <= 35; tx += 5) {
    for (let tz = 4; tz <= 14; tz += 5) {
      // Table leg
      placeBlock(ox + tx, floorY, oz + tz, BlockType.WOOD);
      // Table top (2x2)
      placeBlock(ox + tx, floorY + 1, oz + tz, BlockType.PLANKS);
      placeBlock(ox + tx + 1, floorY + 1, oz + tz, BlockType.PLANKS);
      placeBlock(ox + tx, floorY + 1, oz + tz + 1, BlockType.PLANKS);
      placeBlock(ox + tx + 1, floorY + 1, oz + tz + 1, BlockType.PLANKS);
    }
  }

  // Ceiling lights in dining hall (MAGMA every 5 blocks)
  for (let x = 10; x <= 40; x += 5) {
    for (let z = 3; z <= 15; z += 5) {
      placeBlock(ox + x, floorY + wallHeight - 1, oz + z, BlockType.MAGMA);
    }
  }

  // ===== SHOW STAGE (x=8..41, z=17..19, elevated +1) =====
  // Stage platform (raised 1 block)
  for (let x = 8; x <= 41; x++) {
    for (let z = 17; z <= 19; z++) {
      placeBlock(ox + x, floorY, oz + z, BlockType.DARK_OAK);
    }
  }

  // Stage curtains (RED_WOOL on sides and back)
  for (let y = 1; y <= 4; y++) {
    for (let z = 17; z <= 19; z++) {
      placeBlock(ox + 8, floorY + y, oz + z, BlockType.RED_WOOL);
      placeBlock(ox + 41, floorY + y, oz + z, BlockType.RED_WOOL);
    }
    for (let x = 8; x <= 41; x++) {
      placeBlock(ox + x, floorY + y, oz + 19, BlockType.RED_WOOL);
    }
  }

  // Animatronic: Freddy (center) - DARK_OAK body + OBSIDIAN hat
  const freddyX = 25;
  placeBlock(ox + freddyX, floorY + 1, oz + 18, BlockType.DARK_OAK);     // legs
  placeBlock(ox + freddyX, floorY + 2, oz + 18, BlockType.DARK_OAK);     // body
  placeBlock(ox + freddyX, floorY + 3, oz + 18, BlockType.DARK_OAK);     // head
  placeBlock(ox + freddyX - 1, floorY + 2, oz + 18, BlockType.DARK_OAK); // left arm
  placeBlock(ox + freddyX + 1, floorY + 2, oz + 18, BlockType.DARK_OAK); // right arm
  placeBlock(ox + freddyX, floorY + 4, oz + 18, BlockType.OBSIDIAN);     // hat
  placeBlock(ox + freddyX - 1, floorY + 4, oz + 18, BlockType.OBSIDIAN); // hat brim
  placeBlock(ox + freddyX + 1, floorY + 4, oz + 18, BlockType.OBSIDIAN); // hat brim

  // Animatronic: Bonnie (left) - COBBLESTONE body (blue-ish)
  const bonnieX = 17;
  placeBlock(ox + bonnieX, floorY + 1, oz + 18, BlockType.COBBLESTONE);
  placeBlock(ox + bonnieX, floorY + 2, oz + 18, BlockType.COBBLESTONE);
  placeBlock(ox + bonnieX, floorY + 3, oz + 18, BlockType.COBBLESTONE);
  placeBlock(ox + bonnieX - 1, floorY + 2, oz + 18, BlockType.COBBLESTONE);
  placeBlock(ox + bonnieX + 1, floorY + 2, oz + 18, BlockType.COBBLESTONE);

  // Animatronic: Chica (right) - SAND body (yellow) + ORANGE_GLASS bib
  const chicaX = 33;
  placeBlock(ox + chicaX, floorY + 1, oz + 18, BlockType.SAND);
  placeBlock(ox + chicaX, floorY + 2, oz + 18, BlockType.ORANGE_GLASS);  // bib
  placeBlock(ox + chicaX, floorY + 3, oz + 18, BlockType.SAND);
  placeBlock(ox + chicaX - 1, floorY + 2, oz + 18, BlockType.SAND);
  placeBlock(ox + chicaX + 1, floorY + 2, oz + 18, BlockType.SAND);

  // ===== HALLWAYS (west x=1..6, east x=43..48, z=1..19) =====
  // Dark checkered floors
  for (let z = 1; z < 20; z++) {
    for (let x = 1; x <= 6; x++) {
      const block = (x + z) % 2 === 0 ? BlockType.DEEPSLATE : BlockType.OBSIDIAN;
      placeBlock(ox + x, baseY, oz + z, block);
    }
    for (let x = 43; x <= 48; x++) {
      const block = (x + z) % 2 === 0 ? BlockType.DEEPSLATE : BlockType.OBSIDIAN;
      placeBlock(ox + x, baseY, oz + z, block);
    }
  }

  // Sparse hallway ceiling lights (every 8 blocks)
  for (let z = 4; z <= 18; z += 8) {
    placeBlock(ox + 3, floorY + wallHeight - 1, oz + z, BlockType.MAGMA);
    placeBlock(ox + 46, floorY + wallHeight - 1, oz + z, BlockType.MAGMA);
  }

  // ===== PARTS & SERVICE (x=1..14, z=21..38) =====
  // Metal floor
  for (let x = 1; x <= 14; x++) {
    for (let z = 21; z <= 38; z++) {
      placeBlock(ox + x, baseY, oz + z, BlockType.METAL);
    }
  }
  // Scattered metal debris
  placeBlock(ox + 3, floorY, oz + 25, BlockType.METAL);
  placeBlock(ox + 5, floorY, oz + 30, BlockType.METAL);
  placeBlock(ox + 10, floorY, oz + 23, BlockType.METAL);
  placeBlock(ox + 7, floorY, oz + 35, BlockType.METAL);
  // Spare animatronic figure (disassembled)
  placeBlock(ox + 8, floorY, oz + 33, BlockType.COBBLESTONE);   // torso on floor
  placeBlock(ox + 9, floorY, oz + 33, BlockType.COBBLESTONE);   // head beside
  placeBlock(ox + 8, floorY, oz + 34, BlockType.COBBLESTONE);   // arm
  // Single dim light
  placeBlock(ox + 8, floorY + wallHeight - 1, oz + 30, BlockType.MAGMA);

  // ===== KITCHEN (x=16..34, z=21..38) =====
  // Stone floor
  for (let x = 16; x <= 34; x++) {
    for (let z = 21; z <= 38; z++) {
      placeBlock(ox + x, baseY, oz + z, BlockType.STONE);
    }
  }
  // Counters along back wall (STONE base + METAL top)
  for (let x = 17; x <= 33; x++) {
    placeBlock(ox + x, floorY, oz + 37, BlockType.STONE);
    placeBlock(ox + x, floorY + 1, oz + 37, BlockType.METAL);
  }
  // Side counter
  for (let z = 30; z <= 37; z++) {
    placeBlock(ox + 17, floorY, oz + z, BlockType.STONE);
    placeBlock(ox + 17, floorY + 1, oz + z, BlockType.METAL);
  }
  // Oven (COBBLESTONE box with MAGMA inside)
  placeBlock(ox + 30, floorY, oz + 37, BlockType.COBBLESTONE);
  placeBlock(ox + 31, floorY, oz + 37, BlockType.COBBLESTONE);
  placeBlock(ox + 30, floorY + 1, oz + 37, BlockType.COBBLESTONE);
  placeBlock(ox + 31, floorY + 1, oz + 37, BlockType.COBBLESTONE);
  placeBlock(ox + 30, floorY, oz + 36, BlockType.MAGMA);
  placeBlock(ox + 31, floorY, oz + 36, BlockType.MAGMA);
  // Kitchen light
  placeBlock(ox + 25, floorY + wallHeight - 1, oz + 30, BlockType.MAGMA);

  // ===== SECURITY OFFICE (x=36..48, z=21..38) =====
  // Checkered floor
  for (let x = 36; x <= 48; x++) {
    for (let z = 21; z <= 38; z++) {
      const block = (x + z) % 2 === 0 ? BlockType.DEEPSLATE : BlockType.ANDESITE_BLOCK;
      placeBlock(ox + x, baseY, oz + z, block);
    }
  }
  // Desk (PLANKS)
  for (let x = 40; x <= 44; x++) {
    placeBlock(ox + x, floorY, oz + 28, BlockType.WOOD);
    placeBlock(ox + x, floorY + 1, oz + 28, BlockType.PLANKS);
  }
  // Monitors on desk (BLACK_GLASS)
  placeBlock(ox + 41, floorY + 2, oz + 28, BlockType.BLACK_GLASS);
  placeBlock(ox + 42, floorY + 2, oz + 28, BlockType.BLACK_GLASS);
  placeBlock(ox + 43, floorY + 2, oz + 28, BlockType.BLACK_GLASS);
  // Fan (METAL)
  placeBlock(ox + 45, floorY + 1, oz + 26, BlockType.METAL);
  placeBlock(ox + 45, floorY + 2, oz + 26, BlockType.METAL);
  // Single dim light
  placeBlock(ox + 42, floorY + wallHeight - 1, oz + 30, BlockType.MAGMA);
}

function chunkContainsMansion(chunkWorldX: number, chunkWorldZ: number): boolean {
  const mansionMinX = MANSION_ORIGIN.x - 10;  // Include dead trees and graveyard
  const mansionMaxX = MANSION_ORIGIN.x + MANSION_WIDTH + 20;  // Include tank
  const mansionMinZ = MANSION_ORIGIN.z - 5;   // Include front steps
  const mansionMaxZ = MANSION_ORIGIN.z + MANSION_DEPTH + 10;  // Include tank
  
  const chunkMinX = chunkWorldX;
  const chunkMaxX = chunkWorldX + CHUNK_SIZE;
  const chunkMinZ = chunkWorldZ;
  const chunkMaxZ = chunkWorldZ + CHUNK_SIZE;
  
  return !(chunkMaxX < mansionMinX || chunkMinX > mansionMaxX ||
           chunkMaxZ < mansionMinZ || chunkMinZ > mansionMaxZ);
}

/**
 * Generate terrain for a single chunk
 */
export function generateChunk(position: ChunkPosition): ChunkData {
  const chunk = createEmptyChunkData();
  const worldX = position.x * CHUNK_SIZE;
  const worldZ = position.z * CHUNK_SIZE;

  // Pre-calculate heights for this chunk
  const heights: number[][] = [];
  for (let x = 0; x < CHUNK_SIZE; x++) {
    heights[x] = [];
    for (let z = 0; z < CHUNK_SIZE; z++) {
      heights[x][z] = getTerrainHeightAt(worldX + x, worldZ + z);
    }
  }

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const height = heights[x][z];
      const wx = worldX + x;
      const wz = worldZ + z;
      
      // Fill blocks from bottom to height
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        let blockType = BlockType.AIR;

        if (y === 0) {
          // Bedrock at bottom (using stone for now)
          blockType = BlockType.STONE;
        } else if (y < height) {
          // Check for caves first
          if (isCave(wx, y, wz, height)) {
            blockType = BlockType.AIR;
          } else if (y < height - 4) {
            // Deep stone layer - add some ore variation
            const oreNoise = fbm3D(wx, y, wz, 2, 0.5, 0.1);
            if (oreNoise > 0.75 && y < 20) {
              // Cobblestone patches in deep areas
              blockType = BlockType.COBBLESTONE;
            } else {
              blockType = BlockType.STONE;
            }
          } else if (y < height - 1) {
            // Dirt layer
            blockType = BlockType.DIRT;
          } else {
            // Top layer - varies by height
            if (height <= SEA_LEVEL + 1) {
              blockType = BlockType.SAND;
            } else if (height > 45) {
              // High altitude = stone peaks
              blockType = BlockType.STONE;
            } else {
              blockType = BlockType.GRASS;
            }
          }
        }
        // No permanent water - water only appears during tsunami

        setBlockInChunk(chunk, x, y, z, blockType);
      }
    }
  }

  // Add haunted mansion if this chunk overlaps with it
  if (chunkContainsMansion(worldX, worldZ)) {
    generateHauntedMansionInChunk(chunk, worldX, worldZ);
  }

  // Add missile launch pad and control panel if this chunk contains it
  if (chunkContainsMissileSite(worldX, worldZ)) {
    generateMissileSiteInChunk(chunk, worldX, worldZ);
  }

  // Carve lake for pirate ship
  if (chunkContainsLake(worldX, worldZ)) {
    generateLakeInChunk(chunk, worldX, worldZ);
  }

  // Add pirate ship if this chunk overlaps with it
  if (chunkContainsShip(worldX, worldZ)) {
    generatePirateShipInChunk(chunk, worldX, worldZ);
  }

  // Add imported Dark Fantasy Castle
  if (chunkContainsCastle(worldX, worldZ)) {
    generateCastleInChunk(chunk, worldX, worldZ);
  }

  // Add imported Waterpark
  if (chunkContainsWaterpark(worldX, worldZ)) {
    generateWaterparkInChunk(chunk, worldX, worldZ);
  }

  // Add Space Rocket
  if (chunkContainsRocket(worldX, worldZ)) {
    generateRocketInChunk(chunk, worldX, worldZ);
  }

  // Add FNAF Pizzeria
  if (chunkContainsPizzeria(worldX, worldZ)) {
    generatePizzeriaInChunk(chunk, worldX, worldZ);
  }

  return chunk;
}

/**
 * Generate a simple tree at the given position
 */
export function generateTree(
  chunk: ChunkData,
  x: number,
  baseY: number,
  z: number
): void {
  const trunkHeight = 4 + Math.floor(Math.random() * 3);
  
  // Generate trunk
  for (let y = 0; y < trunkHeight; y++) {
    setBlockInChunk(chunk, x, baseY + y, z, BlockType.WOOD);
  }
  
  // Generate leaves (simple sphere-ish shape)
  const leafStart = baseY + trunkHeight - 2;
  const leafEnd = baseY + trunkHeight + 2;
  
  for (let ly = leafStart; ly < leafEnd; ly++) {
    const radius = ly === leafEnd - 1 ? 1 : 2;
    for (let lx = -radius; lx <= radius; lx++) {
      for (let lz = -radius; lz <= radius; lz++) {
        if (lx === 0 && lz === 0 && ly < baseY + trunkHeight) {
          continue; // Skip trunk position
        }
        // Skip corners for rounder shape
        if (Math.abs(lx) === radius && Math.abs(lz) === radius) {
          continue;
        }
        const px = x + lx;
        const pz = z + lz;
        if (px >= 0 && px < CHUNK_SIZE && pz >= 0 && pz < CHUNK_SIZE) {
          setBlockInChunk(chunk, px, ly, pz, BlockType.LEAVES);
        }
      }
    }
  }
}
