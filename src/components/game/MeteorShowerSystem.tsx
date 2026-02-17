'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, METEOR_SHOWER_COUNTDOWN, SANDSTORM_COUNTDOWN } from '@/stores';
import { BlockType, CHUNK_SIZE, CHUNK_HEIGHT, setBlockInChunk, getBlockFromChunk, chunkPositionToKey } from '@/types';

// Meteor shower timing configuration
const DARKENING_DURATION = 3;     // Seconds for sky to darken
const ACTIVE_DURATION = 15;       // Seconds of active meteor shower
const CLEARING_DURATION = 3;      // Seconds for sky to clear

// Meteor configuration
const MAX_METEORS = 20;           // Maximum concurrent meteors
const METEOR_SPAWN_RATE = 1.5;    // Meteors per second during active phase
const METEOR_SPAWN_HEIGHT = 200;  // Y level where meteors spawn (high in sky, visible from ground)
const METEOR_SPAWN_RADIUS = 60;   // XZ radius around player for spawning
const METEOR_SPEED = 30;          // Fall speed
const METEOR_SIZE = 3.0;          // Visual size of meteor

// Crater configuration
const CRATER_RADIUS = 4;          // Blocks destroyed in crater
const CRATER_DEPTH = 3;           // How deep the crater goes

// Trail configuration
const TRAIL_SEGMENTS = 24;        // Number of trail segments per meteor
const TRAIL_TIME_STEP = 0.08;     // Seconds between trail points (velocity-based)

// Streak configuration
const STREAK_LENGTH_FACTOR = 0.5; // Seconds of velocity for streak length

// Explosion configuration
const MAX_EXPLOSIONS = 10;

interface MeteorData {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  active: boolean;
}

interface ExplosionData {
  position: THREE.Vector3;
  time: number;
  active: boolean;
}

// Pre-create materials at module level
const meteorMaterial = new THREE.MeshBasicMaterial({
  color: 0xff4400,
  transparent: true,
  opacity: 0.9,
  fog: false,
});

const meteorGlowMaterial = new THREE.MeshBasicMaterial({
  color: 0xffaa00,
  transparent: true,
  opacity: 0.5,
  fog: false,
});

const streakMaterial = new THREE.MeshBasicMaterial({
  color: 0xff6600,
  transparent: true,
  opacity: 0.7,
  fog: false,
});

// Trail positions buffer (module level to avoid hooks issues)
const trailPositionsBuffer = new Float32Array(MAX_METEORS * TRAIL_SEGMENTS * 3);

