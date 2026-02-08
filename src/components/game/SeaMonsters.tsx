'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, BASE_WATER_LEVEL, MAX_WATER_LEVEL } from '@/stores';

// Number of each monster type to spawn
const MONSTER_COUNT = 3;
// How far from player monsters spawn
const SPAWN_RADIUS_MIN = 40;
const SPAWN_RADIUS_MAX = 80;

// ============================================================
// Monster Model Builders
// ============================================================

function addBox(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  material: THREE.Material
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

/**
 * Long Neck Monster - flesh-colored plesiosaur with creepy human face
 * Partially submerged bulky body with a long curved neck and smiling human head
 */
function buildLongNeckMonster(): THREE.Group {
  const group = new THREE.Group();

  const fleshColor = new THREE.Color(0xd4a088);
  const darkFlesh = new THREE.Color(0xb8806a);
  const darkColor = new THREE.Color(0x2a1a0a);
  const teethColor = new THREE.Color(0xf0e8d8);
  const mouthColor = new THREE.Color(0x8b4040);

  const fleshMat = new THREE.MeshStandardMaterial({ color: fleshColor });
  const darkFleshMat = new THREE.MeshStandardMaterial({ color: darkFlesh });
  const darkMat = new THREE.MeshStandardMaterial({ color: darkColor });
  const teethMat = new THREE.MeshStandardMaterial({ color: teethColor });
  const mouthMat = new THREE.MeshStandardMaterial({ color: mouthColor });

  // Bulky body (partially submerged) - big rectangular mass
  addBox(group, 0, 0, 0, 14, 10, 12, fleshMat);
  // Body detail strips
  addBox(group, 0, 2, 0, 14.2, 1.5, 12.2, darkFleshMat);
  addBox(group, 0, -1, 0, 14.2, 1.5, 12.2, darkFleshMat);

  // Neck base (thick)
  addBox(group, 0, 7, 0, 6, 6, 5, fleshMat);

  // Neck segments (curving upward) - 8 segments getting thinner
  const neckSegments = 8;
  for (let i = 0; i < neckSegments; i++) {
    const t = i / neckSegments;
    const neckX = Math.sin(t * 0.4) * 3;
    const neckY = 10 + i * 4;
    const thickness = 5 - t * 1.5;
    addBox(group, neckX, neckY, 0, thickness, 4.5, thickness,
      i % 2 === 0 ? fleshMat : darkFleshMat);
  }

  // Head - large rectangular human-like head
  const headY = 10 + neckSegments * 4;
  addBox(group, 0, headY, 0, 10, 12, 9, fleshMat);

  // Jaw / chin
  addBox(group, 0, headY - 5, 1, 9, 3, 7, darkFleshMat);

  // Eye sockets (dark recesses)
  addBox(group, -2.5, headY + 2, 4.5, 3, 2, 1.5, darkMat);
  addBox(group, 2.5, headY + 2, 4.5, 3, 2, 1.5, darkMat);

  // Nose bump
  addBox(group, 0, headY, 4.8, 2, 2, 1, darkFleshMat);

  // Mouth - wide creepy smile
  addBox(group, 0, headY - 2.5, 4.5, 8, 1.5, 1, mouthMat);

  // Teeth - top row
  for (let i = -3; i <= 3; i++) {
    addBox(group, i * 1, headY - 1.8, 4.8, 0.8, 1.2, 0.5, teethMat);
  }
  // Teeth - bottom row
  for (let i = -3; i <= 3; i++) {
    addBox(group, i * 1, headY - 3.2, 4.8, 0.8, 1.2, 0.5, teethMat);
  }

  // Brow ridge
  addBox(group, 0, headY + 4, 4, 10, 1.5, 2, darkFleshMat);

  return group;
}

/**
 * Starfish Monster - 5-pointed star with toothed circular mouth
 * Dark olive/green with red interior mouth and radiating teeth
 */
function buildStarfishMonster(): THREE.Group {
  const group = new THREE.Group();

  const starColor = new THREE.Color(0x5a6b3a);
  const darkStar = new THREE.Color(0x3a4a2a);
  const mouthColor = new THREE.Color(0x8b2020);
  const innerMouth = new THREE.Color(0x601010);
  const teethColor = new THREE.Color(0xe8ddd0);

  const starMat = new THREE.MeshStandardMaterial({ color: starColor });
  const darkStarMat = new THREE.MeshStandardMaterial({ color: darkStar });
  const mouthMat = new THREE.MeshStandardMaterial({ color: mouthColor });
  const innerMouthMat = new THREE.MeshStandardMaterial({ color: innerMouth });
  const teethMat = new THREE.MeshStandardMaterial({ color: teethColor });

  // Central body - round-ish disc made of stacked boxes
  addBox(group, 0, 0, 0, 10, 4, 10, starMat);
  addBox(group, 0, 0, 0, 12, 3, 12, darkStarMat);

  // Mouth - circular opening in center (approximated with boxes)
  addBox(group, 0, 2.5, 0, 7, 1, 7, mouthMat);
  addBox(group, 0, 1, 0, 5, 2, 5, innerMouthMat);

  // Teeth radiating inward around the mouth
  const toothCount = 12;
  for (let i = 0; i < toothCount; i++) {
    const angle = (i / toothCount) * Math.PI * 2;
    const tx = Math.cos(angle) * 3.5;
    const tz = Math.sin(angle) * 3.5;
    addBox(group, tx, 2.5, tz, 1, 2, 1, teethMat);
  }

  // 5 arms extending outward
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Each arm: 3 segments getting thinner
    for (let seg = 0; seg < 4; seg++) {
      const dist = 8 + seg * 6;
      const width = 6 - seg * 1.2;
      const height = 3.5 - seg * 0.5;
      const ax = cos * dist;
      const az = sin * dist;
      const ay = -seg * 0.5; // Arms droop slightly
      addBox(group, ax, ay, az, width, height, width,
        seg % 2 === 0 ? starMat : darkStarMat);
    }

    // Arm tip - pointed
    const tipDist = 8 + 4 * 6;
    addBox(group, cos * tipDist, -2.5, sin * tipDist, 2, 2, 2, darkStarMat);
  }

  // Bumps/texture on arms
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let b = 0; b < 3; b++) {
      const dist = 10 + b * 7;
      addBox(group, cos * dist, 2.5, sin * dist, 1.5, 1.5, 1.5, darkStarMat);
    }
  }

  return group;
}

