'use client';

import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ChunkData, ChunkPosition, CHUNK_SIZE, CHUNK_HEIGHT } from '@/types';
import { buildChunkMesh, buildWaterMesh, createChunkGeometry } from '@/lib/meshBuilder';
import { getSharedChunkMaterial, getSharedWaterMaterial } from '@/lib/textureAtlas';

interface ChunkMeshProps {
  position: ChunkPosition;
  data: ChunkData;
}

export function ChunkMesh({ position, data }: ChunkMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Build opaque mesh geometry from chunk data
  const geometry = useMemo(() => {
    const meshData = buildChunkMesh(data);
    const geo = createChunkGeometry(meshData);

    geo.boundingBox = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_SIZE)
    );
    geo.boundingSphere = new THREE.Sphere();
    geo.boundingBox.getBoundingSphere(geo.boundingSphere);

    return geo;
  }, [data]);

  // Build water mesh geometry (separate for translucent rendering)
  const waterGeometry = useMemo(() => {
    const meshData = buildWaterMesh(data);
    if (meshData.positions.length === 0) return null;
    const geo = createChunkGeometry(meshData);

    geo.boundingBox = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_SIZE)
    );
    geo.boundingSphere = new THREE.Sphere();
    geo.boundingBox.getBoundingSphere(geo.boundingSphere);

    return geo;
  }, [data]);

  const material = useMemo(() => getSharedChunkMaterial(), []);
  const waterMaterial = useMemo(() => getSharedWaterMaterial(), []);

  const worldX = position.x * CHUNK_SIZE;
  const worldZ = position.z * CHUNK_SIZE;

  useEffect(() => {
    return () => {
      geometry.dispose();
      waterGeometry?.dispose();
    };
  }, [geometry, waterGeometry]);

  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.userData.chunkPosition = position;
      meshRef.current.userData.chunkData = data;
      meshRef.current.frustumCulled = true;
    }
  }, [position, data]);

  return (
    <group position={[worldX, 0, worldZ]}>
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={material}
        frustumCulled={true}
      />
      {waterGeometry && (
        <mesh
          geometry={waterGeometry}
          material={waterMaterial}
          frustumCulled={true}
          renderOrder={1}
        />
      )}
    </group>
  );
}
