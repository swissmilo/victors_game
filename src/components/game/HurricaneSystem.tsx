'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, HURRICANE_COUNTDOWN, METEOR_SHOWER_COUNTDOWN } from '@/stores';
import { BlockType, CHUNK_SIZE, CHUNK_HEIGHT, setBlockInChunk, getBlockFromChunk } from '@/types';

// Hurricane timing configuration
const FORMING_DURATION = 3;       // Seconds for hurricane to form
const ACTIVE_DURATION = 12;       // Seconds of active hurricane
const DISSIPATING_DURATION = 3;   // Seconds for hurricane to fade

// Hurricane movement
const ORBIT_SPEED = 0.5;          // Radians per second
const MIN_ORBIT_RADIUS = 15;      // Minimum distance from player
const MAX_ORBIT_RADIUS = 35;      // Maximum distance from player
const ORBIT_OSCILLATION_SPEED = 0.3;  // How fast radius changes
const HURRICANE_Y = 30;           // Fixed Y position (ground level)

// Hurricane visual properties
const FUNNEL_RADIUS = 8;          // Base radius of funnel
const FUNNEL_HEIGHT = 20;         // Height of funnel

// Block destruction
const DESTRUCTION_RADIUS = 10;    // Blocks within this radius get destroyed
const DESTRUCTION_CHANCE = 0.15;  // 15% chance per block
const DESTRUCTION_Y_MIN = 25;     // Don't destroy below this Y
const DESTRUCTION_Y_MAX = 60;     // Don't destroy above this Y
const CHUNKS_PER_FRAME = 2;       // How many chunks to process per frame

// Debris particle configuration
const DEBRIS_COUNT = 500;
const DEBRIS_RADIUS = 12;         // Debris spiral radius
const DEBRIS_HEIGHT = 25;         // Height of debris column

// Blocks that can be destroyed by hurricane
const DESTROYABLE_BLOCKS = new Set([
  BlockType.LEAVES,
  BlockType.SAND,
  BlockType.PLANKS,
]);

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// Pre-generate debris particle data
function generateDebrisData() {
  const positions = new Float32Array(DEBRIS_COUNT * 3);
  const colors = new Float32Array(DEBRIS_COUNT * 3);
  const speeds = new Float32Array(DEBRIS_COUNT);
  const phases = new Float32Array(DEBRIS_COUNT);

  // Debris colors: brown, green, tan
  const debrisColors = [
    [0.55, 0.27, 0.07],  // Brown
    [0.13, 0.55, 0.13],  // Green
    [0.82, 0.71, 0.55],  // Tan
    [0.4, 0.26, 0.13],   // Dark brown
  ];

  for (let i = 0; i < DEBRIS_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * DEBRIS_RADIUS;
    const h = Math.random() * DEBRIS_HEIGHT;

    positions[i * 3] = Math.cos(angle) * r;
    positions[i * 3 + 1] = h;
    positions[i * 3 + 2] = Math.sin(angle) * r;

    const colorIndex = Math.floor(Math.random() * debrisColors.length);
    colors[i * 3] = debrisColors[colorIndex][0];
    colors[i * 3 + 1] = debrisColors[colorIndex][1];
    colors[i * 3 + 2] = debrisColors[colorIndex][2];

    speeds[i] = 2 + Math.random() * 3;  // Upward speed
    phases[i] = Math.random() * Math.PI * 2;  // Initial phase for spiral
  }

  return { positions, colors, speeds, phases };
}

const debrisData = generateDebrisData();

// Create materials at module level
const funnelMaterial = new THREE.MeshBasicMaterial({
  color: 0x4a4a4a,  // Dark gray
  transparent: true,
  opacity: 0.7,
  side: THREE.DoubleSide,
});

const debrisMaterial = new THREE.PointsMaterial({
  size: 0.5,
  vertexColors: true,
  transparent: true,
  opacity: 0.9,
  sizeAttenuation: true,
});

const shadowMaterial = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0.3,
  side: THREE.DoubleSide,
});

