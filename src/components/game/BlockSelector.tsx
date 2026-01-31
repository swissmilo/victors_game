'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '@/stores';
import { raycastBlocks, setBlockAtWorld, BlockHit } from '@/lib/blockInteraction';
import { BlockType } from '@/types';

interface BlockSelectorProps {
  enabled: boolean;
}

export function BlockSelector({ enabled }: BlockSelectorProps) {
  const { camera } = useThree();
  const [targetBlock, setTargetBlock] = useState<BlockHit | null>(null);
  const highlightRef = useRef<THREE.Mesh>(null);
  
  const chunks = useGameStore((state) => state.chunks);
  const setChunk = useGameStore((state) => state.setChunk);
  const inventory = useGameStore((state) => state.inventory);
  const hotbarSelection = useGameStore((state) => state.hotbarSelection);
  const addToInventory = useGameStore((state) => state.addToInventory);
  const removeFromInventory = useGameStore((state) => state.removeFromInventory);
  const addTeleporter = useGameStore((state) => state.addTeleporter);
  const removeTeleporter = useGameStore((state) => state.removeTeleporter);

  // Convert chunks Map to the format needed by raycast
  const getChunksForRaycast = useCallback(() => {
    const result = new Map<string, { data: Uint8Array; position: { x: number; z: number } }>();
    chunks.forEach((chunk, key) => {
      result.set(key, { data: chunk.data, position: chunk.position });
    });
    return result;
  }, [chunks]);

  // Break block (left click)
  const breakBlock = useCallback(() => {
    if (!targetBlock) return;
    
    const chunksMap = getChunksForRaycast();
    const pos = targetBlock.blockPosition;
    const blockX = Math.floor(pos.x);
    const blockY = Math.floor(pos.y);
    const blockZ = Math.floor(pos.z);
    
    // Check if we're breaking a teleporter
    if (targetBlock.blockType === BlockType.TELEPORTER) {
      removeTeleporter({ x: blockX, y: blockY, z: blockZ });
    }
    
    // Set block to air
    const modifiedKey = setBlockAtWorld(
      blockX,
      blockY,
      blockZ,
      BlockType.AIR,
      chunksMap
    );
    
    if (modifiedKey) {
      // Add to inventory
      addToInventory(targetBlock.blockType);
      
      // Trigger chunk re-render by updating the chunk in store
      const chunk = chunks.get(modifiedKey);
      if (chunk) {
        // Create new data array to trigger re-render
        const newData = new Uint8Array(chunk.data);
        setChunk(chunk.position, {
          ...chunk,
          data: newData,
          isDirty: true,
        });
      }
    }
  }, [targetBlock, getChunksForRaycast, chunks, setChunk, addToInventory, removeTeleporter]);

  // Place block (right click)
  const placeBlock = useCallback(() => {
    if (!targetBlock) return;
    
    const selectedSlot = inventory[hotbarSelection];
    if (!selectedSlot || selectedSlot.count === 0 || selectedSlot.blockType === BlockType.AIR) {
      return;
    }
    
    const chunksMap = getChunksForRaycast();
    const pos = targetBlock.placePosition;
    const blockX = Math.floor(pos.x);
    const blockY = Math.floor(pos.y);
    const blockZ = Math.floor(pos.z);
    
    // Set block
    const modifiedKey = setBlockAtWorld(
      blockX,
      blockY,
      blockZ,
      selectedSlot.blockType,
      chunksMap
    );
    
    if (modifiedKey) {
      // If placing a teleporter, track its position
      if (selectedSlot.blockType === BlockType.TELEPORTER) {
        addTeleporter({ x: blockX, y: blockY, z: blockZ });
      }
      
      // Remove from inventory
      removeFromInventory(hotbarSelection, 1);
      
      // Trigger chunk re-render
      const chunk = chunks.get(modifiedKey);
      if (chunk) {
        const newData = new Uint8Array(chunk.data);
        setChunk(chunk.position, {
          ...chunk,
          data: newData,
          isDirty: true,
        });
      }
    }
  }, [targetBlock, inventory, hotbarSelection, getChunksForRaycast, chunks, setChunk, removeFromInventory, addTeleporter]);

  // Handle mouse clicks
  useEffect(() => {
    if (!enabled) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button === 0) {
        // Left click - break
        breakBlock();
      } else if (event.button === 2) {
        // Right click - place
        placeBlock();
      }
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [enabled, breakBlock, placeBlock]);

  // Raycast every frame to find targeted block
  useFrame(() => {
    if (!enabled) {
      setTargetBlock(null);
      return;
    }

    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(camera.quaternion);
    
    const chunksMap = getChunksForRaycast();
    const hit = raycastBlocks(camera.position, direction, chunksMap, 6);
    
    setTargetBlock(hit);
    
    // Update highlight position
    if (highlightRef.current) {
      if (hit) {
        highlightRef.current.visible = true;
        highlightRef.current.position.set(
          hit.blockPosition.x + 0.5,
          hit.blockPosition.y + 0.5,
          hit.blockPosition.z + 0.5
        );
      } else {
        highlightRef.current.visible = false;
      }
    }
  });

  return (
    <mesh ref={highlightRef} visible={false}>
      <boxGeometry args={[1.002, 1.002, 1.002]} />
      <meshBasicMaterial 
        color="#000000" 
        wireframe 
        transparent 
        opacity={0.4}
      />
    </mesh>
  );
}
