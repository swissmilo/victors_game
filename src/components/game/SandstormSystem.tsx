'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, SANDSTORM_COUNTDOWN, EARTHQUAKE_COUNTDOWN } from '@/stores';
import { BlockType, CHUNK_SIZE, CHUNK_HEIGHT, setBlockInChunk, getBlockFromChunk, chunkPositionToKey } from '@/types';

// Sandstorm timing configuration
const FADE_IN_DURATION = 3;     // Seconds to fade in
const ACTIVE_DURATION = 15;     // Seconds of active sandstorm
const FADE_OUT_DURATION = 3;    // Seconds to fade out

// Dust particle configuration
const DUST_COUNT = 4000;
const DUST_AREA = 80;           // Area around player (XZ spread)
const DUST_HEIGHT = 30;         // Height spread
const DUST_SPEED = 15;          // Horizontal speed toward player

// Sand placement configuration
const SAND_PLACE_RADIUS = 40;   // Radius around player to place sand
const SAND_PLACE_RATE = 3;      // Sand blocks per second during active phase
const MAX_SAND_HEIGHT = 55;     // Don't place sand too high

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// Pre-generate random values outside component to avoid impure render
function generateDustData() {
  const pos = new Float32Array(DUST_COUNT * 3);
  const vel = new Float32Array(DUST_COUNT * 3);

  for (let i = 0; i < DUST_COUNT; i++) {
    // Start particles around the player, spread in a sphere
    const angle = Math.random() * Math.PI * 2;
    const radius = DUST_AREA * 0.5 + Math.random() * DUST_AREA * 0.5;
    pos[i * 3] = Math.cos(angle) * radius;
    pos[i * 3 + 1] = Math.random() * DUST_HEIGHT + 5;
    pos[i * 3 + 2] = Math.sin(angle) * radius;

    // Velocity toward center (player) with some randomness
    const speed = DUST_SPEED + Math.random() * 5;
    vel[i * 3] = -Math.cos(angle) * speed;
    vel[i * 3 + 1] = (Math.random() - 0.5) * 2; // Slight vertical drift
    vel[i * 3 + 2] = -Math.sin(angle) * speed;
  }

  return { positions: pos, velocities: vel };
}

// Generate once at module load
const dustData = generateDustData();

// Create material once at module level
const dustMaterial = new THREE.PointsMaterial({
  color: 0xd4a574,  // Sandy tan color
  size: 0.4,
  transparent: true,
  opacity: 0,
  sizeAttenuation: true,
});

