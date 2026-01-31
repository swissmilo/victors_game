'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore, EARTHQUAKE_COUNTDOWN, BLACK_HOLE_COUNTDOWN } from '@/stores';
import { BlockType, CHUNK_SIZE, CHUNK_HEIGHT, setBlockInChunk, getBlockFromChunk } from '@/types';

// Earthquake timing configuration
const RUMBLE_DURATION = 2;      // Seconds of initial rumbling
const QUAKE_DURATION = 4;       // Seconds of main quake
const SETTLING_DURATION = 2;    // Seconds of settling

// How many chunks to process per frame during destruction
const CHUNKS_PER_FRAME = 2;

// Blocks that can be destroyed by earthquake (stone-type blocks)
const EARTHQUAKE_DESTROYABLE_BLOCKS = [
  BlockType.STONE,
  BlockType.COBBLESTONE,
];

// Seeded random for consistent destruction pattern
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function EarthquakeSystem() {
  const earthquake = useGameStore((state) => state.earthquake);
  const updateEarthquake = useGameStore((state) => state.updateEarthquake);
  const chunks = useGameStore((state) => state.chunks);
  const setChunk = useGameStore((state) => state.setChunk);
  const isPlaying = useGameStore((state) => state.isPlaying);
  const currentCatastrophe = useGameStore((state) => state.currentCatastrophe);
  const switchToNextCatastrophe = useGameStore((state) => state.switchToNextCatastrophe);
  const updateBlackHole = useGameStore((state) => state.updateBlackHole);
  
  const phaseTimer = useRef(0);
  const destructionSeed = useRef(0);
  const chunksToProcess = useRef<string[]>([]);
  const totalDestroyed = useRef(0);
  
  useFrame((_, delta) => {
    if (!isPlaying) return;
    
    // Only run when earthquake is the current catastrophe
    if (currentCatastrophe !== 'earthquake') {
      return;
    }
    
    const { phase, countdown } = earthquake;
    
    switch (phase) {
      case 'countdown': {
        // Count down to earthquake
        const newCountdown = countdown - delta;
        if (newCountdown <= 0) {
          updateEarthquake({ 
            phase: 'rumbling', 
            countdown: 0,
            hasDestroyedBlocks: false,
          });
          phaseTimer.current = 0;
        } else {
          updateEarthquake({ countdown: newCountdown });
        }
        break;
      }
      
      case 'rumbling': {
        // Build up intensity
        phaseTimer.current += delta;
        const progress = Math.min(phaseTimer.current / RUMBLE_DURATION, 1);
        updateEarthquake({ intensity: progress * 0.5 });
        
        if (progress >= 1) {
          // Prepare chunk list for incremental destruction
          chunksToProcess.current = Array.from(chunks.keys());
          destructionSeed.current = Date.now();
          totalDestroyed.current = 0;
          
          updateEarthquake({ phase: 'quake', intensity: 1 });
          phaseTimer.current = 0;
        }
        break;
      }
      
      case 'quake': {
        // Main earthquake - destroy blocks incrementally
        phaseTimer.current += delta;
        
        // Process a few chunks per frame to avoid freezing
        if (chunksToProcess.current.length > 0) {
          const chunksThisFrame = chunksToProcess.current.splice(0, CHUNKS_PER_FRAME);
          
          for (const key of chunksThisFrame) {
            const chunk = chunks.get(key);
            if (chunk) {
              const destroyed = processChunkDestruction(chunk, setChunk, destructionSeed.current);
              totalDestroyed.current += destroyed;
            }
          }
          
          // Log when all chunks processed
          if (chunksToProcess.current.length === 0) {
            console.log(`Earthquake destroyed ${totalDestroyed.current} blocks`);
            updateEarthquake({ hasDestroyedBlocks: true });
          }
        }
        
        // Check if quake is over
        if (phaseTimer.current >= QUAKE_DURATION) {
          updateEarthquake({ phase: 'settling' });
          phaseTimer.current = 0;
        }
        break;
      }
      
      case 'settling': {
        // Fade out
        phaseTimer.current += delta;
        const progress = Math.min(phaseTimer.current / SETTLING_DURATION, 1);
        updateEarthquake({ intensity: 1 - progress });
        
        // Check if settled
        if (progress >= 1) {
          updateEarthquake({
            phase: 'countdown',
            countdown: EARTHQUAKE_COUNTDOWN,
            intensity: 0,
            hasDestroyedBlocks: false,
          });
          phaseTimer.current = 0;
          
          // Switch to black hole
          switchToNextCatastrophe();
          updateBlackHole({
            phase: 'countdown',
            countdown: BLACK_HOLE_COUNTDOWN,
          });
        }
        break;
      }
    }
  });
  
  // No visual rendering - earthquake only affects blocks
  return null;
}

/**
 * Process destruction for a single chunk, returns number of blocks destroyed
 */
function processChunkDestruction(
  chunk: { data: Uint8Array; position: { x: number; z: number }; isDirty: boolean },
  setChunk: (position: { x: number; z: number }, chunk: { data: Uint8Array; position: { x: number; z: number }; isDirty: boolean }) => void,
  seed: number
): number {
  let destroyed = 0;
  let modified = false;
  const chunkSeed = chunk.position.x * 1000 + chunk.position.z + seed * 0.001;
  
  for (let y = 1; y < CHUNK_HEIGHT; y++) {  // Skip bedrock at y=0
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const block = getBlockFromChunk(chunk.data, x, y, z);
        
        if (EARTHQUAKE_DESTROYABLE_BLOCKS.includes(block)) {
          // Use position-based seed for consistent randomness
          const blockSeed = chunkSeed + x * 100 + y * 10000 + z;
          const random = seededRandom(blockSeed);
          
          // 25% chance to destroy
          if (random < 0.25) {
            setBlockInChunk(chunk.data, x, y, z, BlockType.AIR);
            modified = true;
            destroyed++;
          }
        }
      }
    }
  }
  
  if (modified) {
    setChunk(chunk.position, {
      ...chunk,
      data: new Uint8Array(chunk.data), // Create new reference to trigger re-render
      isDirty: true,
    });
  }
  
  return destroyed;
}
