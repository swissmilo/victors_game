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
const ZOMBIE_SPAWN_RADIUS = 30; // Spawn radius around mansion
const MANSION_CENTER = { x: 45, z: 32 }; // Center of mansion area

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

// Generate initial zombie data
function generateInitialZombies(): ZombieData[] {
  const zombies: ZombieData[] = [];
  const random = seededRandom(12345);

  for (let i = 0; i < ZOMBIE_COUNT; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 5 + random() * ZOMBIE_SPAWN_RADIUS;
    const x = MANSION_CENTER.x + Math.cos(angle) * radius;
    const z = MANSION_CENTER.z + Math.sin(angle) * radius;
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
      material.color.setHex(0xff0000);
      material.emissive.setHex(0xff0000);
      material.emissiveIntensity = 0.5;
    } else {
      material.color.setHex(0xffffff);
      material.emissive.setHex(0x000000);
      material.emissiveIntensity = 0;
    }
  }, [data.isHit, material]);

  if (data.isDead) return null;

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

  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const initialized = useRef(false);

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

  // Initialize zombies once
  useEffect(() => {
    if (!initialized.current && zombies.length === 0) {
      initialized.current = true;
      initializeZombies(generateInitialZombies());
    }
  }, [zombies.length, initializeZombies]);

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

  // Update zombies
  useFrame((_, delta) => {
    if (!isPlaying || zombies.length === 0) return;

    const updatedZombies = zombies.map((zombie) => {
      if (zombie.isDead) return zombie;

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
        const angle = Math.random() * Math.PI * 2;
        targetDirection = [Math.cos(angle), 0, Math.sin(angle)];
        wanderTimer = ZOMBIE_WANDER_INTERVAL * (0.5 + Math.random());
      }

      // Move zombie
      const moveSpeed = ZOMBIE_SPEED * delta;
      const newX = zombie.position[0] + targetDirection[0] * moveSpeed;
      const newZ = zombie.position[2] + targetDirection[2] * moveSpeed;

      // Find ground level and adjust Y (add 1 block to prevent feet sinking)
      const groundY = findGroundLevel(newX, newZ);
      const newY = groundY + TOTAL_HEIGHT / 2 + 1;

      // Update rotation to face movement direction
      const rotation = Math.atan2(targetDirection[0], targetDirection[2]);

      return {
        ...zombie,
        position: [newX, newY, newZ] as [number, number, number],
        rotation,
        targetDirection,
        wanderTimer,
        isHit,
        hitTimer,
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
