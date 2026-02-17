'use client';

import { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, AnimatronicData, AnimatronicKind } from '@/stores';
import { CHUNK_SIZE, CHUNK_HEIGHT, getBlockFromChunk, chunkPositionToKey, BlockType } from '@/types';

// Animatronic configuration
const ANIMATRONIC_SPEED = 1.0;
const WANDER_INTERVAL = 4;

// Pizzeria bounds (world coordinates) for wander constraint
const PIZZERIA_ORIGIN = { x: 150, z: 200 };
const PIZZERIA_WIDTH = 50;
const PIZZERIA_DEPTH = 40;
const PIZZERIA_BOUNDS = {
  minX: PIZZERIA_ORIGIN.x + 1,
  maxX: PIZZERIA_ORIGIN.x + PIZZERIA_WIDTH - 2,
  minZ: PIZZERIA_ORIGIN.z + 1,
  maxZ: PIZZERIA_ORIGIN.z + PIZZERIA_DEPTH - 2,
};

// Scale factor
const SCALE = 4;

// Body part dimensions
const HEAD_SIZE = 0.5 * SCALE;
const BODY_WIDTH = 0.5 * SCALE;
const BODY_HEIGHT = 0.75 * SCALE;
const BODY_DEPTH = 0.25 * SCALE;
const ARM_WIDTH = 0.25 * SCALE;
const ARM_HEIGHT = 0.75 * SCALE;
const LEG_WIDTH = 0.25 * SCALE;
const LEG_HEIGHT = 0.75 * SCALE;
const TOTAL_HEIGHT = BODY_HEIGHT + LEG_HEIGHT;

// Animatronic definitions
interface AnimatronicDef {
  kind: AnimatronicKind;
  color: number;
  faceTexture: string;
  spawnOffset: [number, number]; // [x, z] offset from stage center
}

const ANIMATRONIC_DEFS: AnimatronicDef[] = [
  { kind: 'freddy', color: 0x8B4513, faceTexture: '/textures/freddy_face.png', spawnOffset: [0, 0] },
  { kind: 'bonnie', color: 0x5A5ACD, faceTexture: '/textures/bonnie_face.png', spawnOffset: [-8, 0] },
  { kind: 'foxy', color: 0xCC3333, faceTexture: '/textures/foxy_face.png', spawnOffset: [-16, 0] },
  { kind: 'chica', color: 0xFFD700, faceTexture: '/textures/chica_face.png', spawnOffset: [8, 0] },
];

// Stage center in world coords (stage spans z=13..19, center at z=16)
const STAGE_CENTER_X = PIZZERIA_ORIGIN.x + 25;
const STAGE_CENTER_Z = PIZZERIA_ORIGIN.z + 16;

function isInsidePizzeria(x: number, z: number): boolean {
  return x >= PIZZERIA_BOUNDS.minX && x <= PIZZERIA_BOUNDS.maxX &&
         z >= PIZZERIA_BOUNDS.minZ && z <= PIZZERIA_BOUNDS.maxZ;
}

function generateInitialAnimatronics(): AnimatronicData[] {
  return ANIMATRONIC_DEFS.map((def, i) => ({
    id: i,
    kind: def.kind,
    position: [
      STAGE_CENTER_X + def.spawnOffset[0],
      50, // Will be corrected by ground detection
      STAGE_CENTER_Z + def.spawnOffset[1],
    ] as [number, number, number],
    rotation: Math.PI, // Face the audience (toward -Z)
    health: 5,
    targetDirection: [0, 0, -1] as [number, number, number],
    wanderTimer: 2 + i * 1.5, // Staggered start
    isHit: false,
    hitTimer: 0,
    isDead: false,
    deathTimer: 0,
  }));
}