/**
 * Void Monster - gray oval body with black void center and skeletal arms
 * Looks like a walking portal/mirror with clawed hands
 */
function buildVoidMonster(): THREE.Group {
  const group = new THREE.Group();

  const frameColor = new THREE.Color(0xaaaaaa);
  const darkFrame = new THREE.Color(0x888888);
  const voidColor = new THREE.Color(0x050505);
  const boneColor = new THREE.Color(0xcccccc);
  const clawColor = new THREE.Color(0x999999);

  const frameMat = new THREE.MeshStandardMaterial({ color: frameColor });
  const darkFrameMat = new THREE.MeshStandardMaterial({ color: darkFrame });
  const voidMat = new THREE.MeshStandardMaterial({
    color: voidColor,
    emissive: new THREE.Color(0x000000),
    roughness: 1,
  });
  const boneMat = new THREE.MeshStandardMaterial({ color: boneColor });
  const clawMat = new THREE.MeshStandardMaterial({ color: clawColor });

  // Oval frame - built from overlapping boxes to approximate oval
  // Outer frame
  addBox(group, 0, 10, 0, 16, 22, 4, frameMat);
  addBox(group, 0, 10, 0, 18, 18, 3.5, frameMat);
  addBox(group, 0, 10, 0, 14, 24, 3.5, frameMat);

  // Top arch
  addBox(group, -4, 22, 0, 4, 3, 4, darkFrameMat);
  addBox(group, 4, 22, 0, 4, 3, 4, darkFrameMat);
  addBox(group, 0, 23, 0, 10, 2, 4, darkFrameMat);

  // Bottom arch
  addBox(group, -4, -2, 0, 4, 3, 4, darkFrameMat);
  addBox(group, 4, -2, 0, 4, 3, 4, darkFrameMat);
  addBox(group, 0, -3, 0, 10, 2, 4, darkFrameMat);

  // The void - pitch black interior
  addBox(group, 0, 10, 0.5, 12, 18, 2, voidMat);
  addBox(group, 0, 10, 0.5, 14, 14, 2, voidMat);

  // Left arm - jointed skeletal arm
  // Upper arm
  addBox(group, -12, 14, 0, 3, 10, 3, boneMat);
  // Elbow
  addBox(group, -14, 8, 0, 4, 4, 4, darkFrameMat);
  // Forearm - angled down
  addBox(group, -16, 2, 0, 3, 10, 3, boneMat);
  // Wrist
  addBox(group, -17, -4, 0, 3.5, 3, 3.5, darkFrameMat);
  // Hand/palm
  addBox(group, -17, -7, 0, 4, 3, 4, boneMat);
  // Fingers/claws (5 fingers)
  for (let f = -2; f <= 2; f++) {
    addBox(group, -17 + f * 0.8, -10, 0, 0.8, 4, 0.8, clawMat);
    addBox(group, -17 + f * 0.8, -12.5, 0, 0.6, 1.5, 0.6, darkFrameMat); // nail
  }

  // Right arm - mirrored
  addBox(group, 12, 14, 0, 3, 10, 3, boneMat);
  addBox(group, 14, 8, 0, 4, 4, 4, darkFrameMat);
  addBox(group, 16, 2, 0, 3, 10, 3, boneMat);
  addBox(group, 17, -4, 0, 3.5, 3, 3.5, darkFrameMat);
  addBox(group, 17, -7, 0, 4, 3, 4, boneMat);
  for (let f = -2; f <= 2; f++) {
    addBox(group, 17 + f * 0.8, -10, 0, 0.8, 4, 0.8, clawMat);
    addBox(group, 17 + f * 0.8, -12.5, 0, 0.6, 1.5, 0.6, darkFrameMat);
  }

  return group;
}

