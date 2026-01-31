'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, BLOOD_RAIN_COUNTDOWN, EARTHQUAKE_COUNTDOWN } from '@/stores';
import { BlockType, CHUNK_SIZE, CHUNK_HEIGHT, setBlockInChunk, getBlockFromChunk } from '@/types';

// Blood rain timing configuration
const FADE_IN_DURATION = 3;     // Seconds to fade in
const ACTIVE_DURATION = 15;     // Seconds of active rain
const FADE_OUT_DURATION = 3;    // Seconds to fade out

// Rain particle configuration
const RAIN_COUNT = 5000;
const RAIN_AREA = 100;          // Area around player
const RAIN_HEIGHT = 50;         // Height of rain column
const RAIN_SPEED = 30;          // Fall speed

// Grass → dirt conversion during blood rain
const GRASS_TO_DIRT_CHANCE = 0.1;  // 10% per grass block (same as hotkey 1 → hotkey 2)
const CHUNKS_PER_FRAME = 2;

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// Pre-generate random values outside component to avoid impure render
function generateRainData() {
  const pos = new Float32Array(RAIN_COUNT * 3);
  const vel = new Float32Array(RAIN_COUNT);
  
  for (let i = 0; i < RAIN_COUNT; i++) {
    pos[i * 3] = (Math.random() - 0.5) * RAIN_AREA;
    pos[i * 3 + 1] = Math.random() * RAIN_HEIGHT;
    pos[i * 3 + 2] = (Math.random() - 0.5) * RAIN_AREA;
    vel[i] = RAIN_SPEED + Math.random() * 10;
  }
  
  return { positions: pos, velocities: vel };
}

// Generate once at module load
const rainData = generateRainData();

// Create material once at module level
const rainMaterial = new THREE.PointsMaterial({
  color: 0x8b0000,  // Dark red
  size: 0.3,
  transparent: true,
  opacity: 0,
  sizeAttenuation: true,
});

