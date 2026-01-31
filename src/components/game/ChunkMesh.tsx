'use client';

import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ChunkData, ChunkPosition, CHUNK_SIZE } from '@/types';
import { buildChunkMesh, createChunkGeometry } from '@/lib/meshBuilder';
import { getAtlasTexture } from '@/lib/textureAtlas';

interface ChunkMeshProps {
  position: ChunkPosition;
  data: ChunkData;
}

export function ChunkMesh({ position, data }: ChunkMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Build mesh geometry from chunk data
  const geometry = useMemo(() => {
    const meshData = buildChunkMesh(data);
    return createChunkGeometry(meshData);
  }, [data]);
  
  // Create material with texture atlas
  const material = useMemo(() => {
    const texture = getAtlasTexture();
    return new THREE.MeshLambertMaterial({
      map: texture,
      vertexColors: true, // Used for face shading
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
  
  // Store chunk info on mesh for raycasting
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.userData.chunkPosition = position;
      meshRef.current.userData.chunkData = data;
    }
  }, [position, data]);
  
  return (
    <mesh 
      ref={meshRef} 
      geometry={geometry} 
      material={material} 
      position={[worldX, 0, worldZ]}
    />
  );
}
