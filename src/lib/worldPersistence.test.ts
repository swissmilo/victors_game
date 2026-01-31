import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  saveWorld, 
  loadWorld, 
  hasSavedWorld, 
  deleteWorld, 
  getSavedWorlds,
  convertLoadedChunks 
} from './worldPersistence';
import { BlockType } from '@/types';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    reset: () => { store = {}; },
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('worldPersistence', () => {
  beforeEach(() => {
    localStorageMock.reset();
    vi.clearAllMocks();
  });

  describe('hasSavedWorld', () => {
    it('should return false when no save exists', () => {
      expect(hasSavedWorld()).toBe(false);
    });

    it('should return true when save exists', () => {
      localStorageMock.setItem('victors_world_save_default', '{}');
      expect(hasSavedWorld()).toBe(true);
    });

    it('should check specific world IDs', () => {
      localStorageMock.setItem('victors_world_save_myworld', '{}');
      expect(hasSavedWorld('myworld')).toBe(true);
      expect(hasSavedWorld('otherworld')).toBe(false);
    });
  });

  describe('saveWorld', () => {
    it('should save world state to localStorage', () => {
      const chunks = new Map();
      chunks.set('0,0', {
        position: { x: 0, z: 0 },
        data: new Uint8Array([1, 2, 3, 4]),
        isDirty: false,
      });

      const result = saveWorld(
        'default',
        [10, 50, 20],
        [0.5, 0.5],
        [{ blockType: BlockType.GRASS, count: 32 }],
        0,
        chunks
      );

      expect(result).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalled();
      
      // Verify save data structure
      const savedData = JSON.parse(
        localStorageMock.setItem.mock.calls.find(
          (call: string[]) => call[0] === 'victors_world_save_default'
        )?.[1] || '{}'
      );
      
      expect(savedData.version).toBe(2); // Version 2 uses RLE compression
      expect(savedData.playerPosition).toEqual([10, 50, 20]);
      expect(savedData.playerRotation).toEqual([0.5, 0.5]);
      expect(savedData.chunks).toHaveLength(1);
      // Data is now RLE compressed: [1,1, 2,1, 3,1, 4,1] -> each value appears once
      expect(savedData.chunks[0].compressed).toBe(true);
    });

    it('should update world list on save', () => {
      const chunks = new Map();
      
      saveWorld('default', [0, 0, 0], [0, 0], [], 0, chunks);

      // Check world list was updated
      const worldListCall = localStorageMock.setItem.mock.calls.find(
        (call: string[]) => call[0] === 'victors_world_list'
      );
      expect(worldListCall).toBeDefined();
      
      const worldList = JSON.parse(worldListCall?.[1] || '[]');
      expect(worldList).toHaveLength(1);
      expect(worldList[0].id).toBe('default');
      expect(worldList[0].name).toBe('My World');
    });
  });

  describe('loadWorld', () => {
    it('should return null when no save exists', () => {
      expect(loadWorld()).toBeNull();
    });

    it('should load saved world state', () => {
      const saveData = {
        version: 1,
        savedAt: Date.now(),
        playerPosition: [15, 40, 25],
        playerRotation: [0.2, 0.3],
        inventory: [{ blockType: BlockType.STONE, count: 64 }],
        hotbarSelection: 2,
        chunks: [
          { key: '0,0', position: { x: 0, z: 0 }, data: [1, 2, 3] }
        ],
      };
      
      localStorageMock.setItem('victors_world_save_default', JSON.stringify(saveData));

      const loaded = loadWorld();
      
      expect(loaded).not.toBeNull();
      expect(loaded?.playerPosition).toEqual([15, 40, 25]);
      expect(loaded?.playerRotation).toEqual([0.2, 0.3]);
      expect(loaded?.hotbarSelection).toBe(2);
      expect(loaded?.chunks).toHaveLength(1);
    });
  });

  describe('deleteWorld', () => {
    it('should remove saved world from localStorage', () => {
      localStorageMock.setItem('victors_world_save_default', '{}');
      localStorageMock.setItem('victors_world_list', JSON.stringify([{ id: 'default' }]));

      const result = deleteWorld();
      
      expect(result).toBe(true);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('victors_world_save_default');
    });
  });

  describe('getSavedWorlds', () => {
    it('should return empty array when no worlds exist', () => {
      expect(getSavedWorlds()).toEqual([]);
    });

    it('should return list of saved worlds', () => {
      const worldList = [
        { id: 'world1', name: 'World 1', createdAt: 1000, lastPlayed: 2000 },
        { id: 'world2', name: 'World 2', createdAt: 1500, lastPlayed: 2500 },
      ];
      localStorageMock.setItem('victors_world_list', JSON.stringify(worldList));

      const result = getSavedWorlds();
      
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('World 1');
      expect(result[1].name).toBe('World 2');
    });
  });

  describe('convertLoadedChunks', () => {
    it('should convert saved chunk data back to Map format', () => {
      const savedChunks = [
        { key: '0,0', position: { x: 0, z: 0 }, data: [1, 2, 3, 4] },
        { key: '1,0', position: { x: 1, z: 0 }, data: [5, 6, 7, 8] },
      ];

      const result = convertLoadedChunks(savedChunks);
      
      expect(result.size).toBe(2);
      expect(result.get('0,0')).toBeDefined();
      expect(result.get('0,0')?.data).toBeInstanceOf(Uint8Array);
      expect(Array.from(result.get('0,0')?.data || [])).toEqual([1, 2, 3, 4]);
      expect(result.get('1,0')?.position).toEqual({ x: 1, z: 0 });
    });

    it('should set isDirty to false for all loaded chunks', () => {
      const savedChunks = [
        { key: '0,0', position: { x: 0, z: 0 }, data: [1, 2, 3] },
      ];

      const result = convertLoadedChunks(savedChunks);
      
      expect(result.get('0,0')?.isDirty).toBe(false);
    });
  });
});
