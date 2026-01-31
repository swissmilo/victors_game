import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import { BlockType } from '@/types';

describe('gameStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useGameStore.setState({
      playerPosition: [0, 20, 0],
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
    });
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
  });
});