/**
 * Giant Manta Ray Monster - dark blue/purple flat body with huge toothed mouth
 * Very wide and flat, massive gaping jaw with rows of white teeth and red gums
 */
function buildMantaRayMonster(): THREE.Group {
  const group = new THREE.Group();

  const bodyColor = new THREE.Color(0x2a2a5a);
  const darkBody = new THREE.Color(0x1a1a3a);
  const spotColor = new THREE.Color(0x3a3a6a);
  const mouthColor = new THREE.Color(0x0a0a1a);
  const gumColor = new THREE.Color(0xaa2020);
  const teethColor = new THREE.Color(0xf0f0f0);
  const eyeColor = new THREE.Color(0xcc3333);

  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor });
  const darkBodyMat = new THREE.MeshStandardMaterial({ color: darkBody });
  const spotMat = new THREE.MeshStandardMaterial({ color: spotColor });
  const mouthMat = new THREE.MeshStandardMaterial({ color: mouthColor });
  const gumMat = new THREE.MeshStandardMaterial({ color: gumColor });
  const teethMat = new THREE.MeshStandardMaterial({ color: teethColor });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: eyeColor,
    emissive: eyeColor,
    emissiveIntensity: 0.4,
  });

  // Main body - wide flat shape
  addBox(group, 0, 0, 0, 40, 5, 25, bodyMat);
  addBox(group, 0, 1, 0, 36, 3, 28, darkBodyMat);

  // Body spots/texture
  for (let i = -3; i <= 3; i++) {
    for (let j = -2; j <= 2; j++) {
      if (Math.random() > 0.5) {
        addBox(group, i * 5, 3, j * 5, 3, 1, 3, spotMat);
      }
    }
  }

  // Wing tips - tapered
  addBox(group, -22, -1, 0, 8, 3, 18, bodyMat);
  addBox(group, 22, -1, 0, 8, 3, 18, bodyMat);
  addBox(group, -28, -2, 0, 6, 2, 12, darkBodyMat);
  addBox(group, 28, -2, 0, 6, 2, 12, darkBodyMat);
  addBox(group, -33, -3, 0, 4, 1.5, 7, darkBodyMat);
  addBox(group, 33, -3, 0, 4, 1.5, 7, darkBodyMat);

  // Upper jaw
  addBox(group, 0, 4, 15, 30, 4, 8, bodyMat);
  addBox(group, 0, 5, 18, 28, 3, 4, darkBodyMat);

  // Lower jaw
  addBox(group, 0, -4, 15, 30, 4, 8, bodyMat);
  addBox(group, 0, -5, 18, 28, 3, 4, darkBodyMat);

  // Open mouth interior
  addBox(group, 0, 0, 16, 26, 6, 10, mouthMat);

  // Gums - upper and lower
  addBox(group, 0, 3, 18, 27, 1.5, 6, gumMat);
  addBox(group, 0, -3, 18, 27, 1.5, 6, gumMat);

  // Upper teeth - row of rectangular teeth
  const teethCount = 18;
  for (let i = 0; i < teethCount; i++) {
    const tx = -13 + i * (26 / (teethCount - 1));
    addBox(group, tx, 1.5, 19, 0.8, 2.5, 1, teethMat);
  }
  // Lower teeth
  for (let i = 0; i < teethCount; i++) {
    const tx = -13 + i * (26 / (teethCount - 1));
    addBox(group, tx, -1.5, 19, 0.8, 2.5, 1, teethMat);
  }

  // Eyes on top
  addBox(group, -8, 4.5, 8, 4, 3, 4, darkBodyMat);
  addBox(group, 8, 4.5, 8, 4, 3, 4, darkBodyMat);
  addBox(group, -8, 5.5, 9, 2.5, 2, 2, eyeMat);
  addBox(group, 8, 5.5, 9, 2.5, 2, 2, eyeMat);

  // Tail
  addBox(group, 0, -1, -15, 8, 3, 8, bodyMat);
  addBox(group, 0, -2, -22, 5, 2, 6, darkBodyMat);
  addBox(group, 0, -2, -28, 3, 1.5, 5, darkBodyMat);

  return group;
}

