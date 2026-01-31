import { create } from 'zustand';
import { BlockType, Chunk, ChunkPosition, chunkPositionToKey } from '@/types';
import { saveWorld, loadWorld, convertLoadedChunks, hasSavedWorld } from '@/lib/worldPersistence';

interface InventorySlot {
  blockType: BlockType;
  count: number;
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

interface GameState {
  // Player state
  playerPosition: [number, number, number];
  playerRotation: [number, number];
  
  // Inventory
  inventory: InventorySlot[];
  hotbarSelection: number;
  
  // World state
  chunks: Map<string, Chunk>;
  renderDistance: number;
  
  // Game settings
  isPlaying: boolean;
  isPaused: boolean;
  isFlying: boolean;
  
  // Tsunami state
  tsunami: TsunamiState;
  
  // Actions
  setPlayerPosition: (position: [number, number, number]) => void;
  setPlayerRotation: (rotation: [number, number]) => void;
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
  
  // Tsunami actions
  updateTsunami: (updates: Partial<TsunamiState>) => void;
  resetTsunami: () => void;
  
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
  { blockType: BlockType.AIR, count: 0 },
];

// Tsunami configuration
const TSUNAMI_COUNTDOWN = 60;  // 60 seconds between tsunamis
const BASE_WATER_LEVEL = 32;   // Sea level
const MAX_WATER_LEVEL = 70;    // Top of haunted mansion (~35 blocks above base terrain)

const INITIAL_TSUNAMI: TsunamiState = {
  phase: 'countdown',
  countdown: TSUNAMI_COUNTDOWN,
  waterLevel: BASE_WATER_LEVEL,
  baseWaterLevel: BASE_WATER_LEVEL,
  maxWaterLevel: MAX_WATER_LEVEL,
};

export const useGameStore = create<GameState>((set, get) => ({
  // Initial state
  playerPosition: [0, 20, 0],
  playerRotation: [0, 0],
  inventory: INITIAL_INVENTORY,
  hotbarSelection: 0,
  chunks: new Map(),
  renderDistance: 4,
  isPlaying: false,
  isPaused: false,
  isFlying: false,
  tsunami: INITIAL_TSUNAMI,

  // Actions
  setPlayerPosition: (position) => set({ playerPosition: position }),
  
  setPlayerRotation: (rotation) => set({ playerRotation: rotation }),
  
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
  
  updateTsunami: (updates) => set((state) => ({
    tsunami: { ...state.tsunami, ...updates },
  })),
  
  resetTsunami: () => set({
    tsunami: INITIAL_TSUNAMI,
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
    set({
      playerPosition: saveData.playerPosition,
      playerRotation: saveData.playerRotation,
      inventory: saveData.inventory,
      hotbarSelection: saveData.hotbarSelection,
      chunks,
      tsunami: INITIAL_TSUNAMI,
    });
    
    return true;
  },
  
  hasExistingSave: (worldId = 'default') => {
    return hasSavedWorld(worldId);
  },
  
  resetWorld: () => {
    set({
      playerPosition: [8, 50, 8],
      playerRotation: [0, 0],
      inventory: INITIAL_INVENTORY,
      hotbarSelection: 0,
      chunks: new Map(),
      isPlaying: false,
      isPaused: false,
      isFlying: false,
      tsunami: INITIAL_TSUNAMI,
    });
  },
}));

// Export tsunami constants for use in components
export { TSUNAMI_COUNTDOWN, BASE_WATER_LEVEL, MAX_WATER_LEVEL };
