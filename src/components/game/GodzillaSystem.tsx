'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, GODZILLA_COUNTDOWN, GODZILLA_HEIGHT } from '@/stores';
import { BlockType, CHUNK_SIZE, CHUNK_HEIGHT, getBlockFromChunk, setBlockInChunk } from '@/types';

// Phase timing constants
const EMERGE_DURATION = 5;      // Seconds to rise from ground
const ROAMING_DURATION = 30;    // Seconds of active wandering
const DEPART_DURATION = 5;      // Seconds to sink into ground

// Movement constants
const WALK_SPEED = 3;           // Blocks per second
const MIN_WALK_TIME = 5;        // Min seconds before changing direction
const MAX_WALK_TIME = 8;        // Max seconds before changing direction
const MIN_ROAM_DISTANCE = 20;   // Min blocks for new target
const MAX_ROAM_DISTANCE = 60;   // Max blocks for new target

// Ray blast constants
const RAY_COOLDOWN_MIN = 4;     // Min seconds between blasts
const RAY_COOLDOWN_MAX = 6;     // Max seconds between blasts
const RAY_DURATION = 2;         // Seconds ray is active
const RAY_DISTANCE_MIN = 30;    // Min distance in front of Godzilla
const RAY_DISTANCE_MAX = 50;    // Max distance in front of Godzilla
const CONE_ANGLE = Math.PI / 6; // 30 degrees
const CONE_DEPTH = 12;          // Blocks deep
const CONE_RADIUS = 6;          // Blocks radius at impact
const CHUNKS_PER_FRAME = 2;     // Incremental destruction rate

// Godzilla proportions
const BODY_SCALE = 1;           // Scale factor for whole model

// Helper functions
function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return len > 0 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 0];
}

function length(v: [number, number, number]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function angleBetween(a: [number, number, number], b: [number, number, number]): number {
  const normA = normalize(a);
  const normB = normalize(b);
  return Math.acos(Math.max(-1, Math.min(1, dot(normA, normB))));
}

// Build Godzilla voxel model
function buildGodzillaModel() {
  const group = new THREE.Group();

  // Colors
  const bodyColor = new THREE.Color(0x3a4a3a);      // Dark green-gray
  const bellyColor = new THREE.Color(0x8b8878);     // Light gray-tan
  const eyeColor = new THREE.Color(0xffff00);       // Yellow
  const plateColor = new THREE.Color(0x00ffff);     // Cyan
  const teethColor = new THREE.Color(0xe0e0e0);     // White-gray

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: bodyColor });
  const bellyMaterial = new THREE.MeshStandardMaterial({ color: bellyColor });
  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: eyeColor,
    emissive: eyeColor,
    emissiveIntensity: 0.5
  });
  const plateMaterial = new THREE.MeshStandardMaterial({
    color: plateColor,
    emissive: plateColor,
    emissiveIntensity: 0.7
  });
  const teethMaterial = new THREE.MeshStandardMaterial({ color: teethColor });

  // Helper to create a box at position
  const addBox = (
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    material: THREE.Material
  ) => {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  // Legs (2) - positioned at bottom, slightly apart
  addBox(-6, 10, 0, 8, 20, 8, bodyMaterial);   // Left leg
  addBox(6, 10, 0, 8, 20, 8, bodyMaterial);    // Right leg

  // Torso - main body mass
  addBox(0, 35, 0, 18, 30, 12, bodyMaterial);

  // Belly - lighter color on front
  addBox(0, 30, 6, 14, 20, 1, bellyMaterial);

  // Neck - connecting torso to head
  addBox(0, 54, 2, 10, 12, 8, bodyMaterial);

  // Head - large and imposing
  addBox(0, 66, 4, 12, 16, 10, bodyMaterial);

  // Eyes - glowing yellow
  addBox(-3, 70, 9, 2, 2, 1, eyeMaterial);    // Left eye
  addBox(3, 70, 9, 2, 2, 1, eyeMaterial);     // Right eye

  // Teeth - white points on jaw
  for (let i = -4; i <= 4; i += 2) {
    addBox(i, 62, 8, 1, 2, 1, teethMaterial);
  }

  // Arms (2) - smaller than legs, T-rex style
  addBox(-12, 42, 0, 6, 15, 6, bodyMaterial);  // Left arm
  addBox(12, 42, 0, 6, 15, 6, bodyMaterial);   // Right arm

  // Tail - segmented, tapering from thick to thin
  const tailX = 0;
  const tailY = 25;
  const tailZ = -8;
  const tailWidth = 8;

  for (let i = 0; i < 10; i++) {
    const segmentWidth = Math.max(2, tailWidth - i * 0.6);
    addBox(tailX, tailY, tailZ - i * 4, segmentWidth, segmentWidth, 4, bodyMaterial);

    // Tail spikes on top
    if (i < 6) {
      const spikeHeight = Math.max(2, 4 - i * 0.5);
      addBox(tailX, tailY + segmentWidth / 2 + spikeHeight / 2, tailZ - i * 4, 2, spikeHeight, 2, bodyMaterial);
    }
  }

  // Dorsal plates - blue glowing fins along spine
  const platePositions = [
    { y: 48, height: 12 },
    { y: 44, height: 14 },
    { y: 40, height: 15 },
    { y: 36, height: 14 },
    { y: 32, height: 12 },
    { y: 28, height: 10 },
    { y: 24, height: 8 },
  ];

  platePositions.forEach(({ y, height }) => {
    // Create triangular plate shape
    const plateGeometry = new THREE.ConeGeometry(3, height, 4);
    plateGeometry.rotateX(Math.PI / 2);
    const plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.position.set(0, y, -2);
    group.add(plate);
  });

  // Center the model (offset so feet are at y=0)
  group.position.y = 0;

  return group;
}

