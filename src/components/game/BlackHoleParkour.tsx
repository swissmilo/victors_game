'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '@/stores';
import { BlockType, CHUNK_SIZE, CHUNK_HEIGHT, setBlockInChunk } from '@/types';

// Parkour configuration
const FALL_Y_THRESHOLD = 20; // If player falls below this, respawn
const LEVEL_1_END_Z = 30; // Z position of level 1 end platform
const LEVEL_2_END_Y = 62; // Y position of level 2 summit (within chunk height)

// Helper to create voxel blocks for platforms
function createPlatformBlocks(platforms: typeof LEVEL_1_PLATFORMS) {
  const chunks = new Map<string, { data: Uint8Array; position: { x: number; z: number }; isDirty: boolean }>();

  for (const platform of platforms) {
    const [px, py, pz] = platform.position;
    const [sx, sy, sz] = platform.size;

    // Create blocks for the entire platform - ensure we create exactly sx * sy * sz blocks
    const startX = Math.floor(px - sx / 2);
    const startY = Math.floor(py - sy / 2);
    const startZ = Math.floor(pz - sz / 2);

    for (let i = 0; i < sx; i++) {
      for (let j = 0; j < sz; j++) {
        for (let k = 0; k < sy; k++) {
          const x = startX + i;
          const z = startZ + j;
          const y = startY + k;
          if (y < 0 || y >= CHUNK_HEIGHT) continue;

          const chunkX = Math.floor(x / CHUNK_SIZE);
          const chunkZ = Math.floor(z / CHUNK_SIZE);
          const key = `${chunkX},${chunkZ}`;

          // Create chunk if it doesn't exist
          if (!chunks.has(key)) {
            chunks.set(key, {
              data: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT),
              position: { x: chunkX, z: chunkZ },
              isDirty: true,
            });
          }

          const chunk = chunks.get(key)!;
          const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          setBlockInChunk(chunk.data, localX, y, localZ, BlockType.STONE);
        }
      }
    }
  }

  return chunks;
}

// Level 1: Horizontal parkour - jump across floating blocks
const LEVEL_1_PLATFORMS = [
  // Start platform (5x5)
  { position: [0, 40, 0], size: [5, 1, 5], color: '#00ff00' }, // Green start

  // 10 jumping blocks (2x2 each)
  { position: [0, 40, 4], size: [2, 1, 2], color: '#888888' },
  { position: [2, 40, 7], size: [2, 1, 2], color: '#888888' },
  { position: [-2, 40, 10], size: [2, 1, 2], color: '#888888' },
  { position: [0, 41, 13], size: [2, 1, 2], color: '#888888' }, // Higher
  { position: [3, 40, 16], size: [2, 1, 2], color: '#888888' },
  { position: [-1, 39, 19], size: [2, 1, 2], color: '#888888' }, // Lower
  { position: [2, 40, 22], size: [2, 1, 2], color: '#888888' },
  { position: [-2, 41, 25], size: [2, 1, 2], color: '#888888' }, // Higher
  { position: [1, 40, 28], size: [2, 1, 2], color: '#888888' },
  { position: [0, 40, 31], size: [2, 1, 2], color: '#888888' },

  // End platform (5x5) - pushed back to avoid overlap
  { position: [0, 40, 36], size: [5, 1, 5], color: '#ff0000' }, // Red end
];

