'use client';

import { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, ZombieData } from '@/stores';
import { CHUNK_SIZE, CHUNK_HEIGHT, getBlockFromChunk, chunkPositionToKey, BlockType } from '@/types';

// Zombie configuration
const ZOMBIE_COUNT = 12;
const ZOMBIE_SPEED = 1.5; // Blocks per second
const ZOMBIE_WANDER_INTERVAL = 3; // Seconds between direction changes
const ZOMBIE_SPAWN_RADIUS = 35; // Spawn radius around mansion
const SPAWN_CENTER = { x: 45, z: 32 }; // Spawn center (around haunted house)

// Mansion bounds (from worldGen.ts: origin at 25,20, size 40x24)
const MANSION_BOUNDS = {
  minX: 25 - 5, // Add buffer zone
  maxX: 25 + 40 + 5,
  minZ: 20 - 5,
  maxZ: 20 + 24 + 5,
};

// Scale factor - zombies are 4x normal size
const SCALE = 4;

// Zombie dimensions (in blocks, will be multiplied by SCALE)
const HEAD_SIZE = 0.5 * SCALE;
const BODY_WIDTH = 0.5 * SCALE;
const BODY_HEIGHT = 0.75 * SCALE;
const BODY_DEPTH = 0.25 * SCALE;
const ARM_WIDTH = 0.25 * SCALE;
const ARM_HEIGHT = 0.75 * SCALE;
const LEG_WIDTH = 0.25 * SCALE;
const LEG_HEIGHT = 0.75 * SCALE;

// Total zombie height for ground positioning
const TOTAL_HEIGHT = BODY_HEIGHT + LEG_HEIGHT;

// Texture size (64x64, but only top 32 rows used for zombie)
const TEX_WIDTH = 64;
const TEX_HEIGHT = 64;

// UV helper - converts pixel coords to UV (Y is flipped)
function pixelToUV(px: number, py: number, pw: number, ph: number): [number, number, number, number] {
  return [
    px / TEX_WIDTH,
    1 - (py + ph) / TEX_HEIGHT,
    (px + pw) / TEX_WIDTH,
    1 - py / TEX_HEIGHT,
  ];
}

