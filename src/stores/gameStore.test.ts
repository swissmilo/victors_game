import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore, TSUNAMI_COUNTDOWN, BASE_WATER_LEVEL, MAX_WATER_LEVEL } from './gameStore';
import { BlockType } from '@/types';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('gameStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useGameStore.setState({
      playerPosition: [8, 50, 8],
      playerRotation: [0, 0],
      hotbarSelection: 0,
      inventory: [
        { blockType: BlockType.GRASS, count: 64 },
        { blockType: BlockType.DIRT, count: 64 },
        { blockType: BlockType.STONE, count: 64 },
        { blockType: BlockType.WOOD, count: 64 },
        { blockType: BlockType.PLANKS, count: 64 },
        { blockType: BlockType.COBBLESTONE, count: 64 },
        { blockType: BlockType.SAND, count: 64 },
        { blockType: BlockType.LEAVES, count: 64 },
        { blockType: BlockType.AIR, count: 0 },
      ],
      chunks: new Map(),
      isPlaying: false,
      isPaused: false,
      isFlying: false,
      tsunami: {
        phase: 'countdown',
        countdown: TSUNAMI_COUNTDOWN,
        waterLevel: BASE_WATER_LEVEL,
        baseWaterLevel: BASE_WATER_LEVEL,
        maxWaterLevel: MAX_WATER_LEVEL,
      },
    });
    
    // Clear localStorage mocks
    vi.clearAllMocks();
  });

  describe('player position', () => {
    it('should update player position', () => {
      const { setPlayerPosition } = useGameStore.getState();
      
      setPlayerPosition([10, 25, 15]);
      
      expect(useGameStore.getState().playerPosition).toEqual([10, 25, 15]);
    });
  });

  describe('hotbar selection', () => {
    it('should update hotbar selection for valid slots', () => {
      const { setHotbarSelection } = useGameStore.getState();
      
      setHotbarSelection(5);
      expect(useGameStore.getState().hotbarSelection).toBe(5);
      
      setHotbarSelection(0);
      expect(useGameStore.getState().hotbarSelection).toBe(0);
      
      setHotbarSelection(8);
      expect(useGameStore.getState().hotbarSelection).toBe(8);
    });

    it('should not update for invalid slots', () => {
      const { setHotbarSelection } = useGameStore.getState();
      
      setHotbarSelection(0); // Set to valid
      setHotbarSelection(-1); // Invalid
      expect(useGameStore.getState().hotbarSelection).toBe(0);
      
      setHotbarSelection(9); // Invalid (0-8 only)
      expect(useGameStore.getState().hotbarSelection).toBe(0);
    });
  });

  describe('inventory management', () => {
    it('should add blocks to existing stack', () => {
      const { addToInventory } = useGameStore.getState();
      
      // Grass is in slot 0 with 64 count initially
      useGameStore.setState({
        inventory: [
          { blockType: BlockType.GRASS, count: 32 },
          ...useGameStore.getState().inventory.slice(1),
        ],
      });
      
      addToInventory(BlockType.GRASS, 10);
      
      expect(useGameStore.getState().inventory[0].count).toBe(42);
    });

    it('should cap stack at 64', () => {
      const { addToInventory } = useGameStore.getState();
      
      useGameStore.setState({
        inventory: [
          { blockType: BlockType.GRASS, count: 60 },
          ...useGameStore.getState().inventory.slice(1),
        ],
      });
      
      addToInventory(BlockType.GRASS, 10);
      
      expect(useGameStore.getState().inventory[0].count).toBe(64);
    });

    it('should remove blocks from inventory', () => {
      const { removeFromInventory } = useGameStore.getState();
      
      const result = removeFromInventory(0, 10);
      
      expect(result).toBe(true);
      expect(useGameStore.getState().inventory[0].count).toBe(54);
    });

    it('should return false when removing more than available', () => {
      const { removeFromInventory } = useGameStore.getState();
      
      const result = removeFromInventory(0, 100);
      
      expect(result).toBe(false);
      expect(useGameStore.getState().inventory[0].count).toBe(64); // Unchanged
    });

    it('should set slot to AIR when emptied', () => {
      const { removeFromInventory } = useGameStore.getState();
      
      removeFromInventory(0, 64);
      
      expect(useGameStore.getState().inventory[0]).toEqual({
        blockType: BlockType.AIR,
        count: 0,
      });
    });
  });

  describe('chunk management', () => {
    it('should set and get chunks', () => {
      const { setChunk, getChunk } = useGameStore.getState();
      const mockChunk = {
        position: { x: 0, z: 0 },
        data: new Uint8Array(16 * 16 * 64),
        isDirty: false,
      };
      
      setChunk({ x: 0, z: 0 }, mockChunk);
      
      const retrieved = getChunk({ x: 0, z: 0 });
      expect(retrieved).toBeDefined();
      expect(retrieved?.position).toEqual({ x: 0, z: 0 });
    });

    it('should return undefined for non-existent chunk', () => {
      const { getChunk } = useGameStore.getState();
      
      const result = getChunk({ x: 999, z: 999 });
      
      expect(result).toBeUndefined();
    });

    it('should mark chunk as dirty', () => {
      const { setChunk, markChunkDirty, getChunk } = useGameStore.getState();
      const mockChunk = {
        position: { x: 1, z: 2 },
        data: new Uint8Array(16 * 16 * 64),
        isDirty: false,
      };
      
      setChunk({ x: 1, z: 2 }, mockChunk);
      markChunkDirty({ x: 1, z: 2 });
      
      expect(getChunk({ x: 1, z: 2 })?.isDirty).toBe(true);
    });
  });

  describe('game state', () => {
    it('should update isPlaying state', () => {
      const { setIsPlaying } = useGameStore.getState();
      
      setIsPlaying(true);
      expect(useGameStore.getState().isPlaying).toBe(true);
      
      setIsPlaying(false);
      expect(useGameStore.getState().isPlaying).toBe(false);
    });

    it('should update isPaused state', () => {
      const { setIsPaused } = useGameStore.getState();
      
      setIsPaused(true);
      expect(useGameStore.getState().isPaused).toBe(true);
      
      setIsPaused(false);
      expect(useGameStore.getState().isPaused).toBe(false);
    });

    it('should update isFlying state', () => {
      const { setIsFlying } = useGameStore.getState();
      
      setIsFlying(true);
      expect(useGameStore.getState().isFlying).toBe(true);
      
      setIsFlying(false);
      expect(useGameStore.getState().isFlying).toBe(false);
    });
  });

  describe('tsunami state', () => {
    it('should update tsunami state partially', () => {
      const { updateTsunami } = useGameStore.getState();
      
      updateTsunami({ phase: 'rising', waterLevel: 40 });
      
      const tsunami = useGameStore.getState().tsunami;
      expect(tsunami.phase).toBe('rising');
      expect(tsunami.waterLevel).toBe(40);
      expect(tsunami.countdown).toBe(TSUNAMI_COUNTDOWN); // Unchanged
    });

    it('should reset tsunami to initial state', () => {
      const { updateTsunami, resetTsunami } = useGameStore.getState();
      
      // Modify tsunami state
      updateTsunami({ phase: 'peak', waterLevel: 70, countdown: 0 });
      
      // Reset
      resetTsunami();
      
      const tsunami = useGameStore.getState().tsunami;
      expect(tsunami.phase).toBe('countdown');
      expect(tsunami.countdown).toBe(TSUNAMI_COUNTDOWN);
      expect(tsunami.waterLevel).toBe(BASE_WATER_LEVEL);
    });

    it('should export tsunami constants', () => {
      expect(TSUNAMI_COUNTDOWN).toBe(30);  // Reduced for testing
      expect(BASE_WATER_LEVEL).toBe(32);
      expect(MAX_WATER_LEVEL).toBe(70);
    });
  });

  describe('chunk unloading', () => {
    it('should unload chunks beyond max distance', () => {
      const { setChunk, unloadDistantChunks, getChunk } = useGameStore.getState();
      
      // Add chunks at various distances
      const nearChunk = {
        position: { x: 0, z: 0 },
        data: new Uint8Array(16 * 16 * 64),
        isDirty: false,
      };
      const farChunk = {
        position: { x: 20, z: 20 },
        data: new Uint8Array(16 * 16 * 64),
        isDirty: false,
      };
      
      setChunk({ x: 0, z: 0 }, nearChunk);
      setChunk({ x: 20, z: 20 }, farChunk);
      
      // Unload chunks beyond distance 5 from player at (0, 0)
      unloadDistantChunks(0, 0, 5);
      
      // Near chunk should remain
      expect(getChunk({ x: 0, z: 0 })).toBeDefined();
      
      // Far chunk should be unloaded
      expect(getChunk({ x: 20, z: 20 })).toBeUndefined();
    });

    it('should not unload chunks within distance', () => {
      const { setChunk, unloadDistantChunks, getChunk } = useGameStore.getState();
      
      const chunk1 = {
        position: { x: 2, z: 2 },
        data: new Uint8Array(16 * 16 * 64),
        isDirty: false,
      };
      const chunk2 = {
        position: { x: -3, z: 3 },
        data: new Uint8Array(16 * 16 * 64),
        isDirty: false,
      };
      
      setChunk({ x: 2, z: 2 }, chunk1);
      setChunk({ x: -3, z: 3 }, chunk2);
      
      // Unload chunks beyond distance 5
      unloadDistantChunks(0, 0, 5);
      
      // Both should remain (within distance)
      expect(getChunk({ x: 2, z: 2 })).toBeDefined();
      expect(getChunk({ x: -3, z: 3 })).toBeDefined();
    });
  });

  describe('world reset', () => {
    it('should reset world to initial state', () => {
      const { setPlayerPosition, setChunk, setIsFlying, updateTsunami, resetWorld } = useGameStore.getState();
      
      // Modify various state
      setPlayerPosition([100, 100, 100]);
      setIsFlying(true);
      updateTsunami({ phase: 'rising', waterLevel: 50 });
      setChunk({ x: 0, z: 0 }, {
        position: { x: 0, z: 0 },
        data: new Uint8Array(16 * 16 * 64),
        isDirty: false,
      });
      
      // Reset
      resetWorld();
      
      const state = useGameStore.getState();
      expect(state.playerPosition).toEqual([8, 50, 8]);
      expect(state.isFlying).toBe(false);
      expect(state.chunks.size).toBe(0);
      expect(state.tsunami.phase).toBe('countdown');
    });
  });
});