// Find ground level at position
function findGroundLevel(
  chunks: Map<string, { data: Uint8Array; position: { x: number; z: number } }>,
  worldX: number,
  worldZ: number
): number {
  const chunkX = Math.floor(worldX / CHUNK_SIZE);
  const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
  const chunkKey = `${chunkX},${chunkZ}`;
  const chunk = chunks.get(chunkKey);

  if (!chunk) return 35; // Default ground level if chunk not loaded

  const localX = Math.floor(worldX) - chunkX * CHUNK_SIZE;
  const localZ = Math.floor(worldZ) - chunkZ * CHUNK_SIZE;

  // Raycast downward from high up to find first solid block
  for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
    const block = getBlockFromChunk(chunk.data, localX, y, localZ);
    if (block !== BlockType.AIR && block !== BlockType.WATER) {
      return y + 1; // Stand on top of block
    }
  }

  return 35; // Default if no ground found
}

export function GodzillaSystem() {
  // State selectors
  const godzilla = useGameStore((state) => state.godzilla);
  const updateGodzilla = useGameStore((state) => state.updateGodzilla);
  const playerPosition = useGameStore((state) => state.playerPosition);
  const chunks = useGameStore((state) => state.chunks);
  const setChunk = useGameStore((state) => state.setChunk);
  const currentCatastrophe = useGameStore((state) => state.currentCatastrophe);
  const switchToNextCatastrophe = useGameStore((state) => state.switchToNextCatastrophe);
  const isPlaying = useGameStore((state) => state.isPlaying);
  const updateEarthquake = useGameStore((state) => state.updateEarthquake);

  // Refs for timing and processing
  const phaseTimer = useRef(0);
  const chunksToProcess = useRef<string[]>([]);
  const bodyRef = useRef<THREE.Group>(null);

  // Pre-built Godzilla model
  const godzillaModel = useMemo(() => buildGodzillaModel(), []);

  useFrame((_, delta) => {
    if (!isPlaying || currentCatastrophe !== 'godzilla') return;

    const { phase, countdown, position, rotation, targetPosition, walkTimer, mouthRayActive, mouthRayTimer, hasDestroyedBlocks } = godzilla;

    switch (phase) {
      case 'countdown': {
        // Countdown phase - waiting for Godzilla to arrive
        const newCountdown = countdown - delta;

        if (newCountdown <= 0) {
          // Spawn Godzilla 60 blocks from player in random direction
          const angle = Math.random() * Math.PI * 2;
          const spawnDistance = 60;
          const spawnX = playerPosition[0] + Math.cos(angle) * spawnDistance;
          const spawnZ = playerPosition[2] + Math.sin(angle) * spawnDistance;
          const spawnY = findGroundLevel(chunks, spawnX, spawnZ);

          updateGodzilla({
            phase: 'emerging',
            countdown: 0,
            position: [spawnX, spawnY, spawnZ],
            rotation: angle + Math.PI, // Face toward player
            intensity: 0,
            walkTimer: MIN_WALK_TIME + Math.random() * (MAX_WALK_TIME - MIN_WALK_TIME),
            mouthRayTimer: RAY_COOLDOWN_MIN + Math.random() * (RAY_COOLDOWN_MAX - RAY_COOLDOWN_MIN),
          });
          phaseTimer.current = 0;
        } else {
          updateGodzilla({ countdown: newCountdown });
        }
        break;
      }

      case 'emerging': {
        // Emerging phase - Godzilla rises from ground
        phaseTimer.current += delta;
        const progress = Math.min(phaseTimer.current / EMERGE_DURATION, 1);
        const newIntensity = progress; // Scale from 0 to 1

        updateGodzilla({ intensity: newIntensity });

        // Earthquake shake effect during emerge
        updateEarthquake({ intensity: progress * 0.5 });

        if (progress >= 1) {
          updateGodzilla({
            phase: 'roaming',
            intensity: 1,
          });
          updateEarthquake({ intensity: 0 });
          phaseTimer.current = 0;
        }
        break;
      }

      case 'roaming': {
        // Roaming phase - Godzilla walks around and fires ray blasts
        phaseTimer.current += delta;

        // Check if roaming duration exceeded
        if (phaseTimer.current >= ROAMING_DURATION) {
          updateGodzilla({ phase: 'departing' });
          phaseTimer.current = 0;
          break;
        }

        // Movement logic
        let newWalkTimer = walkTimer - delta;
        const newPosition = [...position] as [number, number, number];
        let newRotation = rotation;
        let newTargetPosition = targetPosition;

        if (newWalkTimer <= 0) {
          // Choose new random target
          const angle = Math.random() * Math.PI * 2;
          const distance = MIN_ROAM_DISTANCE + Math.random() * (MAX_ROAM_DISTANCE - MIN_ROAM_DISTANCE);
          newTargetPosition = [
            position[0] + Math.cos(angle) * distance,
            position[1], // Will be updated by terrain following
            position[2] + Math.sin(angle) * distance,
          ];
          newWalkTimer = MIN_WALK_TIME + Math.random() * (MAX_WALK_TIME - MIN_WALK_TIME);
        }

        // Move toward target
        const dx = newTargetPosition[0] - position[0];
        const dz = newTargetPosition[2] - position[2];
        const distanceToTarget = Math.sqrt(dx * dx + dz * dz);

        if (distanceToTarget > 1) {
          // Normalize and apply speed
          const moveX = (dx / distanceToTarget) * WALK_SPEED * delta;
          const moveZ = (dz / distanceToTarget) * WALK_SPEED * delta;

          newPosition[0] += moveX;
          newPosition[2] += moveZ;
          newPosition[1] = findGroundLevel(chunks, newPosition[0], newPosition[2]);

          // Update rotation to face movement direction
          newRotation = Math.atan2(dz, dx);
        }

        // Ray blast logic
        let newMouthRayActive = mouthRayActive;
        let newMouthRayTimer = mouthRayTimer - delta;
        let newMouthRayPosition = godzilla.mouthRayPosition;
        let newHasDestroyedBlocks = hasDestroyedBlocks;

        if (!mouthRayActive && newMouthRayTimer <= 0) {
          // Start new ray blast
          newMouthRayActive = true;
          newMouthRayTimer = RAY_DURATION;

          // Calculate target point in front of Godzilla
          const rayDistance = RAY_DISTANCE_MIN + Math.random() * (RAY_DISTANCE_MAX - RAY_DISTANCE_MIN);
          const mouthHeight = GODZILLA_HEIGHT * 0.7; // Ray comes from head
          newMouthRayPosition = [
            newPosition[0] + Math.cos(newRotation) * rayDistance,
            newPosition[1] + mouthHeight,
            newPosition[2] + Math.sin(newRotation) * rayDistance,
          ];

          // Begin incremental block destruction
          newHasDestroyedBlocks = false;
          chunksToProcess.current = Array.from(chunks.keys());
        }

        if (mouthRayActive) {
          // Process destruction incrementally
          if (chunksToProcess.current.length > 0 && !hasDestroyedBlocks) {
            const keysThisFrame = chunksToProcess.current.splice(0, CHUNKS_PER_FRAME);

            for (const key of keysThisFrame) {
              const chunk = chunks.get(key);
              if (chunk) {
                processRayBlastDestruction(chunk, newMouthRayPosition, newPosition, newRotation, setChunk);
              }
            }

            if (chunksToProcess.current.length === 0) {
              newHasDestroyedBlocks = true;
            }
          }

          // Deactivate when complete
          if (newMouthRayTimer <= 0) {
            newMouthRayActive = false;
            newMouthRayTimer = RAY_COOLDOWN_MIN + Math.random() * (RAY_COOLDOWN_MAX - RAY_COOLDOWN_MIN);
          }
        }

        updateGodzilla({
          position: newPosition,
          rotation: newRotation,
          targetPosition: newTargetPosition,
          walkTimer: newWalkTimer,
          mouthRayActive: newMouthRayActive,
          mouthRayTimer: newMouthRayTimer,
          mouthRayPosition: newMouthRayPosition,
          hasDestroyedBlocks: newHasDestroyedBlocks,
        });
        break;
      }

      case 'departing': {
        // Departing phase - Godzilla sinks into ground
        phaseTimer.current += delta;
        const progress = Math.min(phaseTimer.current / DEPART_DURATION, 1);
        const newIntensity = 1 - progress; // Scale from 1 to 0

        updateGodzilla({ intensity: newIntensity });

        // Earthquake shake effect during depart
        updateEarthquake({ intensity: progress * 0.5 });

        if (progress >= 1) {
          updateGodzilla({
            phase: 'countdown',
            countdown: GODZILLA_COUNTDOWN,
            intensity: 0,
            mouthRayActive: false,
            hasDestroyedBlocks: false,
          });
          updateEarthquake({ intensity: 0 });
          phaseTimer.current = 0;

          // Switch to next catastrophe (earthquake)
          switchToNextCatastrophe();
        }
        break;
      }
    }
  });

  // Render
  const isVisible = currentCatastrophe === 'godzilla' && godzilla.phase !== 'countdown';

  if (!isVisible) return null;

  const { position, rotation, intensity, mouthRayActive, mouthRayPosition } = godzilla;

  return (
    <group>
      {/* Godzilla model */}
      <group
        ref={bodyRef}
        position={[position[0], position[1], position[2]]}
        rotation={[0, rotation, 0]}
        scale={[intensity * BODY_SCALE, intensity * BODY_SCALE, intensity * BODY_SCALE]}
      >
        <primitive object={godzillaModel} />
      </group>

      {/* Mouth ray beam */}
      {mouthRayActive && (
        <RayBeam
          start={[position[0], position[1] + GODZILLA_HEIGHT * 0.7 * intensity, position[2]]}
          end={mouthRayPosition}
        />
      )}
    </group>
  );
}