export function BloodRainSystem() {
  const bloodRain = useGameStore((state) => state.bloodRain);
  const updateBloodRain = useGameStore((state) => state.updateBloodRain);
  const chunks = useGameStore((state) => state.chunks);
  const setChunk = useGameStore((state) => state.setChunk);
  const isPlaying = useGameStore((state) => state.isPlaying);
  const currentCatastrophe = useGameStore((state) => state.currentCatastrophe);
  const switchToNextCatastrophe = useGameStore((state) => state.switchToNextCatastrophe);
  const updateEarthquake = useGameStore((state) => state.updateEarthquake);
  const playerPosition = useGameStore((state) => state.playerPosition);
  
  const { scene } = useThree();
  const phaseTimer = useRef(0);
  const pointsRef = useRef<THREE.Points>(null);
  const originalFogColor = useRef<THREE.Color | null>(null);
  const chunksToProcess = useRef<string[]>([]);
  const conversionSeed = useRef(0);
  
  // Reset opacity on mount
  useEffect(() => {
    rainMaterial.opacity = 0;
  }, []);
  
  useFrame((_, delta) => {
    if (!isPlaying) return;
    
    // Only run when blood rain is the current catastrophe
    if (currentCatastrophe !== 'blood_rain') {
      // Reset intensity when not active
      if (bloodRain.intensity > 0) {
        updateBloodRain({ intensity: 0 });
      }
      return;
    }
    
    const { phase, countdown } = bloodRain;
    
    switch (phase) {
      case 'countdown': {
        // Count down to blood rain
        const newCountdown = countdown - delta;
        if (newCountdown <= 0) {
          updateBloodRain({ phase: 'starting', countdown: 0 });
          phaseTimer.current = 0;
          // Store original fog color
          if (scene.fog && scene.fog instanceof THREE.Fog) {
            originalFogColor.current = scene.fog.color.clone();
          }
        } else {
          updateBloodRain({ countdown: newCountdown });
        }
        break;
      }
      
      case 'starting': {
        // Fade in the blood rain
        phaseTimer.current += delta;
        const progress = Math.min(phaseTimer.current / FADE_IN_DURATION, 1);
        updateBloodRain({ intensity: progress });
        
        if (progress >= 1) {
          updateBloodRain({ phase: 'active' });
          phaseTimer.current = 0;
        }
        break;
      }
      
      case 'active': {
        // Active blood rain – convert grass to dirt (10% per block), incremental
        phaseTimer.current += delta;
        
        // Start chunk processing on first frame of active
        if (chunksToProcess.current.length === 0) {
          chunksToProcess.current = Array.from(chunks.keys());
          conversionSeed.current = Date.now();
        }
        if (chunksToProcess.current.length > 0) {
          const keysThisFrame = chunksToProcess.current.splice(0, CHUNKS_PER_FRAME);
          for (const key of keysThisFrame) {
            const chunk = chunks.get(key);
            if (chunk) {
              processChunkGrassToDirt(chunk, setChunk, conversionSeed.current);
            }
          }
        }
        
        if (phaseTimer.current >= ACTIVE_DURATION) {
          updateBloodRain({ phase: 'ending' });
          phaseTimer.current = 0;
        }
        break;
      }
      
      case 'ending': {
        // Fade out
        phaseTimer.current += delta;
        const progress = Math.min(phaseTimer.current / FADE_OUT_DURATION, 1);
        updateBloodRain({ intensity: 1 - progress });
        
        if (progress >= 1) {
          updateBloodRain({
            phase: 'countdown',
            countdown: BLOOD_RAIN_COUNTDOWN,
            intensity: 0,
          });
          phaseTimer.current = 0;
          
          // Switch to earthquake and start its countdown
          switchToNextCatastrophe();
          updateEarthquake({
            phase: 'countdown',
            countdown: EARTHQUAKE_COUNTDOWN,
          });
        }
        break;
      }
    }
    
    // Update fog color based on intensity
    if (scene.fog && scene.fog instanceof THREE.Fog && originalFogColor.current) {
      const bloodColor = new THREE.Color(0x4a0000);  // Dark blood red
      scene.fog.color.copy(originalFogColor.current).lerp(bloodColor, bloodRain.intensity * 0.5);
    }
    
    // Update rain particles
    if (pointsRef.current && bloodRain.intensity > 0) {
      const geometry = pointsRef.current.geometry;
      const posAttr = geometry.attributes.position as THREE.BufferAttribute;
      const posArray = posAttr.array as Float32Array;
      
      // Move rain particles relative to player
      const px = playerPosition[0];
      const pz = playerPosition[2];
      
      for (let i = 0; i < RAIN_COUNT; i++) {
        // Move particle down
        posArray[i * 3 + 1] -= rainData.velocities[i] * delta;
        
        // Reset if below ground - use seeded pseudo-random based on index
        if (posArray[i * 3 + 1] < 0) {
          const seed = (i * 1234.5678) % 1;
          posArray[i * 3] = px + (seed - 0.5) * RAIN_AREA;
          posArray[i * 3 + 1] = RAIN_HEIGHT + seed * 10;
          posArray[i * 3 + 2] = pz + ((i * 9876.5432) % 1 - 0.5) * RAIN_AREA;
        }
      }
      
      posAttr.needsUpdate = true;
      
      // Update position to follow player
      pointsRef.current.position.set(px, 0, pz);
    }
    
    // Update rain opacity
    rainMaterial.opacity = bloodRain.intensity * 0.8;
  });
  
  // Only render when blood rain is active
  const isActive = currentCatastrophe === 'blood_rain' && bloodRain.phase !== 'countdown';
  
  if (!isActive) return null;
  
  return (
    <>
      {/* Rain particles */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[rainData.positions, 3]}
          />
        </bufferGeometry>
        <primitive object={rainMaterial} attach="material" />
      </points>
      
      {/* Red tinted water/blood puddles at ground level */}
      {bloodRain.intensity > 0.3 && (
        <mesh 
          position={[playerPosition[0], 32.1, playerPosition[2]]} 
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[300, 300]} />
          <meshStandardMaterial
            color="#8b0000"
            transparent
            opacity={bloodRain.intensity * 0.4}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
    </>
  );
}

/**
 * During blood rain: 10% chance per grass block to turn into dirt (hotkey 1 → hotkey 2).
 * Returns number of blocks converted.
 */
function processChunkGrassToDirt(
  chunk: { data: Uint8Array; position: { x: number; z: number }; isDirty: boolean },
  setChunk: (position: { x: number; z: number }, chunk: { data: Uint8Array; position: { x: number; z: number }; isDirty: boolean }) => void,
  seed: number
): number {
  let converted = 0;
  let modified = false;
  const chunkSeed = chunk.position.x * 1000 + chunk.position.z + seed * 0.001;

  for (let y = 1; y < CHUNK_HEIGHT; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const block = getBlockFromChunk(chunk.data, x, y, z);
        if (block === BlockType.GRASS) {
          const blockSeed = chunkSeed + x * 100 + y * 10000 + z;
          if (seededRandom(blockSeed) < GRASS_TO_DIRT_CHANCE) {
            setBlockInChunk(chunk.data, x, y, z, BlockType.DIRT);
            modified = true;
            converted++;
          }
        }
      }
    }
  }

  if (modified) {
    setChunk(chunk.position, {
      ...chunk,
      data: new Uint8Array(chunk.data),
      isDirty: true,
    });
  }
  return converted;
}
