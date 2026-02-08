/**
 * World persistence - save and load world state to/from localStorage
 * Uses Run-Length Encoding (RLE) compression to reduce storage size
 */

import { BlockType } from '@/types';

const WORLD_SAVE_KEY = 'victors_world_save';
const WORLD_LIST_KEY = 'victors_world_list';
const MAX_CHUNKS_TO_SAVE = 100; // Limit chunks to prevent quota issues

interface InventorySlot {
  blockType: BlockType;
  count: number;
}

interface SavedChunk {
  key: string;
  position: { x: number; z: number };
  data: number[]; // RLE compressed: [value, count, value, count, ...]
  compressed?: boolean; // Flag to indicate RLE compression
}

/**
 * Compress chunk data using Run-Length Encoding
 * Groups consecutive identical values: [1,1,1,2,2] -> [1,3,2,2]
 */
function compressRLE(data: Uint8Array): number[] {
  if (data.length === 0) return [];
  
  const result: number[] = [];
  let currentValue = data[0];
  let count = 1;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i] === currentValue && count < 255) {
      count++;
    } else {
      result.push(currentValue, count);
      currentValue = data[i];
      count = 1;
    }
  }
  result.push(currentValue, count);
  
  return result;
}

/**
 * Decompress RLE data back to Uint8Array
 */
function decompressRLE(compressed: number[], expectedLength: number): Uint8Array {
  const result = new Uint8Array(expectedLength);
  let index = 0;
  
  for (let i = 0; i < compressed.length; i += 2) {
    const value = compressed[i];
    const count = compressed[i + 1];
    for (let j = 0; j < count && index < expectedLength; j++) {
      result[index++] = value;
    }
  }
  
  return result;
}

interface ZombieData {
  id: number;
  position: [number, number, number];
  rotation: number;
  health: number;
  targetDirection: [number, number, number];
  wanderTimer: number;
  isHit: boolean;
  hitTimer: number;
  isDead: boolean;
  deathTimer: number; // Time since death for fade-out animation
}

interface WorldSaveData {
  version: number;
  savedAt: number;
  playerPosition: [number, number, number];
  playerRotation: [number, number];
  inventory: InventorySlot[];
  hotbarSelection: number;
  chunks: SavedChunk[];
  zombies?: ZombieData[]; // Optional for backwards compatibility
}

interface WorldListEntry {
  id: string;
  name: string;
  createdAt: number;
  lastPlayed: number;
}

/**
 * Get list of saved worlds
 */
export function getSavedWorlds(): WorldListEntry[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const listJson = localStorage.getItem(WORLD_LIST_KEY);
    if (!listJson) return [];
    return JSON.parse(listJson);
  } catch (error) {
    console.error('Failed to load world list:', error);
    return [];
  }
}

/**
 * Check if a saved world exists
 */
export function hasSavedWorld(worldId: string = 'default'): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    return localStorage.getItem(`${WORLD_SAVE_KEY}_${worldId}`) !== null;
  } catch {
    return false;
  }
}

/**
 * Save world state to localStorage with RLE compression
 */