// ============================================================
// Monster Instance Data
// ============================================================

interface MonsterInstance {
  type: 'longNeck' | 'starfish' | 'void' | 'mantaRay';
  offsetAngle: number;  // Angle around player spawn point
  distance: number;     // Distance from center
  speed: number;        // Movement speed
  bobSpeed: number;     // Vertical bob speed
  bobAmount: number;    // Vertical bob amount
  rotationSpeed: number; // Rotation speed around center
  scale: number;        // Scale factor
  heightOffset: number; // How much above/below water surface
}

function generateMonsterInstances(): MonsterInstance[] {
  const instances: MonsterInstance[] = [];
  const types: MonsterInstance['type'][] = ['longNeck', 'starfish', 'void', 'mantaRay'];

  for (let t = 0; t < types.length; t++) {
    for (let i = 0; i < MONSTER_COUNT; i++) {
      const baseAngle = (t / types.length) * Math.PI * 2 + (i / MONSTER_COUNT) * (Math.PI * 2 / types.length);
      instances.push({
        type: types[t],
        offsetAngle: baseAngle + (Math.random() - 0.5) * 0.5,
        distance: SPAWN_RADIUS_MIN + Math.random() * (SPAWN_RADIUS_MAX - SPAWN_RADIUS_MIN),
        speed: 0.3 + Math.random() * 0.4,
        bobSpeed: 0.5 + Math.random() * 0.5,
        bobAmount: 1 + Math.random() * 2,
        rotationSpeed: 0.02 + Math.random() * 0.03,
        scale: 0.8 + Math.random() * 0.4,
        heightOffset: types[t] === 'mantaRay' ? -3 :
                      types[t] === 'longNeck' ? -5 :
                      types[t] === 'starfish' ? 2 :
                      -2,
      });
    }
  }

  return instances;
}

