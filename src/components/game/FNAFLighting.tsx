'use client';

import { useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import { getTerrainHeightAt, PIZZERIA_ORIGIN, PIZZERIA_WIDTH, PIZZERIA_DEPTH } from '@/lib/worldGen';

/**
 * Interior point lights and exterior logo sign for the FNAF Pizzeria.
 */
export function FNAFLighting() {
  const ox = PIZZERIA_ORIGIN.x;
  const oz = PIZZERIA_ORIGIN.z;

  const { floorY, ceilingY, wallHeight } = useMemo(() => {
    const terrainY = getTerrainHeightAt(
      ox + PIZZERIA_WIDTH / 2,
      oz + PIZZERIA_DEPTH / 2,
    );
    const fy = terrainY + 10 + 1;
    return { floorY: fy, ceilingY: fy + 5, wallHeight: 7 };
  }, [ox, oz]);

  const lights = useMemo(() => {
    return [
      // Stage - bright overhead wash
      { pos: [ox + 25, ceilingY + 1, oz + 16] as const, color: '#ffffff', intensity: 15, distance: 25 },
      // Stage - Freddy (center, warm spotlight)
      { pos: [ox + 25, ceilingY, oz + 14] as const, color: '#ffcc44', intensity: 12, distance: 20 },
      // Stage - Bonnie (left, purple spotlight)
      { pos: [ox + 17, ceilingY, oz + 14] as const, color: '#9966ff', intensity: 10, distance: 18 },
      // Stage - Chica (right, orange spotlight)
      { pos: [ox + 33, ceilingY, oz + 14] as const, color: '#ffaa22', intensity: 10, distance: 18 },

      // Dining hall - 3 ceiling lights matching MAGMA positions
      { pos: [ox + 15, ceilingY, oz + 5] as const, color: '#ff8833', intensity: 4, distance: 14 },
      { pos: [ox + 25, ceilingY, oz + 5] as const, color: '#ff8833', intensity: 4, distance: 14 },
      { pos: [ox + 35, ceilingY, oz + 5] as const, color: '#ff8833', intensity: 4, distance: 14 },

      // Kitchen ceiling
      { pos: [ox + 25, ceilingY, oz + 30] as const, color: '#ffddaa', intensity: 3, distance: 16 },
      // Kitchen oven glow (low, near MAGMA blocks at z=36)
      { pos: [ox + 30, floorY + 1, oz + 36] as const, color: '#ff4400', intensity: 2, distance: 8 },

      // Security office - cold monitor glow
      { pos: [ox + 42, floorY + 3, oz + 28] as const, color: '#4488ff', intensity: 3, distance: 12 },

      // Parts & Service - single dim light
      { pos: [ox + 8, ceilingY, oz + 30] as const, color: '#ff6633', intensity: 2, distance: 14 },

      // Entrance - warm welcoming light
      { pos: [ox + 25, ceilingY, oz + 1] as const, color: '#ffcc88', intensity: 3, distance: 12 },
    ];
  }, [ox, oz, floorY, ceilingY]);

  // Load logo texture for exterior sign
  const [logoTexture, setLogoTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load('/textures/fnaf_logo.png', (tex) => {
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      // Flip horizontally so text reads correctly from front
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.x = -1;
      tex.offset.x = 1;
      setLogoTexture(tex);
    });
    return () => { logoTexture?.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Logo sign on a pole to the right of the entrance
  const poleX = ox + PIZZERIA_WIDTH / 2 + 12; // Right of entrance
  const signY = floorY + wallHeight + 4; // Above pole top
  const signZ = oz - 4; // In front of building
  const signWidth = 12;
  const signHeight = 6;

  return (
    <group>
      {lights.map((light, i) => (
        <pointLight
          key={i}
          position={[light.pos[0], light.pos[1], light.pos[2]]}
          color={light.color}
          intensity={light.intensity}
          distance={light.distance}
          decay={2}
        />
      ))}

      {/* Exterior logo sign mounted on pole */}
      {logoTexture && (
        <mesh position={[poleX, signY, signZ]}>
          <planeGeometry args={[signWidth, signHeight]} />
          <meshBasicMaterial
            map={logoTexture}
            transparent
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}