// Create UV-mapped geometry for a box face
function createFaceUVs(geometry: THREE.BoxGeometry, faceUVs: { [key: string]: [number, number, number, number] }) {
  const uvAttribute = geometry.attributes.uv;
  const uvArray = uvAttribute.array as Float32Array;

  // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
  const faceOrder = ['right', 'left', 'top', 'bottom', 'front', 'back'];

  for (let i = 0; i < 6; i++) {
    const faceName = faceOrder[i];
    const uv = faceUVs[faceName] || [0, 0, 1, 1];
    const [u1, v1, u2, v2] = uv;
    const baseIdx = i * 8;

    uvArray[baseIdx + 0] = u1; uvArray[baseIdx + 1] = v1;
    uvArray[baseIdx + 2] = u2; uvArray[baseIdx + 3] = v1;
    uvArray[baseIdx + 4] = u1; uvArray[baseIdx + 5] = v2;
    uvArray[baseIdx + 6] = u2; uvArray[baseIdx + 7] = v2;
  }

  uvAttribute.needsUpdate = true;
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

// Check if position is inside mansion bounds
function isInsideMansion(x: number, z: number): boolean {
  return x >= MANSION_BOUNDS.minX && x <= MANSION_BOUNDS.maxX &&
         z >= MANSION_BOUNDS.minZ && z <= MANSION_BOUNDS.maxZ;
}

// Generate initial zombie data
function generateInitialZombies(): ZombieData[] {
  const zombies: ZombieData[] = [];
  const random = seededRandom(12345);

  for (let i = 0; i < ZOMBIE_COUNT; i++) {
    let x: number, z: number;
    let attempts = 0;

    // Keep trying until we find a position outside the mansion
    do {
      const angle = random() * Math.PI * 2;
      const radius = 5 + random() * ZOMBIE_SPAWN_RADIUS;
      x = SPAWN_CENTER.x + Math.cos(angle) * radius;
      z = SPAWN_CENTER.z + Math.sin(angle) * radius;
      attempts++;
    } while (isInsideMansion(x, z) && attempts < 10);

    const dirAngle = random() * Math.PI * 2;

    zombies.push({
      id: i,
      position: [x, 35, z],
      rotation: random() * Math.PI * 2,
      health: 3,
      targetDirection: [Math.cos(dirAngle), 0, Math.sin(dirAngle)],
      wanderTimer: random() * ZOMBIE_WANDER_INTERVAL,
      isHit: false,
      hitTimer: 0,
      isDead: false,
      deathTimer: 0,
    });
  }

  return zombies;
}

// Single Zombie mesh component
function Zombie({
  data,
  texture,
}: {
  data: ZombieData;
  texture: THREE.Texture;
}) {
  const groupRef = useRef<THREE.Group>(null);

  // Create geometries with proper UVs for zombie skin
  const geometries = useMemo(() => {
    const headGeo = new THREE.BoxGeometry(HEAD_SIZE, HEAD_SIZE, HEAD_SIZE);
    createFaceUVs(headGeo, {
      front: pixelToUV(8, 8, 8, 8),
      back: pixelToUV(24, 8, 8, 8),
      left: pixelToUV(0, 8, 8, 8),
      right: pixelToUV(16, 8, 8, 8),
      top: pixelToUV(8, 0, 8, 8),
      bottom: pixelToUV(16, 0, 8, 8),
    });
    headGeo.computeBoundingBox();
    headGeo.computeBoundingSphere();

    const bodyGeo = new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH);
    createFaceUVs(bodyGeo, {
      front: pixelToUV(20, 20, 8, 12),
      back: pixelToUV(32, 20, 8, 12),
      left: pixelToUV(16, 20, 4, 12),
      right: pixelToUV(28, 20, 4, 12),
      top: pixelToUV(20, 16, 8, 4),
      bottom: pixelToUV(28, 16, 8, 4),
    });
    bodyGeo.computeBoundingBox();
    bodyGeo.computeBoundingSphere();

    const armGeo = new THREE.BoxGeometry(ARM_WIDTH, ARM_HEIGHT, ARM_WIDTH);
    createFaceUVs(armGeo, {
      front: pixelToUV(44, 20, 4, 12),
      back: pixelToUV(52, 20, 4, 12),
      left: pixelToUV(40, 20, 4, 12),
      right: pixelToUV(48, 20, 4, 12),
      top: pixelToUV(44, 16, 4, 4),
      bottom: pixelToUV(48, 16, 4, 4),
    });
    armGeo.computeBoundingBox();
    armGeo.computeBoundingSphere();

    const legGeo = new THREE.BoxGeometry(LEG_WIDTH, LEG_HEIGHT, LEG_WIDTH);
    createFaceUVs(legGeo, {
      front: pixelToUV(4, 20, 4, 12),
      back: pixelToUV(12, 20, 4, 12),
      left: pixelToUV(0, 20, 4, 12),
      right: pixelToUV(8, 20, 4, 12),
      top: pixelToUV(4, 16, 4, 4),
      bottom: pixelToUV(8, 16, 4, 4),
    });
    legGeo.computeBoundingBox();
    legGeo.computeBoundingSphere();

    return { headGeo, bodyGeo, armGeo, legGeo };
  }, []);

  // Material with hit flash effect
  const material = useMemo(() => {
    return new THREE.MeshLambertMaterial({
      map: texture,
      transparent: true,
    });
  }, [texture]);

  // Update material color based on hit state
  useEffect(() => {
    if (data.isHit) {
      // Translucent red tint - keep texture visible
      material.color.setHex(0xff8888); // Light red tint
      material.emissive.setHex(0xff0000); // Red glow
      material.emissiveIntensity = 0.3;
    } else {
      material.color.setHex(0xffffff);
      material.emissive.setHex(0x000000);
      material.emissiveIntensity = 0;
    }
  }, [data.isHit, data.id, material]);

  // Fade out when dead
  useEffect(() => {
    if (data.isDead) {
      // Fade from 1 to 0 over 1 second
      const opacity = Math.max(0, 1 - data.deathTimer);
      material.opacity = opacity;
    } else {
      material.opacity = 1;
    }
  }, [data.isDead, data.deathTimer, material]);

  // Don't render if fade-out is complete
  if (data.isDead && data.deathTimer > 1) return null;

  // Calculate body part positions
  const headY = BODY_HEIGHT / 2 + HEAD_SIZE / 2;
  const bodyY = 0;
  const armY = 0;
  const legY = -BODY_HEIGHT / 2 - LEG_HEIGHT / 2;
  const armOffsetX = BODY_WIDTH / 2 + ARM_WIDTH / 2;
  const legOffsetX = BODY_WIDTH / 4;

  return (
    <group
      ref={groupRef}
      name={`zombie-${data.id}`}
      position={[data.position[0], data.position[1], data.position[2]]}
      rotation={[0, data.rotation, 0]}
      userData={{ isZombie: true, zombieId: data.id }}
    >
      {/* Invisible hitbox for easier clicking - covers entire zombie */}
      <mesh
        position={[0, 0, 0]}
        userData={{ isZombie: true, zombieId: data.id }}
        renderOrder={-1}
      >
        <boxGeometry args={[BODY_WIDTH * 1.5, TOTAL_HEIGHT + HEAD_SIZE, BODY_WIDTH * 1.5]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          colorWrite={false}
        />
      </mesh>

      {/* Head */}
      <mesh geometry={geometries.headGeo} material={material} position={[0, headY, 0]} userData={{ isZombie: true, zombieId: data.id }} />

      {/* Body */}
      <mesh geometry={geometries.bodyGeo} material={material} position={[0, bodyY, 0]} userData={{ isZombie: true, zombieId: data.id }} />

      {/* Right Arm - extended forward like zombie */}
      <mesh
        geometry={geometries.armGeo}
        material={material}
        position={[armOffsetX, armY, ARM_HEIGHT / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        userData={{ isZombie: true, zombieId: data.id }}
      />

      {/* Left Arm - extended forward like zombie */}
      <mesh
        geometry={geometries.armGeo}
        material={material}
        position={[-armOffsetX, armY, ARM_HEIGHT / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        userData={{ isZombie: true, zombieId: data.id }}
      />

      {/* Right Leg */}
      <mesh geometry={geometries.legGeo} material={material} position={[legOffsetX, legY, 0]} userData={{ isZombie: true, zombieId: data.id }} />

      {/* Left Leg */}
      <mesh geometry={geometries.legGeo} material={material} position={[-legOffsetX, legY, 0]} userData={{ isZombie: true, zombieId: data.id }} />
    </group>
  );
}

export function ZombieSystem() {
  const isPlaying = useGameStore((state) => state.isPlaying);
  const chunks = useGameStore((state) => state.chunks);
  const zombies = useGameStore((state) => state.zombies);
  const initializeZombies = useGameStore((state) => state.initializeZombies);
  const updateZombies = useGameStore((state) => state.updateZombies);
  const getZombies = useGameStore.getState; // Get fresh state each frame

  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const lastZombieCount = useRef(zombies.length);

  // Load zombie texture
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load('/textures/zombie.png', (tex) => {
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      setTexture(tex);
    });
  }, []);

  // Initialize zombies when needed (new world or after reset)
  useEffect(() => {
    // Only initialize if we have no zombies and we're playing
    if (zombies.length === 0 && isPlaying) {
      initializeZombies(generateInitialZombies());
    }
    lastZombieCount.current = zombies.length;
  }, [zombies.length, isPlaying, initializeZombies]);

  // Find ground level at position
  const findGroundLevel = (x: number, z: number): number => {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const key = chunkPositionToKey({ x: chunkX, z: chunkZ });

    const chunk = chunks.get(key);
    if (!chunk) return 35;

    const localX = ((Math.floor(x) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((Math.floor(z) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      const block = getBlockFromChunk(chunk.data, localX, y, localZ);
      if (block !== BlockType.AIR) {
        return y + 1;
      }
    }
    return 35;
  };

  // Check if a position has a solid block (for collision)
  const isSolidAt = (x: number, y: number, z: number): boolean => {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const key = chunkPositionToKey({ x: chunkX, z: chunkZ });
    const chunk = chunks.get(key);
    if (!chunk) return false;

    const localX = ((Math.floor(x) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((Math.floor(z) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const blockY = Math.floor(y);

    if (blockY < 0 || blockY >= CHUNK_HEIGHT) return blockY < 0;

    const block = getBlockFromChunk(chunk.data, localX, blockY, localZ);
    return block !== BlockType.AIR;
  };

  // Update zombies
  useFrame((_, delta) => {
    // Get fresh zombies state each frame to avoid stale closure
    const currentZombies = getZombies().zombies;

    if (!isPlaying || currentZombies.length === 0) return;

    const playerPos = useGameStore.getState().playerPosition;

    const updatedZombies = currentZombies.map((zombie) => {
      // If dead, just update death timer for fade-out
      if (zombie.isDead) {
        const newDeathTimer = zombie.deathTimer + delta;
        return {
          ...zombie,
          deathTimer: newDeathTimer,
        };
      }

      // Update hit timer
      let isHit = zombie.isHit;
      let hitTimer = zombie.hitTimer;
      if (isHit) {
        hitTimer -= delta;
        if (hitTimer <= 0) {
          isHit = false;
          hitTimer = 0;
        }
      }

      // Update wander timer and direction
      let wanderTimer = zombie.wanderTimer - delta;
      let targetDirection = [...zombie.targetDirection] as [number, number, number];
      if (wanderTimer <= 0) {
        // Pick a new random direction, but avoid mansion area
        let attempts = 0;
        let angle: number;
        let testX: number, testZ: number;

        do {
          angle = Math.random() * Math.PI * 2;
          const testDistance = 5; // Look ahead 5 blocks
          testX = zombie.position[0] + Math.cos(angle) * testDistance;
          testZ = zombie.position[2] + Math.sin(angle) * testDistance;
          attempts++;
        } while (isInsideMansion(testX, testZ) && attempts < 8);

        targetDirection = [Math.cos(angle), 0, Math.sin(angle)];
        wanderTimer = ZOMBIE_WANDER_INTERVAL * (0.5 + Math.random());
      }

      // Move zombie
      const moveSpeed = ZOMBIE_SPEED * delta;
      let newX = zombie.position[0] + targetDirection[0] * moveSpeed;
      let newZ = zombie.position[2] + targetDirection[2] * moveSpeed;

      // If moving into mansion area, reverse direction
      if (isInsideMansion(newX, newZ)) {
        targetDirection = [-targetDirection[0], 0, -targetDirection[2]];
        newX = zombie.position[0] + targetDirection[0] * moveSpeed;
        newZ = zombie.position[2] + targetDirection[2] * moveSpeed;
        wanderTimer = ZOMBIE_WANDER_INTERVAL;
      }

      // Check collision with player (radius-based)
      const dx = newX - playerPos[0];
      const dz = newZ - playerPos[2];
      const distToPlayer = Math.sqrt(dx * dx + dz * dz);
      const minDistance = 1.5; // Minimum distance to player

      if (distToPlayer < minDistance) {
        // Push zombie away from player
        const pushAngle = Math.atan2(dx, dz);
        newX = playerPos[0] + Math.sin(pushAngle) * minDistance;
        newZ = playerPos[2] + Math.cos(pushAngle) * minDistance;
        // Change direction away from player
        targetDirection = [Math.sin(pushAngle), 0, Math.cos(pushAngle)];
        wanderTimer = ZOMBIE_WANDER_INTERVAL;
      }

      // Find ground level
      // Calculate Y position so feet are exactly at ground level
      // Legs are at -BODY_HEIGHT/2 - LEG_HEIGHT/2 from group center
      // Bottom of legs is LEG_HEIGHT/2 below that
      const feetOffset = BODY_HEIGHT / 2 + LEG_HEIGHT; // Distance from group center to bottom of feet
      const groundY = findGroundLevel(newX, newZ);
      const newY = groundY + feetOffset;

      // Check collision with blocks at new position
      const zombieRadius = BODY_WIDTH / 2;
      const checkPositions = [
        [newX, newY, newZ],
        [newX + zombieRadius, newY, newZ],
        [newX - zombieRadius, newY, newZ],
        [newX, newY, newZ + zombieRadius],
        [newX, newY, newZ - zombieRadius],
      ];

      let hasCollision = false;
      for (const [cx, cy, cz] of checkPositions) {
        if (isSolidAt(cx, cy, cz) || isSolidAt(cx, cy + 1, cz)) {
          hasCollision = true;
          break;
        }
      }

      // If collision, don't move and pick new direction (but only if wander timer is low to prevent rapid spinning)
      if (hasCollision) {
        newX = zombie.position[0];
        newZ = zombie.position[2];

        // Only change direction if enough time has passed (prevents rapid spinning)
        if (wanderTimer < 0.5) {
          // Try to pick a direction away from the obstacle
          let angle: number;
          let attempts = 0;

          do {
            angle = Math.random() * Math.PI * 2;
            const testX = newX + Math.cos(angle) * 2;
            const testZ = newZ + Math.sin(angle) * 2;

            // Check if this direction is clear
            const testGroundY = findGroundLevel(testX, testZ);
            const testY = testGroundY + feetOffset;
            const isClear = !isSolidAt(testX, testY, testZ) && !isSolidAt(testX, testY + 1, testZ);

            if (isClear) break;
            attempts++;
          } while (attempts < 4);

          targetDirection = [Math.cos(angle), 0, Math.sin(angle)];
          wanderTimer = ZOMBIE_WANDER_INTERVAL; // Full interval to prevent rapid changes
        }
      }

      // Update rotation to face movement direction (smooth rotation to prevent snapping)
      const targetRotation = Math.atan2(targetDirection[0], targetDirection[2]);
      let rotation = zombie.rotation;

      // Smooth rotation interpolation
      const rotationDiff = targetRotation - rotation;
      const rotationDiffNormalized = Math.atan2(Math.sin(rotationDiff), Math.cos(rotationDiff));
      rotation += rotationDiffNormalized * Math.min(delta * 3, 1); // Smooth rotation over time

      return {
        ...zombie,
        position: [newX, newY, newZ] as [number, number, number],
        rotation,
        targetDirection,
        wanderTimer,
        isHit,
        hitTimer,
        // Preserve health and isDead - they may have been updated by hitZombie
        // Don't overwrite them here
      };
    });

    updateZombies(updatedZombies);
  });

  if (!texture || zombies.length === 0) return null;

  return (
    <group name="zombies">
      {zombies.map((zombie) => (
        <Zombie key={zombie.id} data={zombie} texture={texture} />
      ))}
    </group>
  );
}
