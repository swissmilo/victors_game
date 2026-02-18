'use client';

import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ChunkData, ChunkPosition, CHUNK_SIZE, CHUNK_HEIGHT } from '@/types';
import { buildChunkMesh, buildWaterMesh, createChunkGeometry, DarkZone } from '@/lib/meshBuilder';
import { getSharedChunkMaterial, getSharedWaterMaterial } from '@/lib/textureAtlas';

interface ChunkMeshProps {
  position: ChunkPosition;
  data: ChunkData;
  darkZones?: DarkZone[];
}

export function ChunkMesh({ position, data, darkZones }: ChunkMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const worldX = position.x * CHUNK_SIZE;
  const worldZ = position.z * CHUNK_SIZE;

  // Build opaque mesh geometry from chunk data
  const geometry = useMemo(() => {
    const meshData = buildChunkMesh(data, worldX, worldZ, darkZones);
    const geo = createChunkGeometry(meshData);

    geo.boundingBox = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_SIZE)
    );
    geo.boundingSphere = new THREE.Sphere();
    geo.boundingBox.getBoundingSphere(geo.boundingSphere);

    return geo;
  }, [data, worldX, worldZ, darkZones]);

  // Build water mesh geometry (separate for translucent rendering)
  const waterGeometry = useMemo(() => {
    const meshData = buildWaterMesh(data, worldX, worldZ, darkZones);
    if (meshData.positions.length === 0) return null;
    const geo = createChunkGeometry(meshData);

    geo.boundingBox = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_SIZE)
    );
    geo.boundingSphere = new THREE.Sphere();
    geo.boundingBox.getBoundingSphere(geo.boundingSphere);

    return geo;
  }, [data, worldX, worldZ, darkZones]);

  const material = useMemo(() => getSharedChunkMaterial(), []);
  const waterMaterial = useMemo(() => getSharedWaterMaterial(), []);

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