export function MeteorShowerSystem() {
  const meteorShower = useGameStore((state) => state.meteorShower);
  const updateMeteorShower = useGameStore((state) => state.updateMeteorShower);
  const playerPosition = useGameStore((state) => state.playerPosition);
  const chunks = useGameStore((state) => state.chunks);
  const setChunk = useGameStore((state) => state.setChunk);
  const isPlaying = useGameStore((state) => state.isPlaying);
  const currentCatastrophe = useGameStore((state) => state.currentCatastrophe);
  const switchToNextCatastrophe = useGameStore((state) => state.switchToNextCatastrophe);
  const updateSandstorm = useGameStore((state) => state.updateSandstorm);

  const { scene } = useThree();
  const phaseTimer = useRef(0);
  const spawnTimer = useRef(0);
  const originalFogColor = useRef<THREE.Color | null>(null);

  // Meteor instance refs
  const meteorInstanceRef = useRef<THREE.InstancedMesh>(null);
  const glowInstanceRef = useRef<THREE.InstancedMesh>(null);
  const streakInstanceRef = useRef<THREE.InstancedMesh>(null);
  const explosionInstanceRef = useRef<THREE.InstancedMesh>(null);

  // Trail points ref
  const trailRef = useRef<THREE.Points>(null);

  // Meteor data stored in refs (mutable, not rendered directly)
  const meteorsData = useRef<MeteorData[]>([]);
  const explosionsData = useRef<ExplosionData[]>([]);

  // Track render state with useState to trigger re-renders when needed
  const [, setRenderTrigger] = useState(0);

  // Create geometries
  const meteorGeometry = useMemo(() => new THREE.SphereGeometry(METEOR_SIZE, 8, 8), []);
  const glowGeometry = useMemo(() => new THREE.SphereGeometry(METEOR_SIZE * 2, 8, 8), []);
  const streakGeometry = useMemo(() => new THREE.CylinderGeometry(0.3, 1.2, 1, 6), []);
  const explosionGeometry = useMemo(() => new THREE.SphereGeometry(1, 16, 16), []);

  // Initialize meteor and explosion data
  useEffect(() => {
    if (meteorsData.current.length === 0) {
      for (let i = 0; i < MAX_METEORS; i++) {
        meteorsData.current.push({
          position: new THREE.Vector3(0, -100, 0),
          velocity: new THREE.Vector3(0, 0, 0),
          active: false,
        });
      }
    }
    if (explosionsData.current.length === 0) {
      for (let i = 0; i < MAX_EXPLOSIONS; i++) {
        explosionsData.current.push({
          position: new THREE.Vector3(0, -100, 0),
          time: 0,
          active: false,
        });
      }
    }
  }, []);

  // Get block at world position
  const getBlockAt = (worldX: number, worldY: number, worldZ: number): BlockType => {
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) return BlockType.AIR;

    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    const key = chunkPositionToKey({ x: chunkX, z: chunkZ });

    const chunk = chunks.get(key);
    if (!chunk) return BlockType.AIR;

    const localX = ((Math.floor(worldX) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((Math.floor(worldZ) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localY = Math.floor(worldY);

    return getBlockFromChunk(chunk.data, localX, localY, localZ);
  };

  // Find ground level at XZ position
  const findGroundLevel = (x: number, z: number): number => {
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      const block = getBlockAt(x, y, z);
      if (block !== BlockType.AIR) {
        return y + 1;
      }
    }
    return 0;
  };

  // Create crater at impact point
  const createCrater = (impactX: number, impactY: number, impactZ: number) => {
    const affectedChunks = new Map<string, { data: Uint8Array; position: { x: number; z: number }; isDirty: boolean }>();

    for (let dy = -CRATER_DEPTH; dy <= CRATER_RADIUS; dy++) {
      for (let dx = -CRATER_RADIUS; dx <= CRATER_RADIUS; dx++) {
        for (let dz = -CRATER_RADIUS; dz <= CRATER_RADIUS; dz++) {
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (distance <= CRATER_RADIUS) {
            const worldX = Math.floor(impactX) + dx;
            const worldY = Math.floor(impactY) + dy;
            const worldZ = Math.floor(impactZ) + dz;

            if (worldY < 1 || worldY >= CHUNK_HEIGHT) continue;

            const chunkX = Math.floor(worldX / CHUNK_SIZE);
            const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
            const key = chunkPositionToKey({ x: chunkX, z: chunkZ });

            let chunk = affectedChunks.get(key);
            if (!chunk) {
              const originalChunk = chunks.get(key);
              if (!originalChunk) continue;
              chunk = {
                data: new Uint8Array(originalChunk.data),
                position: originalChunk.position,
                isDirty: true,
              };
              affectedChunks.set(key, chunk);
            }

            const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

            const block = getBlockFromChunk(chunk.data, localX, worldY, localZ);
            if (block !== BlockType.AIR) {
              setBlockInChunk(chunk.data, localX, worldY, localZ, BlockType.AIR);
            }
          }
        }
      }
    }

    affectedChunks.forEach((chunk, key) => {
      const [x, z] = key.split(',').map(Number);
      setChunk({ x, z }, chunk);
    });
  };

  // Spawn a new meteor
  const spawnMeteor = () => {
    const inactiveMeteor = meteorsData.current.find(m => !m.active);
    if (!inactiveMeteor) return;

    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * METEOR_SPAWN_RADIUS;
    const spawnX = playerPosition[0] + Math.cos(angle) * radius;
    const spawnZ = playerPosition[2] + Math.sin(angle) * radius;

    const driftAngle = Math.random() * Math.PI * 2;
    const driftSpeed = 2 + Math.random() * 3;

    inactiveMeteor.position.set(spawnX, METEOR_SPAWN_HEIGHT, spawnZ);
    inactiveMeteor.velocity.set(
      Math.cos(driftAngle) * driftSpeed,
      -METEOR_SPEED,
      Math.sin(driftAngle) * driftSpeed
    );
    inactiveMeteor.active = true;

    updateMeteorShower({ meteorsSpawned: meteorShower.meteorsSpawned + 1 });
  };

  // Spawn an explosion
  const spawnExplosion = (x: number, y: number, z: number) => {
    const inactiveExplosion = explosionsData.current.find(e => !e.active);
    if (!inactiveExplosion) return;

    inactiveExplosion.position.set(x, y, z);
    inactiveExplosion.time = 0;
    inactiveExplosion.active = true;
  };

  // Dummy matrix for inactive instances
  const dummyMatrix = useMemo(() => {
    const matrix = new THREE.Matrix4();
    matrix.makeScale(0, 0, 0);
    return matrix;
  }, []);

  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempMatrix2 = useMemo(() => new THREE.Matrix4(), []);
  const tempPosition = useMemo(() => new THREE.Vector3(), []);
  const tempScale = useMemo(() => new THREE.Vector3(), []);
  const tempQuat = useMemo(() => new THREE.Quaternion(), []);
  const upVec = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame((_, delta) => {
    if (!isPlaying) return;

    if (currentCatastrophe !== 'meteor_shower') {
      if (originalFogColor.current && scene.fog instanceof THREE.Fog) {
        scene.fog.color.copy(originalFogColor.current);
        originalFogColor.current = null;
      }
      return;
    }

    const { phase, countdown } = meteorShower;

    switch (phase) {
      case 'countdown': {
        const newCountdown = countdown - delta;
        if (newCountdown <= 0) {
          updateMeteorShower({
            phase: 'darkening',
            countdown: 0,
            intensity: 0,
            meteorsSpawned: 0,
          });
          phaseTimer.current = 0;

          // Reset all meteors and explosions
          meteorsData.current.forEach(m => { m.active = false; });
          explosionsData.current.forEach(e => { e.active = false; });

          if (scene.fog instanceof THREE.Fog) {
            originalFogColor.current = scene.fog.color.clone();
          }
        } else {
          updateMeteorShower({ countdown: newCountdown });
        }
        break;
      }

      case 'darkening': {
        phaseTimer.current += delta;
        const progress = Math.min(phaseTimer.current / DARKENING_DURATION, 1);
        updateMeteorShower({ intensity: progress });

        if (progress >= 1) {
          updateMeteorShower({ phase: 'active', intensity: 1 });
          phaseTimer.current = 0;
          spawnTimer.current = 0;
        }
        break;
      }

      case 'active': {
        phaseTimer.current += delta;
        spawnTimer.current += delta;

        const spawnInterval = 1 / METEOR_SPAWN_RATE;
        while (spawnTimer.current >= spawnInterval) {
          spawnMeteor();
          spawnTimer.current -= spawnInterval;
        }

        if (phaseTimer.current >= ACTIVE_DURATION) {
          updateMeteorShower({ phase: 'clearing' });
          phaseTimer.current = 0;
        }
        break;
      }

      case 'clearing': {
        phaseTimer.current += delta;
        const progress = Math.min(phaseTimer.current / CLEARING_DURATION, 1);
        updateMeteorShower({ intensity: 1 - progress });

        if (progress >= 1) {
          updateMeteorShower({
            phase: 'countdown',
            countdown: METEOR_SHOWER_COUNTDOWN,
            intensity: 0,
            meteorsSpawned: 0,
          });
          phaseTimer.current = 0;

          meteorsData.current.forEach(m => { m.active = false; });
          explosionsData.current.forEach(e => { e.active = false; });

          if (originalFogColor.current && scene.fog instanceof THREE.Fog) {
            scene.fog.color.copy(originalFogColor.current);
            originalFogColor.current = null;
          }

          switchToNextCatastrophe();
          updateSandstorm({
            phase: 'countdown',
            countdown: SANDSTORM_COUNTDOWN,
          });
        }
        break;
      }
    }

    // Update fog color
    if (scene.fog instanceof THREE.Fog && originalFogColor.current) {
      const darkColor = new THREE.Color(0x1a1a2e);
      scene.fog.color.copy(originalFogColor.current).lerp(darkColor, meteorShower.intensity * 0.7);
    }

    // Update meteors
    for (let i = 0; i < meteorsData.current.length; i++) {
      const meteor = meteorsData.current[i];
      if (!meteor.active) continue;

      // Move meteor
      meteor.position.add(meteor.velocity.clone().multiplyScalar(delta));

      // Check for ground collision
      const groundY = findGroundLevel(meteor.position.x, meteor.position.z);
      if (meteor.position.y <= groundY + 1) {
        meteor.active = false;
        // Temporarily disabled: createCrater(meteor.position.x, groundY, meteor.position.z);
        spawnExplosion(meteor.position.x, groundY + 1, meteor.position.z);
      }

      // Deactivate if too low
      if (meteor.position.y < -10) {
        meteor.active = false;
      }
    }

    // Update instance meshes
    if (meteorInstanceRef.current && glowInstanceRef.current && streakInstanceRef.current) {
      for (let i = 0; i < MAX_METEORS; i++) {
        const meteor = meteorsData.current[i];
        if (meteor.active) {
          tempMatrix.makeTranslation(meteor.position.x, meteor.position.y, meteor.position.z);

          // Streak: tapered cylinder aligned with velocity direction
          const vel = meteor.velocity;
          const speed = vel.length();
          const streakLen = speed * STREAK_LENGTH_FACTOR;
          const dirX = vel.x / speed, dirY = vel.y / speed, dirZ = vel.z / speed;
          tempPosition.set(dirX, dirY, dirZ);
          tempQuat.setFromUnitVectors(upVec, tempPosition);
          tempPosition.set(
            meteor.position.x + dirX * streakLen * 0.5,
            meteor.position.y + dirY * streakLen * 0.5,
            meteor.position.z + dirZ * streakLen * 0.5
          );
          tempScale.set(1, streakLen, 1);
          tempMatrix2.compose(tempPosition, tempQuat, tempScale);
          streakInstanceRef.current.setMatrixAt(i, tempMatrix2);
        } else {
          tempMatrix.copy(dummyMatrix);
          streakInstanceRef.current.setMatrixAt(i, dummyMatrix);
        }
        meteorInstanceRef.current.setMatrixAt(i, tempMatrix);
        glowInstanceRef.current.setMatrixAt(i, tempMatrix);
      }
      meteorInstanceRef.current.instanceMatrix.needsUpdate = true;
      glowInstanceRef.current.instanceMatrix.needsUpdate = true;
      streakInstanceRef.current.instanceMatrix.needsUpdate = true;
    }

    // Update explosions
    if (explosionInstanceRef.current) {
      for (let i = 0; i < MAX_EXPLOSIONS; i++) {
        const explosion = explosionsData.current[i];
        if (explosion.active) {
          explosion.time += delta;
          const scale = 1 + explosion.time * 8;

          if (explosion.time > 0.5) {
            explosion.active = false;
            tempMatrix.copy(dummyMatrix);
          } else {
            tempMatrix.makeTranslation(explosion.position.x, explosion.position.y, explosion.position.z);
            tempMatrix.scale(tempPosition.set(scale, scale, scale));
          }
        } else {
          tempMatrix.copy(dummyMatrix);
        }
        explosionInstanceRef.current.setMatrixAt(i, tempMatrix);
      }
      explosionInstanceRef.current.instanceMatrix.needsUpdate = true;
    }

    // Update trail positions (velocity-based projection behind each meteor)
    if (trailRef.current) {
      const positions = trailPositionsBuffer;
      let idx = 0;
      for (let i = 0; i < MAX_METEORS; i++) {
        const meteor = meteorsData.current[i];
        for (let j = 0; j < TRAIL_SEGMENTS; j++) {
          if (meteor.active) {
            const t = (j + 1) * TRAIL_TIME_STEP;
            positions[idx++] = meteor.position.x - meteor.velocity.x * t;
            positions[idx++] = meteor.position.y - meteor.velocity.y * t;
            positions[idx++] = meteor.position.z - meteor.velocity.z * t;
          } else {
            positions[idx++] = 0;
            positions[idx++] = -1000;
            positions[idx++] = 0;
          }
        }
      }
      const posAttr = trailRef.current.geometry.attributes.position as THREE.BufferAttribute;
      posAttr.needsUpdate = true;
    }

    // Trigger re-render periodically for visibility changes
    setRenderTrigger(t => t + 1);
  });

  const isVisible = currentCatastrophe === 'meteor_shower' && meteorShower.phase !== 'countdown';

  if (!isVisible) return null;

  return (
    <group>
      {/* Meteor instances - frustumCulled=false because instances are positioned far from origin */}
      <instancedMesh ref={meteorInstanceRef} args={[meteorGeometry, meteorMaterial, MAX_METEORS]} frustumCulled={false} />
      <instancedMesh ref={glowInstanceRef} args={[glowGeometry, meteorGlowMaterial, MAX_METEORS]} frustumCulled={false} />

      {/* Streak trails (tapered cylinders behind each meteor) */}
      <instancedMesh ref={streakInstanceRef} args={[streakGeometry, streakMaterial, MAX_METEORS]} frustumCulled={false} />

      {/* Explosion instances */}
      <instancedMesh ref={explosionInstanceRef} args={[explosionGeometry, undefined, MAX_EXPLOSIONS]} frustumCulled={false}>
        <meshBasicMaterial color={0xff8800} transparent opacity={0.7} fog={false} />
      </instancedMesh>

      {/* Trail particles (scattered embers behind each meteor) */}
      <points ref={trailRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[trailPositionsBuffer, 3]}
          />
        </bufferGeometry>
        <pointsMaterial color={0xff6600} size={5.0} transparent opacity={0.7} sizeAttenuation fog={false} />
      </points>

      {/* Dark sky overlay */}
      {meteorShower.intensity > 0 && (
        <mesh position={[playerPosition[0], playerPosition[1] + 50, playerPosition[2]]}>
          <sphereGeometry args={[200, 16, 16]} />
          <meshBasicMaterial
            color={0x000011}
            transparent
            opacity={meteorShower.intensity * 0.3}
            side={THREE.BackSide}
          />
        </mesh>
      )}
    </group>
  );
}
