'use client';

import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '@/stores';
import { BlockType, CHUNK_SIZE, CHUNK_HEIGHT, setBlockInChunk } from '@/types';

// Missile configuration
const LAUNCH_DURATION = 2; // Seconds to reach peak
const FLIGHT_DURATION = 3; // Seconds to reach target
const PEAK_HEIGHT = 100; // Max height during flight
const EXPLOSION_RADIUS = 15; // Blocks destroyed in radius
const CRATER_DEPTH = 10; // How deep the crater goes

export function NuclearMissileSystem() {
  const missileState = useGameStore((state) => state.missileState);
  const missilePosition = useGameStore((state) => state.missilePosition);
  const missileTarget = useGameStore((state) => state.missileTarget);
  const updateMissilePosition = useGameStore((state) => state.updateMissilePosition);
  const resetMissile = useGameStore((state) => state.resetMissile);
  const setChunk = useGameStore((state) => state.setChunk);
  const chunks = useGameStore((state) => state.chunks);

  const timeRef = useRef(0);
  const initialPosition = useRef<[number, number, number]>([15, 30, 10]);
  const explosionParticles = useRef<THREE.Points | null>(null);
  const fireworksRef = useRef<Array<{ position: THREE.Vector3; velocity: THREE.Vector3; life: number }>>([]);

  // Store initial position only when first launching (not when transitioning to flying)
  const previousState = useRef<typeof missileState>('idle');
  useEffect(() => {
    if (missileState === 'launching' && previousState.current === 'idle') {
      initialPosition.current = [...missilePosition];
      timeRef.current = 0;
    }
    previousState.current = missileState;
  }, [missileState, missilePosition]);

  // Update missile position during flight
  useFrame((_, delta) => {
    if (missileState === 'launching' || missileState === 'flying') {
      timeRef.current += delta;

      if (missileState === 'launching') {
        // Launch phase: go straight up
        const progress = Math.min(timeRef.current / LAUNCH_DURATION, 1);
        const easedProgress = 1 - Math.pow(1 - progress, 3); // Ease out cubic

        const newY = initialPosition.current[1] + (PEAK_HEIGHT - initialPosition.current[1]) * easedProgress;
        updateMissilePosition([initialPosition.current[0], newY, initialPosition.current[2]]);

        // Switch to flying when launch complete
        if (progress >= 1) {
          useGameStore.setState({ missileState: 'flying' });
          timeRef.current = 0;
        }
      } else if (missileState === 'flying') {
        // Flight phase: arc toward target
        const progress = Math.min(timeRef.current / FLIGHT_DURATION, 1);
        const easedProgress = progress * progress; // Ease in quadratic

        const startX = initialPosition.current[0];
        const startZ = initialPosition.current[2];
        const [targetX, targetY, targetZ] = missileTarget;

        // Parabolic arc
        const x = startX + (targetX - startX) * easedProgress;
        const z = startZ + (targetZ - startZ) * easedProgress;
        const arcHeight = PEAK_HEIGHT * (1 - Math.pow(2 * progress - 1, 2));
        const y = targetY + arcHeight;

        updateMissilePosition([x, y, z]);

        // Explode on impact
        if (progress >= 1) {
          explode();
        }
      }
    }

    // Update fireworks
    if (missileState === 'exploded' && fireworksRef.current.length > 0) {
      fireworksRef.current = fireworksRef.current
        .map((fw) => ({
          ...fw,
          position: fw.position.clone().add(fw.velocity.clone().multiplyScalar(delta)),
          velocity: fw.velocity.clone().add(new THREE.Vector3(0, -9.8 * delta, 0)), // Gravity
          life: fw.life - delta,
        }))
        .filter((fw) => fw.life > 0);

      // Reset after 5 seconds
      if (timeRef.current > 5) {
        resetMissile();
        fireworksRef.current = [];
        timeRef.current = 0;
      }

      timeRef.current += delta;
    }
  });

  const explode = () => {
    useGameStore.setState({ missileState: 'exploded' });

    // Create crater and destroy blocks
    const [cx, cy, cz] = missileTarget;
    const chunksToUpdate = new Map<string, { data: Uint8Array; position: { x: number; z: number }; isDirty: boolean }>();

    // Destroy blocks in spherical radius
    for (let dx = -EXPLOSION_RADIUS; dx <= EXPLOSION_RADIUS; dx++) {
      for (let dy = -CRATER_DEPTH; dy <= EXPLOSION_RADIUS; dy++) {
        for (let dz = -EXPLOSION_RADIUS; dz <= EXPLOSION_RADIUS; dz++) {
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (distance > EXPLOSION_RADIUS) continue;

          const worldX = Math.floor(cx + dx);
          const worldY = Math.floor(cy + dy);
          const worldZ = Math.floor(cz + dz);

          if (worldY < 0 || worldY >= CHUNK_HEIGHT) continue;

          const chunkX = Math.floor(worldX / CHUNK_SIZE);
          const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
          const key = `${chunkX},${chunkZ}`;

          // Get or create chunk
          let chunk = chunksToUpdate.get(key);
          if (!chunk) {
            const existingChunk = chunks.get(key);
            if (existingChunk) {
              chunk = {
                data: new Uint8Array(existingChunk.data),
                position: existingChunk.position,
                isDirty: true,
              };
            } else {
              chunk = {
                data: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT),
                position: { x: chunkX, z: chunkZ },
                isDirty: true,
              };
            }
            chunksToUpdate.set(key, chunk);
          }

          const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          setBlockInChunk(chunk.data, localX, worldY, localZ, BlockType.AIR);
        }
      }
    }

    // Apply chunk updates
    chunksToUpdate.forEach((chunk, key) => {
      setChunk(chunk.position, chunk);
    });

    // Spawn fireworks particles
    for (let i = 0; i < 100; i++) {
      const angle = Math.random() * Math.PI * 2;
      const elevation = Math.random() * Math.PI * 0.5;
      const speed = 10 + Math.random() * 10;

      fireworksRef.current.push({
        position: new THREE.Vector3(cx, cy, cz),
        velocity: new THREE.Vector3(
          Math.cos(angle) * Math.cos(elevation) * speed,
          Math.sin(elevation) * speed,
          Math.sin(angle) * Math.cos(elevation) * speed
        ),
        life: 2 + Math.random() * 2,
      });
    }

    timeRef.current = 0;
  };

  // Missile geometry (cylindrical body with conical tip)
  const missileGeometry = useMemo(() => {
    const group = new THREE.Group();

    // Body (cylinder)
    const bodyGeometry = new THREE.CylinderGeometry(0.5, 0.5, 6, 16);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#888888' });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);

    // Tip (cone)
    const tipGeometry = new THREE.ConeGeometry(0.5, 2, 16);
    const tipMaterial = new THREE.MeshStandardMaterial({ color: '#cc0000' });
    const tip = new THREE.Mesh(tipGeometry, tipMaterial);
    tip.position.y = 4;
    group.add(tip);

    // Fins
    const finGeometry = new THREE.BoxGeometry(0.1, 2, 1);
    const finMaterial = new THREE.MeshStandardMaterial({ color: '#666666' });

    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(finGeometry, finMaterial);
      const angle = (i * Math.PI) / 2;
      fin.position.x = Math.cos(angle) * 0.5;
      fin.position.z = Math.sin(angle) * 0.5;
      fin.position.y = -2;
      fin.rotation.y = angle;
      group.add(fin);
    }

    return group;
  }, []);

  if (missileState === 'idle') {
    // Show missile on launch pad
    return (
      <group position={missilePosition}>
        <primitive object={missileGeometry.clone()} />
        <pointLight color="#ffaa00" intensity={2} distance={10} />
      </group>
    );
  }

  if (missileState === 'launching' || missileState === 'flying') {
    // Calculate velocity based on direction of travel
    let velocity: THREE.Vector3;

    if (missileState === 'launching') {
      // During launch, missile points straight up
      velocity = new THREE.Vector3(0, 1, 0);
    } else {
      // During flight, calculate tangent to the parabolic arc
      const progress = Math.min(timeRef.current / FLIGHT_DURATION, 1);
      const startX = initialPosition.current[0];
      const startZ = initialPosition.current[2];
      const [targetX, targetY, targetZ] = missileTarget;

      // Velocity components (derivatives of position)
      const vx = (targetX - startX) / FLIGHT_DURATION;
      const vz = (targetZ - startZ) / FLIGHT_DURATION;
      // Parabolic arc: y = targetY + PEAK_HEIGHT * (1 - (2*progress - 1)^2)
      // dy/dt = -4 * PEAK_HEIGHT * (2*progress - 1) / FLIGHT_DURATION
      const vy = -4 * PEAK_HEIGHT * (2 * progress - 1) / FLIGHT_DURATION;

      velocity = new THREE.Vector3(vx, vy, vz).normalize();
    }

    // Calculate rotation to face direction of travel
    const rotation = new THREE.Euler(
      -Math.atan2(velocity.y, Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z)),
      Math.atan2(velocity.x, velocity.z),
      0
    );

    return (
      <group position={missilePosition} rotation={rotation}>
        <primitive object={missileGeometry.clone()} />
        <pointLight color="#ff6600" intensity={5} distance={20} />

        {/* Exhaust trail */}
        <mesh position={[0, -4, 0]}>
          <coneGeometry args={[0.8, 3, 16]} />
          <meshStandardMaterial
            color="#ff4400"
            emissive="#ff4400"
            emissiveIntensity={2}
            transparent
            opacity={0.7}
          />
        </mesh>
      </group>
    );
  }

  if (missileState === 'exploded') {
    // Render fireworks particles
    return (
      <group>
        {fireworksRef.current.map((fw, i) => (
          <mesh key={i} position={fw.position}>
            <sphereGeometry args={[0.3, 8, 8]} />
            <meshStandardMaterial
              color={
                i % 3 === 0 ? '#ff0000' :
                i % 3 === 1 ? '#ffff00' :
                '#ff9900'
              }
              emissive={
                i % 3 === 0 ? '#ff0000' :
                i % 3 === 1 ? '#ffff00' :
                '#ff9900'
              }
              emissiveIntensity={2}
            />
          </mesh>
        ))}

        {/* Explosion flash at target */}
        {timeRef.current < 0.5 && (
          <pointLight
            position={missileTarget}
            color="#ffff00"
            intensity={500}
            distance={100}
          />
        )}
      </group>
    );
  }

  return null;
}
