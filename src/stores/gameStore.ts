import { create } from 'zustand';
import { BlockType, Chunk, ChunkPosition, chunkPositionToKey } from '@/types';
import { saveWorld, loadWorld, convertLoadedChunks, hasSavedWorld } from '@/lib/worldPersistence';

interface InventorySlot {
  blockType: BlockType;
  count: number;
}

// Catastrophe types
export type CatastropheType = 'earthquake' | 'black_hole' | 'tsunami' | 'blood_rain' | 'hurricane';

// Catastrophe sequence - order in which they occur
const CATASTROPHE_SEQUENCE: CatastropheType[] = ['earthquake', 'black_hole', 'tsunami', 'blood_rain', 'hurricane'];

// Get a random starting point in the catastrophe sequence
function getRandomCatastropheStart(): { current: CatastropheType; next: CatastropheType } {
  const startIndex = Math.floor(Math.random() * CATASTROPHE_SEQUENCE.length);
  const nextIndex = (startIndex + 1) % CATASTROPHE_SEQUENCE.length;
  return {
    current: CATASTROPHE_SEQUENCE[startIndex],
    next: CATASTROPHE_SEQUENCE[nextIndex],
  };
}

// Tsunami phases
export type TsunamiPhase = 'countdown' | 'rising' | 'peak' | 'falling';

interface TsunamiState {
  phase: TsunamiPhase;
  countdown: number;        // Seconds until next tsunami
  waterLevel: number;       // Current water Y level
  baseWaterLevel: number;   // Normal sea level
  maxWaterLevel: number;    // Peak tsunami height
}

// Earthquake phases
export type EarthquakePhase = 'countdown' | 'rumbling' | 'quake' | 'settling';

interface EarthquakeState {
  phase: EarthquakePhase;
  countdown: number;        // Seconds until earthquake
  intensity: number;        // 0-1, controls shake intensity
  hasDestroyedBlocks: boolean;  // Whether blocks have been destroyed this cycle
}

// Black hole phases
export type BlackHolePhase = 'countdown' | 'appearing' | 'pulling' | 'consuming' | 'blackout';

interface BlackHoleState {
  phase: BlackHolePhase;
  countdown: number;        // Seconds until black hole
  position: [number, number, number];  // World position of black hole
  intensity: number;        // 0-1, controls pull strength and visual size
  blackoutOpacity: number;  // 0-1, for screen blackout
  pullForce: [number, number, number];  // Force applied to player each frame
}

// Blood rain phases
export type BloodRainPhase = 'countdown' | 'starting' | 'active' | 'ending';

interface BloodRainState {
  phase: BloodRainPhase;
  countdown: number;        // Seconds until blood rain
  intensity: number;        // 0-1, controls darkness and rain intensity
  duration: number;         // How long the rain lasts
}

// Hurricane phases
export type HurricanePhase = 'countdown' | 'forming' | 'active' | 'dissipating';

interface HurricaneState {
  phase: HurricanePhase;
  countdown: number;          // Seconds until hurricane
  position: [number, number, number];  // Current world position
  intensity: number;          // 0-1, controls size and pull strength
  angle: number;              // Current orbit angle around player
  orbitRadius: number;        // Current distance from player
  rotation: number;           // Funnel spin rotation
  pullForce: [number, number, number];  // Force applied to player
  hasDestroyedBlocks: boolean;  // Whether blocks have been destroyed this cycle
}

// Teleporter position
export interface TeleporterPosition {
  x: number;
  y: number;
  z: number;
}

interface GameState {
  // Player state
  playerPosition: [number, number, number];
  playerRotation: [number, number];
  respawnPosition: [number, number, number] | null;  // When set, Player teleports here and clears it
  
  // Inventory
  inventory: InventorySlot[];
  hotbarSelection: number;
  
  // World state
  chunks: Map<string, Chunk>;
  renderDistance: number;
  
  // Teleporter positions (placed by player)
  teleporters: TeleporterPosition[];
  
  // Game settings
  isPlaying: boolean;
  isPaused: boolean;
  isFlying: boolean;
  
  // Catastrophe system
  currentCatastrophe: CatastropheType;
  nextCatastrophe: CatastropheType;
  
  // Earthquake state
  earthquake: EarthquakeState;
  
  // Black hole state
  blackHole: BlackHoleState;
  
  // Tsunami state
  tsunami: TsunamiState;
  
  // Blood rain state
  bloodRain: BloodRainState;

  // Hurricane state
  hurricane: HurricaneState;

