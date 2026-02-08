'use client';

import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, LAKE_CENTER_X, LAKE_CENTER_Z, LAKE_RADIUS, LAKE_WATER_LEVEL } from '@/stores';
import { SHIP_WHEEL_OFFSET, SHIP_BBOX, updateShipOrigin } from '@/lib/worldGen';
import { getBlockAtWorld, setBlockAtWorld } from '@/lib/blockInteraction';
import { BlockType } from '@/types';

const WHEEL_INTERACT_DISTANCE = 4;
const SHIP_MOVE_INTERVAL = 300; // ms between ship block movements
const LAKE_MOVEMENT_RADIUS = 55; // Keep ship center within this distance of lake center

// Compute wheel world position from ship position + offset
function getWheelWorldPos(shipPos: [number, number, number]): [number, number, number] {
  return [
    shipPos[0] + SHIP_WHEEL_OFFSET[0],
    shipPos[1] + SHIP_WHEEL_OFFSET[1],
    shipPos[2] + SHIP_WHEEL_OFFSET[2],
  ];
}

// ============================================================
// PirateShipSystem Component
// ============================================================

export function PirateShipSystem() {
  const updatePirateShip = useGameStore((state) => state.updatePirateShip);
  const shiftPressedRef = useRef(false);
  const keysRef = useRef<Record<string, boolean>>({});
  const lastMoveTimeRef = useRef(0);

  // Keyboard tracking + shift handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;

      // Shift key handler for toggling steering
      if (e.code !== 'ShiftLeft' && e.code !== 'ShiftRight') return;
      if (shiftPressedRef.current) return;
      shiftPressedRef.current = true;

      const { pirateShip, playerPosition } = useGameStore.getState();

      if (pirateShip.isPlayerSteering) {
        updatePirateShip({ isPlayerSteering: false });
      } else {
        // Check proximity to steering wheel (dynamic position)
        const [wheelX, wheelY, wheelZ] = getWheelWorldPos(pirateShip.position);
        const dx = playerPosition[0] - wheelX;
        const dy = playerPosition[1] - wheelY;
        const dz = playerPosition[2] - wheelZ;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance < WHEEL_INTERACT_DISTANCE) {
          updatePirateShip({ isPlayerSteering: true });
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        shiftPressedRef.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [updatePirateShip]);

  // Ship movement via WASD when steering
  useFrame(() => {
    const { pirateShip, chunks } = useGameStore.getState();
    if (!pirateShip.isPlayerSteering) return;

    const now = Date.now();
    if (now - lastMoveTimeRef.current < SHIP_MOVE_INTERVAL) return;

    const keys = keysRef.current;
    let dx = 0, dz = 0;
    if (keys['KeyW']) dz += 1;
    if (keys['KeyS']) dz -= 1;
    if (keys['KeyA']) dx += 1;
    if (keys['KeyD']) dx -= 1;

    if (dx === 0 && dz === 0) return;

    // Only move one axis at a time (prioritize forward/back)
    if (dx !== 0 && dz !== 0) dx = 0;

    const oldX = pirateShip.position[0];
    const oldZ = pirateShip.position[2];
    const newX = oldX + dx;
    const newZ = oldZ + dz;

    // Check lake bounds
    const distFromCenter = Math.sqrt(
      (newX - LAKE_CENTER_X) ** 2 + (newZ - LAKE_CENTER_Z) ** 2
    );
    if (distFromCenter > LAKE_MOVEMENT_RADIUS) return;

    const deckY = pirateShip.position[1] + 1; // LAKE_WATER_LEVEL + 1

    // Phase 1: Scan bounding box, collect ship blocks, clear old positions
    const shipBlocks: Array<{ rx: number; ry: number; rz: number; blockType: BlockType }> = [];
    const dirtyChunkKeys = new Set<string>();

    for (let rx = SHIP_BBOX.minX; rx <= SHIP_BBOX.maxX; rx++) {
      for (let rz = SHIP_BBOX.minZ; rz <= SHIP_BBOX.maxZ; rz++) {
        for (let ry = SHIP_BBOX.minY; ry <= SHIP_BBOX.maxY; ry++) {
          const wx = oldX + rx;
          const wy = deckY + ry;
          const wz = oldZ + rz;

          const block = getBlockAtWorld(wx, wy, wz, chunks);
          if (block !== null && block !== BlockType.AIR && block !== BlockType.WATER) {
            shipBlocks.push({ rx, ry, rz, blockType: block });
            // Clear old position
            const clearType = wy <= LAKE_WATER_LEVEL ? BlockType.WATER : BlockType.AIR;
            const key = setBlockAtWorld(wx, wy, wz, clearType, chunks);
            if (key) dirtyChunkKeys.add(key);
          }
        }
      }
    }

    // Phase 2: Place ship blocks at new position
    for (const block of shipBlocks) {
      const wx = newX + block.rx;
      const wy = deckY + block.ry;
      const wz = newZ + block.rz;
      const key = setBlockAtWorld(wx, wy, wz, block.blockType, chunks);
      if (key) dirtyChunkKeys.add(key);
    }

    // Mark all affected chunks dirty with NEW data references (required for mesh rebuild)
    // ChunkMesh uses useMemo([data]) - only rebuilds when the Uint8Array reference changes
    const newChunks = new Map(chunks);
    for (const key of dirtyChunkKeys) {
      const chunk = newChunks.get(key);
      if (chunk) newChunks.set(key, {
        ...chunk,
        data: new Uint8Array(chunk.data), // New reference triggers ChunkMesh rebuild
        isDirty: true,
      });
    }

    // Update ship origin for chunk regeneration (prevents duplicate on chunk reload)
    updateShipOrigin(newX, newZ);

    useGameStore.setState({
      chunks: newChunks,
      pirateShip: {
        ...pirateShip,
        position: [newX, pirateShip.position[1], newZ] as [number, number, number],
      },
    });

    lastMoveTimeRef.current = now;
  });

  return (
    <group>
      {/* Lake water plane */}
      <mesh
        position={[LAKE_CENTER_X, LAKE_WATER_LEVEL + 0.1, LAKE_CENTER_Z]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[LAKE_RADIUS, 64]} />
        <meshStandardMaterial
          color="#1a6b8a"
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
