'use client';

import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { ChunkData, ChunkPosition, CHUNK_SIZE } from '@/types';
import { buildChunkMesh, createChunkGeometry, getColliderPositions } from '@/lib/meshBuilder';
import { getAtlasTexture } from '@/lib/textureAtlas';

interface ChunkMeshProps {
  position: ChunkPosition;
  data: ChunkData;
  showColliders?: boolean;
}

export function ChunkMesh({ position, data, showColliders = false }: ChunkMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Build mesh geometry from chunk data
  const geometry = useMemo(() => {
    const meshData = buildChunkMesh(data);
    return createChunkGeometry(meshData);
  }, [data]);
  
  // Get collider positions for physics
  const colliderPositions = useMemo(() => {
    return getColliderPositions(data);
  }, [data]);
  
  // Create material with texture atlas
  const material = useMemo(() => {
    const texture = getAtlasTexture();
    return new THREE.MeshStandardMaterial({
      map: texture,
      vertexColors: true, // Use vertex colors as tint
      roughness: 0.9,
      metalness: 0.0,
    });
  }, []);
  
  // World offset for this chunk
  const worldX = position.x * CHUNK_SIZE;
  const worldZ = position.z * CHUNK_SIZE;
  
  // Cleanup geometry on unmount
  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);
  
  return (
    <group position={[worldX, 0, worldZ]}>
      {/* Rendered mesh */}
      <mesh ref={meshRef} geometry={geometry} material={material} castShadow receiveShadow />
      
      {/* Physics colliders - using a static rigid body with multiple box colliders */}
      <RigidBody type="fixed" colliders={false}>
        {colliderPositions.map((pos) => (
          <CuboidCollider
            key={`${pos.x}-${pos.y}-${pos.z}`}
            args={[0.5, 0.5, 0.5]}
            position={[pos.x + 0.5, pos.y + 0.5, pos.z + 0.5]}
          />
        ))}
      </RigidBody>
      
      {/* Debug visualization for colliders */}
      {showColliders && colliderPositions.map((pos) => (
        <mesh
          key={`debug-${pos.x}-${pos.y}-${pos.z}`}
          position={[pos.x + 0.5, pos.y + 0.5, pos.z + 0.5]}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="red" wireframe />
        </mesh>
      ))}
    </group>
  );
}