export function HurricaneSystem() {
  const hurricane = useGameStore((state) => state.hurricane);
  const updateHurricane = useGameStore((state) => state.updateHurricane);
  const playerPosition = useGameStore((state) => state.playerPosition);
  const chunks = useGameStore((state) => state.chunks);
  const setChunk = useGameStore((state) => state.setChunk);
  const isPlaying = useGameStore((state) => state.isPlaying);
  const currentCatastrophe = useGameStore((state) => state.currentCatastrophe);
  const switchToNextCatastrophe = useGameStore((state) => state.switchToNextCatastrophe);
  const updateMeteorShower = useGameStore((state) => state.updateMeteorShower);

  const phaseTimer = useRef(0);
  const funnelRef = useRef<THREE.Mesh>(null);
  const debrisRef = useRef<THREE.Points>(null);
  const shadowRef = useRef<THREE.Mesh>(null);
  const chunksToProcess = useRef<string[]>([]);
  const destructionSeed = useRef(0);
  const timeRef = useRef(0);

  // Create funnel geometry (inverted cone)
  const funnelGeometry = useMemo(() => {
    // ConeGeometry with radiusTop=0 creates a point at top
    // We want inverted (wider at top), so use radiusTop > radiusBottom
    return new THREE.ConeGeometry(FUNNEL_RADIUS, FUNNEL_HEIGHT, 32, 1, true);
  }, []);

  useFrame((_, delta) => {
    if (!isPlaying) return;

    // Only run when hurricane is the current catastrophe
    if (currentCatastrophe !== 'hurricane') {
      return;
    }

    const { phase, countdown, angle, orbitRadius, rotation } = hurricane;
    timeRef.current += delta;

    switch (phase) {
      case 'countdown': {
        // Count down to hurricane
        const newCountdown = countdown - delta;
        if (newCountdown <= 0) {
          // Initialize hurricane position near player
          const initialAngle = Math.random() * Math.PI * 2;
          const initialRadius = (MIN_ORBIT_RADIUS + MAX_ORBIT_RADIUS) / 2;
          const spawnX = playerPosition[0] + Math.cos(initialAngle) * initialRadius;
          const spawnZ = playerPosition[2] + Math.sin(initialAngle) * initialRadius;

          updateHurricane({
            phase: 'forming',
            countdown: 0,
            position: [spawnX, HURRICANE_Y, spawnZ],
            angle: initialAngle,
            orbitRadius: initialRadius,
            intensity: 0,
            hasDestroyedBlocks: false,
          });
          phaseTimer.current = 0;
          chunksToProcess.current = [];
          destructionSeed.current = Date.now();
        } else {
          updateHurricane({ countdown: newCountdown });
        }
        break;
      }

      case 'forming': {
        // Hurricane forms and grows
        phaseTimer.current += delta;
        const progress = Math.min(phaseTimer.current / FORMING_DURATION, 1);

        // Update position (start orbiting)
        const newAngle = angle + ORBIT_SPEED * delta * progress;
        const newX = playerPosition[0] + Math.cos(newAngle) * orbitRadius;
        const newZ = playerPosition[2] + Math.sin(newAngle) * orbitRadius;

        updateHurricane({
          intensity: progress,
          angle: newAngle,
          position: [newX, HURRICANE_Y, newZ],
          rotation: rotation + delta * 3 * progress,
        });

        if (progress >= 1) {
          updateHurricane({ phase: 'active', intensity: 1 });
          phaseTimer.current = 0;
        }
        break;
      }

      case 'active': {
        phaseTimer.current += delta;

        // Orbit around player
        const newAngle = angle + ORBIT_SPEED * delta;

        // Oscillate radius
        const radiusT = Math.sin(timeRef.current * ORBIT_OSCILLATION_SPEED);
        const newRadius = MIN_ORBIT_RADIUS + (MAX_ORBIT_RADIUS - MIN_ORBIT_RADIUS) * (radiusT * 0.5 + 0.5);

        const newX = playerPosition[0] + Math.cos(newAngle) * newRadius;
        const newZ = playerPosition[2] + Math.sin(newAngle) * newRadius;

        updateHurricane({
          angle: newAngle,
          orbitRadius: newRadius,
          position: [newX, HURRICANE_Y, newZ],
          rotation: rotation + delta * 5,
        });

        // Process block destruction
        if (chunksToProcess.current.length === 0 && !hurricane.hasDestroyedBlocks) {
          chunksToProcess.current = Array.from(chunks.keys());
        }

        if (chunksToProcess.current.length > 0) {
          const keysThisFrame = chunksToProcess.current.splice(0, CHUNKS_PER_FRAME);
          const hurricanePos = hurricane.position;

          for (const key of keysThisFrame) {
            const chunk = chunks.get(key);
            if (chunk) {
              processChunkDestruction(
                chunk,
                setChunk,
                hurricanePos,
                destructionSeed.current
              );
            }
          }

          if (chunksToProcess.current.length === 0) {
            updateHurricane({ hasDestroyedBlocks: true });
          }
        }

        if (phaseTimer.current >= ACTIVE_DURATION) {
          updateHurricane({ phase: 'dissipating' });
          phaseTimer.current = 0;
        }
        break;
      }

      case 'dissipating': {
        phaseTimer.current += delta;
        const progress = Math.min(phaseTimer.current / DISSIPATING_DURATION, 1);

        // Continue orbiting but slower
        const newAngle = angle + ORBIT_SPEED * delta * (1 - progress);
        const newX = playerPosition[0] + Math.cos(newAngle) * orbitRadius;
        const newZ = playerPosition[2] + Math.sin(newAngle) * orbitRadius;

        updateHurricane({
          intensity: 1 - progress,
          angle: newAngle,
          position: [newX, HURRICANE_Y, newZ],
          rotation: rotation + delta * 3 * (1 - progress),
        });

        if (progress >= 1) {
          // Reset and transition to next catastrophe (meteor shower)
          updateHurricane({
            phase: 'countdown',
            countdown: HURRICANE_COUNTDOWN,
            intensity: 0,
            position: [0, HURRICANE_Y, 0],
            angle: 0,
            orbitRadius: 25,
            rotation: 0,
            pullForce: [0, 0, 0],
            hasDestroyedBlocks: false,
          });
          phaseTimer.current = 0;

          // Switch to meteor shower
          switchToNextCatastrophe();
          updateMeteorShower({
            phase: 'countdown',
            countdown: METEOR_SHOWER_COUNTDOWN,
          });
        }
        break;
      }
    }

    // Update funnel rotation
    if (funnelRef.current) {
      funnelRef.current.rotation.y = hurricane.rotation;
    }

    // Update debris particles
    if (debrisRef.current && hurricane.intensity > 0) {
      const geometry = debrisRef.current.geometry;
      const posAttr = geometry.attributes.position as THREE.BufferAttribute;
      const posArray = posAttr.array as Float32Array;

      for (let i = 0; i < DEBRIS_COUNT; i++) {
        // Get current position in local space
        const localX = posArray[i * 3];
        const localY = posArray[i * 3 + 1];
        const localZ = posArray[i * 3 + 2];

        // Calculate current radius and angle
        const r = Math.sqrt(localX * localX + localZ * localZ);
        let currentAngle = Math.atan2(localZ, localX);

        // Rotate around center (faster near center)
        const rotSpeed = (3 + (1 - r / DEBRIS_RADIUS) * 5) * delta;
        currentAngle += rotSpeed;

        // Move upward
        let newY = localY + debrisData.speeds[i] * delta;
        if (newY > DEBRIS_HEIGHT) {
          newY = 0;
        }

        // Calculate new position with spiral motion
        const newR = r + Math.sin(timeRef.current * 2 + debrisData.phases[i]) * 0.1;
        posArray[i * 3] = Math.cos(currentAngle) * Math.max(0.5, newR);
        posArray[i * 3 + 1] = newY;
        posArray[i * 3 + 2] = Math.sin(currentAngle) * Math.max(0.5, newR);
      }

      posAttr.needsUpdate = true;
    }
  });

  // Only render when hurricane is visible
  const isVisible = currentCatastrophe === 'hurricane' && hurricane.phase !== 'countdown';

  if (!isVisible) return null;

  const scale = hurricane.intensity;

  return (
    <group position={hurricane.position}>
      {/* Funnel cone (inverted - wider at top) */}
      <mesh
        ref={funnelRef}
        rotation={[Math.PI, 0, 0]}  // Flip to make wider at top
        scale={[scale, scale, scale]}
      >
        <primitive object={funnelGeometry} attach="geometry" />
        <primitive object={funnelMaterial} attach="material" />
      </mesh>

      {/* Debris particles */}
      <points ref={debrisRef} scale={[scale, scale, scale]}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[debrisData.positions.slice(), 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[debrisData.colors, 3]}
          />
        </bufferGeometry>
        <primitive object={debrisMaterial} attach="material" />
      </points>

      {/* Ground shadow */}
      <mesh
        ref={shadowRef}
        position={[0, -HURRICANE_Y + 0.1, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[scale, scale, 1]}
      >
        <ringGeometry args={[0, FUNNEL_RADIUS * 1.5, 32]} />
        <primitive object={shadowMaterial} attach="material" />
      </mesh>
    </group>
  );
}

/**
 * Process chunk for hurricane destruction.
 * Destroys LEAVES, SAND, PLANKS within destruction radius.
 */
function processChunkDestruction(
  chunk: { data: Uint8Array; position: { x: number; z: number }; isDirty: boolean },
  setChunk: (position: { x: number; z: number }, chunk: { data: Uint8Array; position: { x: number; z: number }; isDirty: boolean }) => void,
  hurricanePos: [number, number, number],
  seed: number
): void {
  let modified = false;
  const chunkWorldX = chunk.position.x * CHUNK_SIZE;
  const chunkWorldZ = chunk.position.z * CHUNK_SIZE;
  const chunkSeed = chunk.position.x * 1000 + chunk.position.z + seed * 0.001;

  for (let y = DESTRUCTION_Y_MIN; y < Math.min(DESTRUCTION_Y_MAX, CHUNK_HEIGHT); y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const block = getBlockFromChunk(chunk.data, x, y, z);

        if (DESTROYABLE_BLOCKS.has(block)) {
          // Calculate world position
          const worldX = chunkWorldX + x;
          const worldZ = chunkWorldZ + z;

          // Check distance to hurricane
          const dx = worldX - hurricanePos[0];
          const dz = worldZ - hurricanePos[2];
          const distance = Math.sqrt(dx * dx + dz * dz);

          if (distance <= DESTRUCTION_RADIUS) {
            // Random chance to destroy
            const blockSeed = chunkSeed + x * 100 + y * 10000 + z;
            if (seededRandom(blockSeed) < DESTRUCTION_CHANCE) {
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
