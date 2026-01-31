'use client';

import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ChunkData, ChunkPosition, CHUNK_SIZE, CHUNK_HEIGHT } from '@/types';
import { buildChunkMesh, createChunkGeometry } from '@/lib/meshBuilder';
import { getSharedChunkMaterial } from '@/lib/textureAtlas';

interface ChunkMeshProps {
  position: ChunkPosition;
  data: ChunkData;
}

export function ChunkMesh({ position, data }: ChunkMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Build mesh geometry from chunk data
  const geometry = useMemo(() => {
    const meshData = buildChunkMesh(data);
    const geo = createChunkGeometry(meshData);
    
    // Set explicit bounding box for frustum culling optimization
    // This prevents Three.js from recalculating it every frame
    geo.boundingBox = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_SIZE)
    );
    
    // Compute bounding sphere from the box for faster frustum checks
    geo.boundingSphere = new THREE.Sphere();
    geo.boundingBox.getBoundingSphere(geo.boundingSphere);
    
    return geo;
  }, [data]);
  
  // Use shared material across all chunks (reduces GPU memory and draw calls)
  const material = useMemo(() => getSharedChunkMaterial(), []);
  
  // World offset for this chunk
  const worldX = position.x * CHUNK_SIZE;
  const worldZ = position.z * CHUNK_SIZE;
  
  // Cleanup geometry on unmount
  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);
  
  // Store chunk info on mesh for raycasting and enable frustum culling
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.userData.chunkPosition = position;
      meshRef.current.userData.chunkData = data;
      // Ensure frustum culling is enabled (it's on by default, but be explicit)
      meshRef.current.frustumCulled = true;
    }
  }, [position, data]);
  
  return (
    <mesh 
      ref={meshRef} 
      geometry={geometry} 
      material={material} 
      position={[worldX, 0, worldZ]}
      frustumCulled={true}
    />
  );
}