// Ray beam visual component
function RayBeam({ start, end }: { start: [number, number, number]; end: [number, number, number] }) {
  const direction = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
  const distance = length(direction as [number, number, number]);
  const midpoint: [number, number, number] = [
    start[0] + direction[0] / 2,
    start[1] + direction[1] / 2,
    start[2] + direction[2] / 2,
  ];

  // Calculate rotation to point from start to end
  const rotationY = Math.atan2(direction[0], direction[2]);
  const rotationX = -Math.atan2(direction[1], Math.sqrt(direction[0] * direction[0] + direction[2] * direction[2]));

  return (
    <group>
      {/* Core beam */}
      <mesh position={midpoint} rotation={[rotationX, rotationY, 0]}>
        <cylinderGeometry args={[1, 2, distance, 8]} />
        <meshStandardMaterial
          color={0x00ffff}
          emissive={0x00ffff}
          emissiveIntensity={2}
          transparent
          opacity={0.8}
        />
      </mesh>

      {/* Outer glow */}
      <mesh position={midpoint} rotation={[rotationX, rotationY, 0]}>
        <cylinderGeometry args={[2, 3, distance, 8]} />
        <meshStandardMaterial
          color={0x0088ff}
          emissive={0x0088ff}
          emissiveIntensity={1}
          transparent
          opacity={0.3}
        />
      </mesh>

      {/* Impact explosion sphere */}
      <mesh position={end}>
        <sphereGeometry args={[CONE_RADIUS, 16, 16]} />
        <meshStandardMaterial
          color={0xffaa00}
          emissive={0xffaa00}
          emissiveIntensity={3}
          transparent
          opacity={0.6}
        />
      </mesh>
    </group>
  );
}

