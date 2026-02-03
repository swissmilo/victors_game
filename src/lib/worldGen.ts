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

const SEA_LEVEL = 32;
const BASE_HEIGHT = 25;
const MIN_HEIGHT = 8;
const MAX_HEIGHT = 58;

// Cave parameters
const CAVE_SCALE = 0.055;
const CAVE_THRESHOLD = 0.40;
const CAVE_ENTRANCE_SCALE = 0.03;

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