// ============================================================
// Individual Monster Component
// ============================================================

function SeaMonster({
  instance,
  waterLevel,
  playerPosition,
  time,
  emergeFactor,
}: {
  instance: MonsterInstance;
  waterLevel: number;
  playerPosition: [number, number, number];
  time: number;
  emergeFactor: number; // 0 to 1, controls how emerged the monster is
}) {
  const meshRef = useRef<THREE.Group>(null);

  const model = useMemo(() => {
    switch (instance.type) {
      case 'longNeck': return buildLongNeckMonster();
      case 'starfish': return buildStarfishMonster();
      case 'void': return buildVoidMonster();
      case 'mantaRay': return buildMantaRayMonster();
    }
  }, [instance.type]);

  useFrame(() => {
    if (!meshRef.current) return;

    // Orbit around player position
    const angle = instance.offsetAngle + time * instance.rotationSpeed;
    const x = playerPosition[0] + Math.cos(angle) * instance.distance;
    const z = playerPosition[2] + Math.sin(angle) * instance.distance;

    // Vertical bobbing
    const bob = Math.sin(time * instance.bobSpeed) * instance.bobAmount;
    const y = waterLevel + instance.heightOffset * emergeFactor + bob;

    meshRef.current.position.set(x, y, z);
    meshRef.current.scale.setScalar(instance.scale * emergeFactor);

    // Face the direction of movement (tangent to orbit)
    const facingAngle = angle + Math.PI / 2;
    meshRef.current.rotation.y = facingAngle;
  });

  if (emergeFactor <= 0) return null;

  return (
    <group ref={meshRef}>
      <primitive object={model} />
    </group>
  );
}

// ============================================================
// Main SeaMonsters System
// ============================================================

export function SeaMonsters() {
  const tsunamiPhase = useGameStore((state) => state.tsunami.phase);
  const waterLevel = useGameStore((state) => state.tsunami.waterLevel);
  const currentCatastrophe = useGameStore((state) => state.currentCatastrophe);
  const isPlaying = useGameStore((state) => state.isPlaying);
  const playerPosition = useGameStore((state) => state.playerPosition);
  const timeRef = useRef(0);
  const emergeRef = useRef(0);

  const monsters = useMemo(() => generateMonsterInstances(), []);

  useFrame((_, delta) => {
    if (!isPlaying) return;
    if (currentCatastrophe !== 'tsunami') return;

    timeRef.current += delta;

    // Monsters emerge during rising/peak and submerge during falling
    const targetEmerge = (tsunamiPhase === 'rising' || tsunamiPhase === 'peak') ? 1 : 0;
    const emergeSpeed = targetEmerge > 0 ? 0.3 : 0.8; // Slower emerge, faster submerge
    emergeRef.current += (targetEmerge - emergeRef.current) * emergeSpeed * delta;
    emergeRef.current = Math.max(0, Math.min(1, emergeRef.current));
  });

  // Only render during active tsunami
  const isActive = currentCatastrophe === 'tsunami' && tsunamiPhase !== 'countdown';
  if (!isActive) return null;

  return (
    <>
      {monsters.map((instance, i) => (
        <SeaMonster
          key={i}
          instance={instance}
          waterLevel={waterLevel}
          playerPosition={playerPosition}
          time={timeRef.current}
          emergeFactor={emergeRef.current}
        />
      ))}
    </>
  );
}