// Process ray blast destruction
function processRayBlastDestruction(
  chunk: { data: Uint8Array; position: { x: number; z: number } },
  impactPoint: [number, number, number],
  godzillaPosition: [number, number, number],
  godzillaRotation: number,
  setChunk: (position: { x: number; z: number }, chunk: { data: Uint8Array; position: { x: number; z: number }; isDirty: boolean }) => void
): void {
  let modified = false;
  const chunkWorldX = chunk.position.x * CHUNK_SIZE;
  const chunkWorldZ = chunk.position.z * CHUNK_SIZE;

  // Calculate ray direction (from Godzilla to impact point)
  const rayDir = normalize([
    impactPoint[0] - godzillaPosition[0],
    impactPoint[1] - godzillaPosition[1],
    impactPoint[2] - godzillaPosition[2],
  ]);

  for (let y = 5; y < CHUNK_HEIGHT; y++) { // Don't destroy below y=5
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const worldX = chunkWorldX + x;
        const worldZ = chunkWorldZ + z;

        // Check if block is within cone
        const blockPos: [number, number, number] = [worldX, y, worldZ];
        const toBlock: [number, number, number] = [
          blockPos[0] - impactPoint[0],
          blockPos[1] - impactPoint[1],
          blockPos[2] - impactPoint[2],
        ];
        const distanceToImpact = length(toBlock);

        if (distanceToImpact <= CONE_RADIUS) {
          const angleToBlock = angleBetween(rayDir, toBlock);

          if (angleToBlock <= CONE_ANGLE && distanceToImpact <= CONE_DEPTH) {
            const block = getBlockFromChunk(chunk.data, x, y, z);

            // Destroy everything except obsidian and portal
            if (block !== BlockType.AIR &&
                block !== BlockType.OBSIDIAN &&
                block !== BlockType.PORTAL) {
              setBlockInChunk(chunk.data, x, y, z, BlockType.AIR);
              modified = true;
            }
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
}