  // Actions
  setPlayerPosition: (position: [number, number, number]) => void;
  setPlayerRotation: (rotation: [number, number]) => void;
  setRespawnPosition: (position: [number, number, number] | null) => void;
  setHotbarSelection: (slot: number) => void;
  addToInventory: (blockType: BlockType, count?: number) => void;
  removeFromInventory: (slot: number, count?: number) => boolean;
  getChunk: (position: ChunkPosition) => Chunk | undefined;
  setChunk: (position: ChunkPosition, chunk: Chunk) => void;
  markChunkDirty: (position: ChunkPosition) => void;
  unloadDistantChunks: (playerChunkX: number, playerChunkZ: number, maxDistance: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setIsPaused: (isPaused: boolean) => void;
  setIsFlying: (isFlying: boolean) => void;
  
  // Teleporter actions
  addTeleporter: (position: TeleporterPosition) => void;
  removeTeleporter: (position: TeleporterPosition) => void;
  
  // Catastrophe actions
  setCurrentCatastrophe: (type: CatastropheType) => void;
  switchToNextCatastrophe: () => void;
  
  // Earthquake actions
  updateEarthquake: (updates: Partial<EarthquakeState>) => void;
  resetEarthquake: () => void;
  
  // Black hole actions
  updateBlackHole: (updates: Partial<BlackHoleState>) => void;
  resetBlackHole: () => void;
  
  // Tsunami actions
  updateTsunami: (updates: Partial<TsunamiState>) => void;
  resetTsunami: () => void;
  
  // Blood rain actions
  updateBloodRain: (updates: Partial<BloodRainState>) => void;
  resetBloodRain: () => void;

  // Hurricane actions
  updateHurricane: (updates: Partial<HurricaneState>) => void;
  resetHurricane: () => void;

  // Persistence actions
  saveGame: (worldId?: string) => boolean;
  loadGame: (worldId?: string) => boolean;
  hasExistingSave: (worldId?: string) => boolean;
  resetWorld: () => void;
}

const INITIAL_INVENTORY: InventorySlot[] = [
  { blockType: BlockType.GRASS, count: 64 },
  { blockType: BlockType.DIRT, count: 64 },
  { blockType: BlockType.STONE, count: 64 },
  { blockType: BlockType.WOOD, count: 64 },
  { blockType: BlockType.PLANKS, count: 64 },
  { blockType: BlockType.COBBLESTONE, count: 64 },
  { blockType: BlockType.SAND, count: 64 },
  { blockType: BlockType.LEAVES, count: 64 },
  { blockType: BlockType.TELEPORTER, count: 64 },
];

// Catastrophe configuration
const CATASTROPHE_COUNTDOWN = 30;  // 30 seconds between catastrophes (for testing)

// Earthquake configuration
const EARTHQUAKE_COUNTDOWN = CATASTROPHE_COUNTDOWN;

// Black hole configuration
const BLACK_HOLE_COUNTDOWN = CATASTROPHE_COUNTDOWN;

// Tsunami configuration
const TSUNAMI_COUNTDOWN = CATASTROPHE_COUNTDOWN;
const BASE_WATER_LEVEL = 0;    // Bottom of world (no water when no tsunami)
const MAX_WATER_LEVEL = 70;    // Top of haunted mansion (~35 blocks above base terrain)

// Blood rain configuration
const BLOOD_RAIN_COUNTDOWN = CATASTROPHE_COUNTDOWN;
const BLOOD_RAIN_DURATION = 20;  // Seconds of blood rain

// Hurricane configuration
const HURRICANE_COUNTDOWN = CATASTROPHE_COUNTDOWN;

const INITIAL_EARTHQUAKE: EarthquakeState = {
  phase: 'countdown',
  countdown: EARTHQUAKE_COUNTDOWN,
  intensity: 0,
  hasDestroyedBlocks: false,
};

const INITIAL_BLACK_HOLE: BlackHoleState = {
  phase: 'countdown',
  countdown: BLACK_HOLE_COUNTDOWN,
  position: [0, 40, 0],
  intensity: 0,
  blackoutOpacity: 0,
  pullForce: [0, 0, 0],
};

const INITIAL_TSUNAMI: TsunamiState = {
  phase: 'countdown',
  countdown: TSUNAMI_COUNTDOWN,
  waterLevel: BASE_WATER_LEVEL,
  baseWaterLevel: BASE_WATER_LEVEL,
  maxWaterLevel: MAX_WATER_LEVEL,
};

const INITIAL_BLOOD_RAIN: BloodRainState = {
  phase: 'countdown',
  countdown: BLOOD_RAIN_COUNTDOWN,
  intensity: 0,
  duration: BLOOD_RAIN_DURATION,
};

const INITIAL_HURRICANE: HurricaneState = {
  phase: 'countdown',
  countdown: HURRICANE_COUNTDOWN,
  position: [0, 30, 0],
  intensity: 0,
  angle: 0,
  orbitRadius: 25,
  rotation: 0,
  pullForce: [0, 0, 0],
  hasDestroyedBlocks: false,
};

// Get random starting catastrophe for initial state
const initialCatastrophe = getRandomCatastropheStart();

export const useGameStore = create<GameState>((set, get) => ({
  // Initial state
  playerPosition: [0, 20, 0],
  playerRotation: [0, 0],
  respawnPosition: null,
  inventory: INITIAL_INVENTORY,
  hotbarSelection: 0,
  chunks: new Map(),
  renderDistance: 4,
  teleporters: [],
  isPlaying: false,
  isPaused: false,
  isFlying: false,
  currentCatastrophe: initialCatastrophe.current,
  nextCatastrophe: initialCatastrophe.next,
  earthquake: INITIAL_EARTHQUAKE,
  blackHole: INITIAL_BLACK_HOLE,
  tsunami: INITIAL_TSUNAMI,
  bloodRain: INITIAL_BLOOD_RAIN,
  hurricane: INITIAL_HURRICANE,

  // Actions
  setPlayerPosition: (position) => set({ playerPosition: position }),
  
  setPlayerRotation: (rotation) => set({ playerRotation: rotation }),
  
  setRespawnPosition: (position) => set({ respawnPosition: position }),
  
  setHotbarSelection: (slot) => {
    if (slot >= 0 && slot < 9) {
      set({ hotbarSelection: slot });
    }
  },
  
  addToInventory: (blockType, count = 1) => {
    const { inventory } = get();
    const existingSlot = inventory.findIndex(
      (slot) => slot.blockType === blockType && slot.count < 64
    );
    
    if (existingSlot !== -1) {
      const newInventory = [...inventory];
      newInventory[existingSlot] = {
        ...newInventory[existingSlot],
        count: Math.min(64, newInventory[existingSlot].count + count),
      };
      set({ inventory: newInventory });
    } else {
      const emptySlot = inventory.findIndex((slot) => slot.count === 0);
      if (emptySlot !== -1) {
        const newInventory = [...inventory];
        newInventory[emptySlot] = { blockType, count };
        set({ inventory: newInventory });
      }
    }
  },
  
  removeFromInventory: (slot, count = 1) => {
    const { inventory } = get();
    if (slot < 0 || slot >= inventory.length || inventory[slot].count < count) {
      return false;
    }
    
    const newInventory = [...inventory];
    newInventory[slot] = {
      ...newInventory[slot],
      count: newInventory[slot].count - count,
    };
    
    if (newInventory[slot].count === 0) {
      newInventory[slot] = { blockType: BlockType.AIR, count: 0 };
    }
    
    set({ inventory: newInventory });
    return true;
  },
  
  getChunk: (position) => {
    const key = chunkPositionToKey(position);
    return get().chunks.get(key);
  },
  
  setChunk: (position, chunk) => {
    const key = chunkPositionToKey(position);
    const newChunks = new Map(get().chunks);
    newChunks.set(key, chunk);
    set({ chunks: newChunks });
  },
  
  markChunkDirty: (position) => {
    const key = chunkPositionToKey(position);
    const { chunks } = get();
    const chunk = chunks.get(key);
    if (chunk) {
      const newChunks = new Map(chunks);
      newChunks.set(key, { ...chunk, isDirty: true });
      set({ chunks: newChunks });
    }
  },
  
  unloadDistantChunks: (playerChunkX, playerChunkZ, maxDistance) => {
    const { chunks } = get();
    const keysToRemove: string[] = [];
    
    chunks.forEach((chunk, key) => {
      const dx = chunk.position.x - playerChunkX;
      const dz = chunk.position.z - playerChunkZ;
      const distance = Math.max(Math.abs(dx), Math.abs(dz));
      
      if (distance > maxDistance) {
        keysToRemove.push(key);
      }
    });
    
    if (keysToRemove.length > 0) {
      const newChunks = new Map(chunks);
      for (const key of keysToRemove) {
        newChunks.delete(key);
      }
      set({ chunks: newChunks });
    }
  },
  
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  
  setIsPaused: (isPaused) => set({ isPaused }),
  
  setIsFlying: (isFlying) => set({ isFlying }),
  
  addTeleporter: (position) => {
    const { teleporters } = get();
    // Check if teleporter already exists at this position
    const exists = teleporters.some(
      t => t.x === position.x && t.y === position.y && t.z === position.z
    );
    if (!exists) {
      set({ teleporters: [...teleporters, position] });
    }
  },
  
  removeTeleporter: (position) => {
    const { teleporters } = get();
    set({
      teleporters: teleporters.filter(
        t => !(t.x === position.x && t.y === position.y && t.z === position.z)
      ),
    });
  },
  
  setCurrentCatastrophe: (type) => set({ currentCatastrophe: type }),
  
  switchToNextCatastrophe: () => {
    const { currentCatastrophe } = get();
    // Cycle: earthquake → black_hole → tsunami → blood_rain → earthquake
    const currentIndex = CATASTROPHE_SEQUENCE.indexOf(currentCatastrophe);
    const nextIndex = (currentIndex + 1) % CATASTROPHE_SEQUENCE.length;
    const afterNextIndex = (currentIndex + 2) % CATASTROPHE_SEQUENCE.length;
    
    set({
      currentCatastrophe: CATASTROPHE_SEQUENCE[nextIndex],
      nextCatastrophe: CATASTROPHE_SEQUENCE[afterNextIndex],
    });
  },
  
  updateEarthquake: (updates) => set((state) => ({
    earthquake: { ...state.earthquake, ...updates },
  })),
  
  resetEarthquake: () => set({
    earthquake: INITIAL_EARTHQUAKE,
  }),
  
  updateBlackHole: (updates) => set((state) => ({
    blackHole: { ...state.blackHole, ...updates },
  })),
  
  resetBlackHole: () => set({
    blackHole: INITIAL_BLACK_HOLE,
  }),
  
  updateTsunami: (updates) => set((state) => ({
    tsunami: { ...state.tsunami, ...updates },
  })),
  
  resetTsunami: () => set({
    tsunami: INITIAL_TSUNAMI,
  }),
  
  updateBloodRain: (updates) => set((state) => ({
    bloodRain: { ...state.bloodRain, ...updates },
  })),

  resetBloodRain: () => set({
    bloodRain: INITIAL_BLOOD_RAIN,
  }),

  updateHurricane: (updates) => set((state) => ({
    hurricane: { ...state.hurricane, ...updates },
  })),

  resetHurricane: () => set({
    hurricane: INITIAL_HURRICANE,
  }),

  saveGame: (worldId = 'default') => {
    const state = get();
    return saveWorld(
      worldId,
      state.playerPosition,
      state.playerRotation,
      state.inventory,
      state.hotbarSelection,
      state.chunks
    );
  },
  
  loadGame: (worldId = 'default') => {
    const saveData = loadWorld(worldId);
    if (!saveData) return false;
    
    const chunks = convertLoadedChunks(saveData.chunks, saveData.version);
    const randomStart = getRandomCatastropheStart();
    set({
      playerPosition: saveData.playerPosition,
      playerRotation: saveData.playerRotation,
      respawnPosition: null,
      inventory: saveData.inventory,
      hotbarSelection: saveData.hotbarSelection,
      chunks,
      teleporters: [],  // Reset teleporters - they'll need to be re-placed
      currentCatastrophe: randomStart.current,
      nextCatastrophe: randomStart.next,
      earthquake: INITIAL_EARTHQUAKE,
      blackHole: INITIAL_BLACK_HOLE,
      tsunami: INITIAL_TSUNAMI,
      bloodRain: INITIAL_BLOOD_RAIN,
      hurricane: INITIAL_HURRICANE,
    });

    return true;
  },
  
  hasExistingSave: (worldId = 'default') => {
    return hasSavedWorld(worldId);
  },
  
  resetWorld: () => {
    const randomStart = getRandomCatastropheStart();
    set({
      playerPosition: [8, 50, 8],
      playerRotation: [0, 0],
      respawnPosition: null,
      inventory: INITIAL_INVENTORY,
      hotbarSelection: 0,
      chunks: new Map(),
      teleporters: [],
      isPlaying: false,
      isPaused: false,
      isFlying: false,
      currentCatastrophe: randomStart.current,
      nextCatastrophe: randomStart.next,
      earthquake: INITIAL_EARTHQUAKE,
      blackHole: INITIAL_BLACK_HOLE,
      tsunami: INITIAL_TSUNAMI,
      bloodRain: INITIAL_BLOOD_RAIN,
      hurricane: INITIAL_HURRICANE,
    });
  },
}));

// Export catastrophe constants for use in components
export { EARTHQUAKE_COUNTDOWN, BLACK_HOLE_COUNTDOWN, TSUNAMI_COUNTDOWN, BASE_WATER_LEVEL, MAX_WATER_LEVEL, BLOOD_RAIN_COUNTDOWN, BLOOD_RAIN_DURATION, HURRICANE_COUNTDOWN };
