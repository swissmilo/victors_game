import { create } from 'zustand';
import { BlockType, Chunk, ChunkPosition, chunkPositionToKey } from '@/types';

interface InventorySlot {
  blockType: BlockType;
  count: number;
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
  
  // Actions
  setPlayerPosition: (position: [number, number, number]) => void;
  setPlayerRotation: (rotation: [number, number]) => void;
  setHotbarSelection: (slot: number) => void;
  addToInventory: (blockType: BlockType, count?: number) => void;
  removeFromInventory: (slot: number, count?: number) => boolean;
  getChunk: (position: ChunkPosition) => Chunk | undefined;
  setChunk: (position: ChunkPosition, chunk: Chunk) => void;
  markChunkDirty: (position: ChunkPosition) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setIsPaused: (isPaused: boolean) => void;
  setIsFlying: (isFlying: boolean) => void;
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
  
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  
  setIsPaused: (isPaused) => set({ isPaused }),
  
  setIsFlying: (isFlying) => set({ isFlying }),
}));