// Single Animatronic mesh component
function Animatronic({
  data,
  faceTexture,
  bodyColor,
}: {
  data: AnimatronicData;
  faceTexture: THREE.Texture | null;
  bodyColor: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  // Create geometries
  const geometries = useMemo(() => {
    const headGeo = new THREE.BoxGeometry(HEAD_SIZE, HEAD_SIZE, HEAD_SIZE);
    headGeo.computeBoundingBox();
    headGeo.computeBoundingSphere();
    const bodyGeo = new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH);
    bodyGeo.computeBoundingBox();
    bodyGeo.computeBoundingSphere();
    const armGeo = new THREE.BoxGeometry(ARM_WIDTH, ARM_HEIGHT, ARM_WIDTH);
    armGeo.computeBoundingBox();
    armGeo.computeBoundingSphere();
    const legGeo = new THREE.BoxGeometry(LEG_WIDTH, LEG_HEIGHT, LEG_WIDTH);
    legGeo.computeBoundingBox();
    legGeo.computeBoundingSphere();
    return { headGeo, bodyGeo, armGeo, legGeo };
  }, []);

  // Body material (solid color)
  const bodyMaterial = useMemo(() => {
    return new THREE.MeshLambertMaterial({ color: bodyColor, transparent: true });
  }, [bodyColor]);

  // Head materials: 6 faces [+X right, -X left, +Y top, -Y bottom, +Z front, -Z back]
  const headMaterials = useMemo(() => {
    const sideMat = new THREE.MeshLambertMaterial({ color: bodyColor, transparent: true });
    const faceMat = faceTexture
      ? new THREE.MeshLambertMaterial({ map: faceTexture, transparent: true })
      : sideMat;
    // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
    // +Z is the "front" of the head (face direction)
    return [sideMat, sideMat, sideMat, sideMat, faceMat, sideMat];
  }, [bodyColor, faceTexture]);

  // Hit flash effect
  useEffect(() => {
    const allMats = [bodyMaterial, ...headMaterials];
    if (data.isHit) {
      allMats.forEach(m => {
        m.color.setHex(0xff8888);
        m.emissive.setHex(0xff0000);
        m.emissiveIntensity = 0.3;
      });
    } else {
      bodyMaterial.color.setHex(bodyColor);
      headMaterials.forEach((m, i) => {
        if (i === 4 && faceTexture) {
          m.color.setHex(0xffffff); // Don't tint the face texture
        } else {
          m.color.setHex(bodyColor);
        }
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 0;
      });
    }
  }, [data.isHit, data.id, bodyMaterial, headMaterials, bodyColor, faceTexture]);

  // Death fade
  useEffect(() => {
    const opacity = data.isDead ? Math.max(0, 1 - data.deathTimer) : 1;
    bodyMaterial.opacity = opacity;
    headMaterials.forEach(m => { m.opacity = opacity; });
  }, [data.isDead, data.deathTimer, bodyMaterial, headMaterials]);

  if (data.isDead && data.deathTimer > 1) return null;

  const headY = BODY_HEIGHT / 2 + HEAD_SIZE / 2;
  const legY = -BODY_HEIGHT / 2 - LEG_HEIGHT / 2;
  const armOffsetX = BODY_WIDTH / 2 + ARM_WIDTH / 2;
  const legOffsetX = BODY_WIDTH / 4;

  const ud = { isAnimatronic: true, animatronicId: data.id };

  return (
    <group
      ref={groupRef}
      name={`animatronic-${data.kind}-${data.id}`}
      position={[data.position[0], data.position[1], data.position[2]]}
      rotation={[0, data.rotation, 0]}
      userData={ud}
    >
      {/* Invisible hitbox */}
      <mesh position={[0, 0, 0]} userData={ud} renderOrder={-1}>
        <boxGeometry args={[BODY_WIDTH * 1.5, TOTAL_HEIGHT + HEAD_SIZE, BODY_WIDTH * 1.5]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>

      {/* Head with face texture on front */}
      <mesh geometry={geometries.headGeo} material={headMaterials} position={[0, headY, 0]} userData={ud} />

      {/* Body */}
      <mesh geometry={geometries.bodyGeo} material={bodyMaterial} position={[0, 0, 0]} userData={ud} />

      {/* Arms - at sides */}
      <mesh geometry={geometries.armGeo} material={bodyMaterial} position={[armOffsetX, 0, 0]} userData={ud} />
      <mesh geometry={geometries.armGeo} material={bodyMaterial} position={[-armOffsetX, 0, 0]} userData={ud} />

      {/* Legs */}
      <mesh geometry={geometries.legGeo} material={bodyMaterial} position={[legOffsetX, legY, 0]} userData={ud} />
      <mesh geometry={geometries.legGeo} material={bodyMaterial} position={[-legOffsetX, legY, 0]} userData={ud} />
    </group>
  );
}

export function AnimatronicSystem() {
  const isPlaying = useGameStore((state) => state.isPlaying);
  const chunks = useGameStore((state) => state.chunks);
  const animatronics = useGameStore((state) => state.animatronics);
  const initializeAnimatronics = useGameStore((state) => state.initializeAnimatronics);
  const updateAnimatronics = useGameStore((state) => state.updateAnimatronics);
  const getState = useGameStore.getState;

  const [textures, setTextures] = useState<Map<AnimatronicKind, THREE.Texture>>(new Map());

  // Load face textures
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    const loaded = new Map<AnimatronicKind, THREE.Texture>();
    let count = 0;

    for (const def of ANIMATRONIC_DEFS) {
      loader.load(def.faceTexture, (tex) => {
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        loaded.set(def.kind, tex);
        count++;
        if (count === ANIMATRONIC_DEFS.length) {
          setTextures(new Map(loaded));
        }
      });
    }
  }, []);

  // Initialize when needed
  useEffect(() => {
    if (animatronics.length === 0 && isPlaying) {
      initializeAnimatronics(generateInitialAnimatronics());
    }
  }, [animatronics.length, isPlaying, initializeAnimatronics]);

  // Ground level detection - scans downward from fromY to find interior floor
  // (scanning from chunk top would find the roof instead of the floor)
  const findGroundLevel = (x: number, z: number, fromY: number): number => {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const key = chunkPositionToKey({ x: chunkX, z: chunkZ });
    const chunk = chunks.get(key);
    if (!chunk) return 50;

    const localX = ((Math.floor(x) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((Math.floor(z) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    const startY = Math.min(Math.floor(fromY), CHUNK_HEIGHT - 1);
    for (let y = startY; y >= 0; y--) {
      const block = getBlockFromChunk(chunk.data, localX, y, localZ);
      if (block !== BlockType.AIR) {
        return y + 1;
      }
    }
    return 50;
  };

  // Collision check
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

  // Update animatronics
  useFrame((_, delta) => {
    const current = getState().animatronics;
    if (!isPlaying || current.length === 0) return;

    const playerPos = getState().playerPosition;

    const updated = current.map((anim) => {
      if (anim.isDead) {
        return { ...anim, deathTimer: anim.deathTimer + delta };
      }

      let isHit = anim.isHit;
      let hitTimer = anim.hitTimer;
      if (isHit) {
        hitTimer -= delta;
        if (hitTimer <= 0) { isHit = false; hitTimer = 0; }
      }

      let wanderTimer = anim.wanderTimer - delta;
      let targetDirection = [...anim.targetDirection] as [number, number, number];

      if (wanderTimer <= 0) {
        let angle: number;
        let attempts = 0;
        do {
          angle = Math.random() * Math.PI * 2;
          const testX = anim.position[0] + Math.cos(angle) * 5;
          const testZ = anim.position[2] + Math.sin(angle) * 5;
          attempts++;
          if (isInsidePizzeria(testX, testZ)) break;
        } while (attempts < 8);

        targetDirection = [Math.cos(angle!), 0, Math.sin(angle!)];
        wanderTimer = WANDER_INTERVAL * (0.5 + Math.random());
      }

      const moveSpeed = ANIMATRONIC_SPEED * delta;
      let newX = anim.position[0] + targetDirection[0] * moveSpeed;
      let newZ = anim.position[2] + targetDirection[2] * moveSpeed;

      // Keep inside pizzeria bounds
      if (!isInsidePizzeria(newX, newZ)) {
        targetDirection = [-targetDirection[0], 0, -targetDirection[2]];
        newX = anim.position[0] + targetDirection[0] * moveSpeed;
        newZ = anim.position[2] + targetDirection[2] * moveSpeed;
        wanderTimer = WANDER_INTERVAL;
      }

      // Player collision
      const dx = newX - playerPos[0];
      const dz = newZ - playerPos[2];
      const distToPlayer = Math.sqrt(dx * dx + dz * dz);
      if (distToPlayer < 1.5) {
        const pushAngle = Math.atan2(dx, dz);
        newX = playerPos[0] + Math.sin(pushAngle) * 1.5;
        newZ = playerPos[2] + Math.cos(pushAngle) * 1.5;
        targetDirection = [Math.sin(pushAngle), 0, Math.cos(pushAngle)];
        wanderTimer = WANDER_INTERVAL;
      }

      // Ground + collision (scan from current Y to find interior floor, not roof)
      const feetOffset = BODY_HEIGHT / 2 + LEG_HEIGHT;
      const groundY = findGroundLevel(newX, newZ, Math.floor(anim.position[1]));
      const newY = groundY + feetOffset;

      const radius = BODY_WIDTH / 2;
      const checkPositions = [
        [newX, newY, newZ],
        [newX + radius, newY, newZ],
        [newX - radius, newY, newZ],
        [newX, newY, newZ + radius],
        [newX, newY, newZ - radius],
      ];

      let hasCollision = false;
      for (const [cx, cy, cz] of checkPositions) {
        if (isSolidAt(cx, cy, cz) || isSolidAt(cx, cy + 1, cz)) {
          hasCollision = true;
          break;
        }
      }

      if (hasCollision) {
        newX = anim.position[0];
        newZ = anim.position[2];
        if (wanderTimer < 0.5) {
          const angle = Math.random() * Math.PI * 2;
          targetDirection = [Math.cos(angle), 0, Math.sin(angle)];
          wanderTimer = WANDER_INTERVAL;
        }
      }

      // Smooth rotation
      const targetRotation = Math.atan2(targetDirection[0], targetDirection[2]);
      let rotation = anim.rotation;
      const rotDiff = Math.atan2(Math.sin(targetRotation - rotation), Math.cos(targetRotation - rotation));
      rotation += rotDiff * Math.min(delta * 3, 1);

      return {
        ...anim,
        position: [newX, newY, newZ] as [number, number, number],
        rotation,
        targetDirection,
        wanderTimer,
        isHit,
        hitTimer,
      };
    });

    updateAnimatronics(updated);
  });

  if (textures.size === 0 || animatronics.length === 0) return null;

  return (
    <group name="animatronics">
      {animatronics.map((anim) => {
        const def = ANIMATRONIC_DEFS.find(d => d.kind === anim.kind)!;
        return (
          <Animatronic
            key={anim.id}
            data={anim}
            faceTexture={textures.get(anim.kind) || null}
            bodyColor={def.color}
          />
        );
      })}
    </group>
  );
}