export function SandstormSystem() {
  const sandstorm = useGameStore((state) => state.sandstorm);
  const updateSandstorm = useGameStore((state) => state.updateSandstorm);
  const playerPosition = useGameStore((state) => state.playerPosition);
  const chunks = useGameStore((state) => state.chunks);
  const setChunk = useGameStore((state) => state.setChunk);
  const isPlaying = useGameStore((state) => state.isPlaying);
  const currentCatastrophe = useGameStore((state) => state.currentCatastrophe);
  const switchToNextCatastrophe = useGameStore((state) => state.switchToNextCatastrophe);
  const updateEarthquake = useGameStore((state) => state.updateEarthquake);

  const { scene } = useThree();
  const phaseTimer = useRef(0);
  const sandPlaceTimer = useRef(0);
  const pointsRef = useRef<THREE.Points>(null);
  const originalFogColor = useRef<THREE.Color | null>(null);
  const originalFogNear = useRef<number>(100);
  const originalFogFar = useRef<number>(180);
  const placementSeed = useRef(0);

  // Reset opacity on mount
  useEffect(() => {
    dustMaterial.opacity = 0;
  }, []);

  // Find top-most non-air block at given XZ
  const findGroundLevel = (worldX: number, worldZ: number): number => {
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    const key = chunkPositionToKey({ x: chunkX, z: chunkZ });

    const chunk = chunks.get(key);
    if (!chunk) return -1;

    const localX = ((Math.floor(worldX) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((Math.floor(worldZ) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      const block = getBlockFromChunk(chunk.data, localX, y, localZ);
      if (block !== BlockType.AIR) {
        return y;
      }
    }
    return -1;
  };

  // Place a sand block at a random location around the player
  const placeSandBlock = () => {
    // Random position around player
    const angle = seededRandom(placementSeed.current++) * Math.PI * 2;
    const radius = seededRandom(placementSeed.current++) * SAND_PLACE_RADIUS;
    const worldX = Math.floor(playerPosition[0] + Math.cos(angle) * radius);
    const worldZ = Math.floor(playerPosition[2] + Math.sin(angle) * radius);

    // Find ground level
    const groundY = findGroundLevel(worldX, worldZ);
    if (groundY < 0 || groundY >= MAX_SAND_HEIGHT) return;

    // Place sand on top of the ground
    const placeY = groundY + 1;
    if (placeY >= CHUNK_HEIGHT) return;

    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    const key = chunkPositionToKey({ x: chunkX, z: chunkZ });

    const chunk = chunks.get(key);
    if (!chunk) return;

    const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    // Only place if the spot is empty (air)
    const existingBlock = getBlockFromChunk(chunk.data, localX, placeY, localZ);
    if (existingBlock !== BlockType.AIR) return;

    // Create a copy and modify
    const newData = new Uint8Array(chunk.data);
    setBlockInChunk(newData, localX, placeY, localZ, BlockType.SAND);

    setChunk(chunk.position, {
      ...chunk,
      data: newData,
      isDirty: true,
    });

    updateSandstorm({ sandPlaced: sandstorm.sandPlaced + 1 });
  };

  useFrame((_, delta) => {
    if (!isPlaying) return;

    // Only run when sandstorm is the current catastrophe
    if (currentCatastrophe !== 'sandstorm') {
      // Reset intensity when not active
      if (sandstorm.intensity > 0) {
        updateSandstorm({ intensity: 0 });
      }
      return;
    }

    const { phase, countdown } = sandstorm;

    switch (phase) {
      case 'countdown': {
        // Count down to sandstorm
        const newCountdown = countdown - delta;
        if (newCountdown <= 0) {
          updateSandstorm({ phase: 'starting', countdown: 0, sandPlaced: 0 });
          phaseTimer.current = 0;
          placementSeed.current = Date.now();
          // Store original fog color and distance
          if (scene.fog && scene.fog instanceof THREE.Fog) {
            originalFogColor.current = scene.fog.color.clone();
            originalFogNear.current = scene.fog.near;
            originalFogFar.current = scene.fog.far;
          }
        } else {
          updateSandstorm({ countdown: newCountdown });
        }
        break;
      }

      case 'starting': {
        // Fade in the sandstorm
        phaseTimer.current += delta;
        const progress = Math.min(phaseTimer.current / FADE_IN_DURATION, 1);
        updateSandstorm({ intensity: progress });

        // Reduce fog distance as sandstorm intensifies
        if (scene.fog instanceof THREE.Fog) {
          const targetNear = 20;  // Very close fog during sandstorm
          const targetFar = 60;   // Reduced visibility
          scene.fog.near = originalFogNear.current + (targetNear - originalFogNear.current) * progress;
          scene.fog.far = originalFogFar.current + (targetFar - originalFogFar.current) * progress;
        }

        if (progress >= 1) {
          updateSandstorm({ phase: 'active' });
          phaseTimer.current = 0;
          sandPlaceTimer.current = 0;
        }
        break;
      }

      case 'active': {
        // Active sandstorm – place sand blocks
        phaseTimer.current += delta;
        sandPlaceTimer.current += delta;

        // Place sand blocks at the configured rate
        const sandInterval = 1 / SAND_PLACE_RATE;
        while (sandPlaceTimer.current >= sandInterval) {
          placeSandBlock();
          sandPlaceTimer.current -= sandInterval;
        }

        if (phaseTimer.current >= ACTIVE_DURATION) {
          updateSandstorm({ phase: 'ending' });
          phaseTimer.current = 0;
        }
        break;
      }

      case 'ending': {
        // Fade out
        phaseTimer.current += delta;
        const progress = Math.min(phaseTimer.current / FADE_OUT_DURATION, 1);
        updateSandstorm({ intensity: 1 - progress });

        // Restore fog distance as sandstorm fades
        if (scene.fog instanceof THREE.Fog) {
          const targetNear = 20;
          const targetFar = 60;
          scene.fog.near = targetNear + (originalFogNear.current - targetNear) * progress;
          scene.fog.far = targetFar + (originalFogFar.current - targetFar) * progress;
        }

        if (progress >= 1) {
          updateSandstorm({
            phase: 'countdown',
            countdown: SANDSTORM_COUNTDOWN,
            intensity: 0,
          });
          phaseTimer.current = 0;

          // Restore fog color and distance
          if (scene.fog instanceof THREE.Fog) {
            if (originalFogColor.current) {
              scene.fog.color.copy(originalFogColor.current);
              originalFogColor.current = null;
            }
            scene.fog.near = originalFogNear.current;
            scene.fog.far = originalFogFar.current;
          }

          // Switch to earthquake (next in sequence) and start its countdown
          switchToNextCatastrophe();
          updateEarthquake({
            phase: 'countdown',
            countdown: EARTHQUAKE_COUNTDOWN,
          });
        }
        break;
      }
    }

    // Update fog color based on intensity - sandy yellow-brown
    if (scene.fog && scene.fog instanceof THREE.Fog && originalFogColor.current) {
      const sandColor = new THREE.Color(0xc4a35a);  // Sandy yellow
      scene.fog.color.copy(originalFogColor.current).lerp(sandColor, sandstorm.intensity * 0.6);
    }

    // Update dust particles
    if (pointsRef.current && sandstorm.intensity > 0) {
      const geometry = pointsRef.current.geometry;
      const posAttr = geometry.attributes.position as THREE.BufferAttribute;
      const posArray = posAttr.array as Float32Array;

      const px = playerPosition[0];
      const py = playerPosition[1];
      const pz = playerPosition[2];

      for (let i = 0; i < DUST_COUNT; i++) {
        // Get current position relative to world (particles are positioned relative to player)
        let x = posArray[i * 3];
        let y = posArray[i * 3 + 1];
        let z = posArray[i * 3 + 2];

        // Calculate direction toward player (center)
        const dx = -x;
        const dz = -z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 0.1) {
          // Move toward center
          const speed = DUST_SPEED * delta;
          x += (dx / dist) * speed;
          z += (dz / dist) * speed;
        }

        // Add some vertical drift
        y += dustData.velocities[i * 3 + 1] * delta;

        // Reset if too close to center or out of bounds
        const newDist = Math.sqrt(x * x + z * z);
        if (newDist < 3 || y < 0 || y > DUST_HEIGHT + 10) {
          // Respawn at edge
          const angle = seededRandom(i * 1234.5678 + phaseTimer.current) * Math.PI * 2;
          const radius = DUST_AREA * 0.5 + seededRandom(i * 9876.5432 + phaseTimer.current) * DUST_AREA * 0.5;
          x = Math.cos(angle) * radius;
          y = seededRandom(i * 5678.1234 + phaseTimer.current) * DUST_HEIGHT + 5;
          z = Math.sin(angle) * radius;
        }

        posArray[i * 3] = x;
        posArray[i * 3 + 1] = y;
        posArray[i * 3 + 2] = z;
      }

      posAttr.needsUpdate = true;

      // Update position to follow player
      pointsRef.current.position.set(px, py - 5, pz);
    }

    // Update dust opacity
    dustMaterial.opacity = sandstorm.intensity * 0.7;
  });

  // Only render when sandstorm is active
  const isActive = currentCatastrophe === 'sandstorm' && sandstorm.phase !== 'countdown';

  if (!isActive) return null;

  return (
    <>
      {/* Dust particles */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[dustData.positions, 3]}
          />
        </bufferGeometry>
        <primitive object={dustMaterial} attach="material" />
      </points>

      {/* Dark yellow sky overlay for sandstorm */}
      {sandstorm.intensity > 0 && (
        <mesh position={[playerPosition[0], playerPosition[1] + 50, playerPosition[2]]}>
          <sphereGeometry args={[200, 16, 16]} />
          <meshBasicMaterial
            color={0x7a6030}
            transparent
            opacity={sandstorm.intensity * 0.5}
            side={THREE.BackSide}
          />
        </mesh>
      )}
    </>
  );
}
