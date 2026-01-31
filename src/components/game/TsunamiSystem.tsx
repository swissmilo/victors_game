'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, TSUNAMI_COUNTDOWN, BASE_WATER_LEVEL, MAX_WATER_LEVEL, BLOOD_RAIN_COUNTDOWN } from '@/stores';
import { BlockType, CHUNK_SIZE, CHUNK_HEIGHT, setBlockInChunk, getBlockFromChunk } from '@/types';

// Tsunami timing configuration
const RISE_DURATION = 8;      // Seconds to rise to max
const PEAK_DURATION = 3;      // Seconds at peak
const FALL_DURATION = 5;      // Seconds to fall back down
const RISE_SPEED = (MAX_WATER_LEVEL - BASE_WATER_LEVEL) / RISE_DURATION;
const FALL_SPEED = (MAX_WATER_LEVEL - BASE_WATER_LEVEL) / FALL_DURATION;

// Blocks that get destroyed by water
const WATER_DESTROYABLE_BLOCKS = [BlockType.WOOD, BlockType.PLANKS];

export function TsunamiSystem() {
  const tsunami = useGameStore((state) => state.tsunami);
  const updateTsunami = useGameStore((state) => state.updateTsunami);
  const chunks = useGameStore((state) => state.chunks);
  const setChunk = useGameStore((state) => state.setChunk);
  const isPlaying = useGameStore((state) => state.isPlaying);
  const currentCatastrophe = useGameStore((state) => state.currentCatastrophe);
  const switchToNextCatastrophe = useGameStore((state) => state.switchToNextCatastrophe);
  const updateBloodRain = useGameStore((state) => state.updateBloodRain);
  
  const lastDestroyLevel = useRef(BASE_WATER_LEVEL);
  const phaseTimer = useRef(0);
  
  useFrame((_, delta) => {
    if (!isPlaying) return;
    
    // Only run when tsunami is the current catastrophe
    if (currentCatastrophe !== 'tsunami') return;
    
    const { phase, countdown, waterLevel } = tsunami;
    
    switch (phase) {
      case 'countdown': {
        // Count down to next tsunami
        const newCountdown = countdown - delta;
        if (newCountdown <= 0) {
          updateTsunami({ phase: 'rising', countdown: 0 });
          lastDestroyLevel.current = BASE_WATER_LEVEL;
          phaseTimer.current = 0;
        } else {
          updateTsunami({ countdown: newCountdown });
        }
        break;
      }
      
      case 'rising': {
        // Raise water level
        const newLevel = Math.min(waterLevel + RISE_SPEED * delta, MAX_WATER_LEVEL);
        updateTsunami({ waterLevel: newLevel });
        
        // Destroy wooden blocks at current water level
        destroyWoodenBlocksAtLevel(
          chunks,
          setChunk,
          Math.floor(lastDestroyLevel.current),
          Math.floor(newLevel)
        );
        lastDestroyLevel.current = newLevel;
        
        // Check if reached peak
        if (newLevel >= MAX_WATER_LEVEL) {
          updateTsunami({ phase: 'peak' });
          phaseTimer.current = 0;
        }
        break;
      }
      
      case 'peak': {
        // Stay at peak for a few seconds
        phaseTimer.current += delta;
        if (phaseTimer.current >= PEAK_DURATION) {
          updateTsunami({ phase: 'falling' });
          phaseTimer.current = 0;
        }
        break;
      }
      
      case 'falling': {
        // Lower water level
        const newLevel = Math.max(waterLevel - FALL_SPEED * delta, BASE_WATER_LEVEL);
        updateTsunami({ waterLevel: newLevel });
        
        // Check if back to base - switch to next catastrophe
        if (newLevel <= BASE_WATER_LEVEL) {
          updateTsunami({
            phase: 'countdown',
            countdown: TSUNAMI_COUNTDOWN,
            waterLevel: BASE_WATER_LEVEL,
          });
          phaseTimer.current = 0;
          
          // Switch to blood rain and start its countdown
          switchToNextCatastrophe();
          updateBloodRain({
            phase: 'countdown',
            countdown: BLOOD_RAIN_COUNTDOWN,
          });
        }
        break;
      }
    }
  });
  
  // Only render water plane during active tsunami phases
  const isActive = currentCatastrophe === 'tsunami' && tsunami.phase !== 'countdown';
  
  // Render the water plane - offset slightly above blocks to prevent z-fighting
  const waterY = tsunami.waterLevel + 0.1;
  
  if (!isActive) return null;
  
  return (
    <mesh position={[0, waterY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[500, 500]} />
      <meshStandardMaterial
        color="#1e90ff"
        transparent
        opacity={0.6}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * Destroy wooden blocks between two Y levels across all loaded chunks
 */
function destroyWoodenBlocksAtLevel(
  chunks: Map<string, { data: Uint8Array; position: { x: number; z: number }; isDirty: boolean }>,
  setChunk: (position: { x: number; z: number }, chunk: { data: Uint8Array; position: { x: number; z: number }; isDirty: boolean }) => void,
  fromY: number,
  toY: number
): void {
  if (fromY >= toY) return;
  
  const modifiedChunks = new Map<string, { data: Uint8Array; position: { x: number; z: number }; isDirty: boolean }>();
  
  chunks.forEach((chunk, key) => {
    let modified = false;
    
    for (let y = fromY; y <= toY && y < CHUNK_HEIGHT; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const block = getBlockFromChunk(chunk.data, x, y, z);
          
          if (WATER_DESTROYABLE_BLOCKS.includes(block)) {
            setBlockInChunk(chunk.data, x, y, z, BlockType.AIR);
            modified = true;
          }
        }
      }
    }
    
    if (modified) {
      modifiedChunks.set(key, {
        ...chunk,
        data: new Uint8Array(chunk.data), // Create new reference to trigger re-render
        isDirty: true,
      });
    }
  });
  
  // Update all modified chunks
  modifiedChunks.forEach((chunk) => {
    setChunk(chunk.position, chunk);
  });
}
