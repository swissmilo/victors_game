'use client';

import { RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { useMemo } from 'react';
import { fbm } from '@/lib/noise';

const GROUND_SIZE = 64;
const GROUND_SEGMENTS = 64;

export function Ground() {
  // Create a simple procedural terrain mesh
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(
      GROUND_SIZE,
      GROUND_SIZE,
      GROUND_SEGMENTS,
      GROUND_SEGMENTS
    );
    
    // Apply height map
    const positions = geo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const height = fbm(x + GROUND_SIZE / 2, y + GROUND_SIZE / 2, 4, 0.5, 0.05) * 10;
      positions.setZ(i, height);
    }
    
    geo.computeVertexNormals();
    geo.rotateX(-Math.PI / 2);
    
    return geo;
  }, []);

  return (
    <RigidBody type="fixed" colliders="trimesh">
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial 
          color="#4a7c4e" 
          roughness={0.8}
          metalness={0.1}
        />
      </mesh>
    </RigidBody>
  );
}
