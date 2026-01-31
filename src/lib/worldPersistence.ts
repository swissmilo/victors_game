/**
 * World persistence - save and load world state to/from localStorage
 */

import { BlockType } from '@/types';

const WORLD_SAVE_KEY = 'victors_world_save';
const WORLD_LIST_KEY = 'victors_world_list';

interface InventorySlot {
  blockType: BlockType;
  count: number;
}

interface SavedChunk {
  key: string;
  position: { x: number; z: number };
  data: number[]; // Uint8Array converted to regular array for JSON
}

interface WorldSaveData {
  version: number;
  savedAt: number;
  playerPosition: [number, number, number];
  playerRotation: [number, number];
  inventory: InventorySlot[];
  hotbarSelection: number;
  chunks: SavedChunk[];
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
 * Save world state to localStorage
 */
export function saveWorld(
  worldId: string = 'default',
  playerPosition: [number, number, number],
  playerRotation: [number, number],
  inventory: InventorySlot[],
  hotbarSelection: number,
  chunks: Map<string, { data: Uint8Array; position: { x: number; z: number }; isDirty: boolean }>
): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    // Convert chunks Map to array for JSON serialization
    const savedChunks: SavedChunk[] = [];
    chunks.forEach((chunk, key) => {
      savedChunks.push({
        key,
        position: chunk.position,
        data: Array.from(chunk.data), // Convert Uint8Array to regular array
      });
    });
    
    const saveData: WorldSaveData = {
      version: 1,
      savedAt: Date.now(),
      playerPosition,
      playerRotation,
      inventory,
      hotbarSelection,
      chunks: savedChunks,
    };
    
    localStorage.setItem(`${WORLD_SAVE_KEY}_${worldId}`, JSON.stringify(saveData));
    
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
    
    console.log(`World saved: ${savedChunks.length} chunks`);
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
 */
export function convertLoadedChunks(
  savedChunks: SavedChunk[]
): Map<string, { data: Uint8Array; position: { x: number; z: number }; isDirty: boolean }> {
  const chunks = new Map<string, { data: Uint8Array; position: { x: number; z: number }; isDirty: boolean }>();
  
  for (const saved of savedChunks) {
    chunks.set(saved.key, {
      position: saved.position,
      data: new Uint8Array(saved.data),
      isDirty: false,
    });
  }
  
  return chunks;
}