// Level 2: Vertical parkour - climb the mountain
const LEVEL_2_PLATFORMS = [
  // Start platform at base
  { position: [0, 40, 50], size: [5, 1, 5], color: '#00ff00' }, // Green start

  // Mountain climb (staircase pattern) - climb to Y=62 (2x2 blocks)
  { position: [0, 42, 52], size: [2, 1, 2], color: '#888888' },
  { position: [2, 44, 54], size: [2, 1, 2], color: '#888888' },
  { position: [-2, 46, 56], size: [2, 1, 2], color: '#888888' },
  { position: [0, 48, 58], size: [2, 1, 2], color: '#888888' },
  { position: [3, 50, 60], size: [2, 1, 2], color: '#888888' },
  { position: [-1, 52, 62], size: [2, 1, 2], color: '#888888' },
  { position: [1, 54, 64], size: [2, 1, 2], color: '#888888' },
  { position: [-2, 56, 66], size: [2, 1, 2], color: '#888888' },
  { position: [0, 58, 68], size: [2, 1, 2], color: '#888888' },
  { position: [2, 60, 70], size: [2, 1, 2], color: '#888888' },

  // Summit platform at Y=62 - pushed back to avoid overlap
  { position: [0, 62, 74], size: [6, 1, 6], color: '#ffff00' }, // Yellow summit
];

function Platform({ position, size, color }: { position: number[]; size: number[]; color: string }) {
  return (
    <mesh position={position as [number, number, number]}>
      <boxGeometry args={size as [number, number, number]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

export function BlackHoleParkour() {
  const isInParkour = useGameStore((state) => state.isInBlackHoleParkour);
  const parkourLevel = useGameStore((state) => state.parkourLevel);
  const playerPosition = useGameStore((state) => state.playerPosition);
  const respawnAtCheckpoint = useGameStore((state) => state.respawnAtParkourCheckpoint);
  const setParkourLevel = useGameStore((state) => state.setParkourLevel);
  const exitParkour = useGameStore((state) => state.exitBlackHoleParkour);
  const setParkourChunk = useGameStore((state) => state.setParkourChunk);
  const clearParkourChunks = useGameStore((state) => state.clearParkourChunks);

  // Check for falls and level completion
  useFrame(() => {
    if (!isInParkour) return;

    const [px, py, pz] = playerPosition;

    // Fall detection - respawn at checkpoint
    if (py < FALL_Y_THRESHOLD) {
      respawnAtCheckpoint();
      return;
    }

    // Level 1: Check if reached end platform (red platform at Y=40, Z=36)
    if (parkourLevel === 1 && pz > 33 && pz < 39 && py > 39 && py < 43) {
      // Close to end platform, check X position
      if (Math.abs(px) < 3) {
        // Reached end of level 1, go to level 2
        setParkourLevel(2);
      }
    }

    // Level 2: Check if reached summit (yellow platform at Y=62, Z=74)
    if (parkourLevel === 2 && py > 61 && py < 66 && pz > 71 && pz < 77) {
      // Close to summit, check X position
      if (Math.abs(px) < 4) {
        // Reached summit, exit parkour
        exitParkour();
      }
    }
  });

  // Generate parkour chunks when entering parkour or changing levels
  useEffect(() => {
    if (!isInParkour) {
      // Exiting parkour - simply clear all parkour chunks
      clearParkourChunks();
      return;
    }

    // Create platform chunks for current level
    const platforms = parkourLevel === 1 ? LEVEL_1_PLATFORMS : LEVEL_2_PLATFORMS;
    const platformChunks = createPlatformBlocks(platforms);

    // Clear and set parkour chunks (completely separate from main world)
    clearParkourChunks();
    platformChunks.forEach((chunk) => {
      setParkourChunk(chunk.position, chunk);
    });
  }, [isInParkour, parkourLevel, setParkourChunk, clearParkourChunks]);

  if (!isInParkour) return null;

  const platforms = parkourLevel === 1 ? LEVEL_1_PLATFORMS : LEVEL_2_PLATFORMS;

  return (
    <group name="black-hole-parkour">
      {/* Render platforms */}
      {platforms.map((platform, i) => (
        <Platform key={i} position={platform.position} size={platform.size} color={platform.color} />
      ))}

      {/* Ambient light for parkour */}
      <ambientLight intensity={0.8} />
      <pointLight position={[0, 120, 40]} intensity={100} distance={100} />
    </group>
  );
}