export function saveWorld(
  worldId: string = 'default',
  playerPosition: [number, number, number],
  playerRotation: [number, number],
  inventory: InventorySlot[],
  hotbarSelection: number,
  chunks: Map<string, { data: Uint8Array; position: { x: number; z: number }; isDirty: boolean }>,
  zombies: ZombieData[] = []
): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    // Convert chunks Map to array with RLE compression
    // Prioritize dirty chunks and limit total to prevent quota issues
    const savedChunks: SavedChunk[] = [];
    const chunkEntries = Array.from(chunks.entries());
    
    // Sort: dirty chunks first, then by distance to player
    const playerChunkX = Math.floor(playerPosition[0] / 16);
    const playerChunkZ = Math.floor(playerPosition[2] / 16);
    
    chunkEntries.sort((a, b) => {
      // Dirty chunks have priority
      if (a[1].isDirty !== b[1].isDirty) {
        return a[1].isDirty ? -1 : 1;
      }
      // Then sort by distance to player
      const distA = Math.abs(a[1].position.x - playerChunkX) + Math.abs(a[1].position.z - playerChunkZ);
      const distB = Math.abs(b[1].position.x - playerChunkX) + Math.abs(b[1].position.z - playerChunkZ);
      return distA - distB;
    });
    
    // Limit chunks to save
    const chunksToSave = chunkEntries.slice(0, MAX_CHUNKS_TO_SAVE);
    
    for (const [key, chunk] of chunksToSave) {
      const compressed = compressRLE(chunk.data);
      savedChunks.push({
        key,
        position: chunk.position,
        data: compressed,
        compressed: true,
      });
    }
    
    const saveData: WorldSaveData = {
      version: 4, // Bump for CHUNK_HEIGHT 256 + new block types
      savedAt: Date.now(),
      playerPosition,
      playerRotation,
      inventory,
      hotbarSelection,
      chunks: savedChunks,
      zombies,
    };
    
    const saveJson = JSON.stringify(saveData);
    
    // Try to save, handle quota exceeded gracefully
    try {
      localStorage.setItem(`${WORLD_SAVE_KEY}_${worldId}`, saveJson);
    } catch (quotaError) {
      if (quotaError instanceof DOMException && quotaError.name === 'QuotaExceededError') {
        // Try to free up space by clearing old data
        console.warn('Storage quota exceeded, attempting to free space...');
        
        // Clear any other world saves
        const allKeys = Object.keys(localStorage);
        for (const key of allKeys) {
          if (key.startsWith(WORLD_SAVE_KEY) && key !== `${WORLD_SAVE_KEY}_${worldId}`) {
            localStorage.removeItem(key);
          }
        }
        
        // Try saving again with fewer chunks
        const reducedChunks = chunksToSave.slice(0, Math.floor(MAX_CHUNKS_TO_SAVE / 2));
        const reducedSavedChunks: SavedChunk[] = reducedChunks.map(([key, chunk]) => ({
          key,
          position: chunk.position,
          data: compressRLE(chunk.data),
          compressed: true,
        }));
        
        saveData.chunks = reducedSavedChunks;
        
        try {
          localStorage.setItem(`${WORLD_SAVE_KEY}_${worldId}`, JSON.stringify(saveData));
          console.log(`World saved with reduced chunks: ${reducedSavedChunks.length}`);
        } catch {
          console.error('Failed to save even with reduced data. Storage is full.');
          return false;
        }
      } else {
        throw quotaError;
      }
    }
    
    // Update world list
    const worldList = getSavedWorlds();
    const existingIndex = worldList.findIndex(w => w.id === worldId);
    
    if (existingIndex >= 0) {
      worldList[existingIndex].lastPlayed = Date.now();
    } else {
      worldList.push({
        id: worldId,
        name: worldId === 'default' ? 'My World' : worldId,
        createdAt: Date.now(),
        lastPlayed: Date.now(),
      });
    }
    
    localStorage.setItem(WORLD_LIST_KEY, JSON.stringify(worldList));
    
    console.log(`World saved: ${savedChunks.length} chunks (compressed)`);
    return true;
  } catch (error) {
    console.error('Failed to save world:', error);
    return false;
  }
}

/**
 * Load world state from localStorage
 */
export function loadWorld(worldId: string = 'default'): WorldSaveData | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const saveJson = localStorage.getItem(`${WORLD_SAVE_KEY}_${worldId}`);
    if (!saveJson) return null;
    
    const saveData: WorldSaveData = JSON.parse(saveJson);
    
    // Update last played time
    const worldList = getSavedWorlds();
    const existingIndex = worldList.findIndex(w => w.id === worldId);
    if (existingIndex >= 0) {
      worldList[existingIndex].lastPlayed = Date.now();
      localStorage.setItem(WORLD_LIST_KEY, JSON.stringify(worldList));
    }
    
    console.log(`World loaded: ${saveData.chunks.length} chunks`);
    return saveData;
  } catch (error) {
    console.error('Failed to load world:', error);
    return null;
  }
}

/**
 * Delete a saved world
 */
export function deleteWorld(worldId: string = 'default'): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    localStorage.removeItem(`${WORLD_SAVE_KEY}_${worldId}`);
    
    // Update world list
    const worldList = getSavedWorlds();
    const filteredList = worldList.filter(w => w.id !== worldId);
    localStorage.setItem(WORLD_LIST_KEY, JSON.stringify(filteredList));
    
    return true;
  } catch (error) {
    console.error('Failed to delete world:', error);
    return false;
  }
}

/**
 * Convert loaded chunk data back to the format used by the game
 * Handles both compressed (RLE) and uncompressed formats for backwards compatibility
 */
export function convertLoadedChunks(
  savedChunks: SavedChunk[],
  version: number = 1
): Map<string, { data: Uint8Array; position: { x: number; z: number }; isDirty: boolean }> {
  const chunks = new Map<string, { data: Uint8Array; position: { x: number; z: number }; isDirty: boolean }>();
  const CHUNK_DATA_LENGTH = 16 * 16 * 64; // CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT
  
  for (const saved of savedChunks) {
    let data: Uint8Array;
    
    // Check if data is compressed (version 2+ or has compressed flag)
    if (saved.compressed || version >= 2) {
      data = decompressRLE(saved.data, CHUNK_DATA_LENGTH);
    } else {
      // Legacy uncompressed format
      data = new Uint8Array(saved.data);
    }
    
    chunks.set(saved.key, {
      position: saved.position,
      data,
      isDirty: false,
    });
  }
  
  return chunks;
}
