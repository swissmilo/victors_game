'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '@/stores';
import { raycastBlocks, setBlockAtWorld, BlockHit } from '@/lib/blockInteraction';
import { BlockType } from '@/types';

// Helper to convert screen coordinates to ray direction
function screenToRayDirection(
  screenX: number,
  screenY: number,
  camera: THREE.Camera,
  size: { width: number; height: number }
): THREE.Vector3 {
  // Convert screen coords to normalized device coordinates (-1 to 1)
  const ndc = new THREE.Vector2(
    (screenX / size.width) * 2 - 1,
    -(screenY / size.height) * 2 + 1
  );
  
  // Create raycaster and set from camera
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  
  return raycaster.ray.direction.clone();
}

interface BlockSelectorProps {
  enabled: boolean;
  isMobile?: boolean;
  consumeTap?: () => { x: number; y: number } | null;
  isHolding?: () => boolean;
  holdDuration?: () => number;
  isValidHoldForBreak?: () => boolean;
}

// Hold duration needed to break a block on mobile (ms)
const HOLD_BREAK_THRESHOLD = 500;

export function BlockSelector({ 
  enabled, 
  isMobile = false,
  consumeTap,
  isHolding,
  holdDuration,
  isValidHoldForBreak,
}: BlockSelectorProps) {
  const { camera, size } = useThree();
  const [targetBlock, setTargetBlock] = useState<BlockHit | null>(null);
  const highlightRef = useRef<THREE.Mesh>(null);
  const hasTriggeredBreak = useRef(false);  // Track if we've broken a block during current hold
  
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

  // Break block at specific hit position
  const breakBlockAt = useCallback((hit: BlockHit) => {
    const chunksMap = getChunksForRaycast();
    const pos = hit.blockPosition;
    const blockX = Math.floor(pos.x);
    const blockY = Math.floor(pos.y);
    const blockZ = Math.floor(pos.z);
    
    // Check if we're breaking a teleporter
    if (hit.blockType === BlockType.TELEPORTER) {
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
      addToInventory(hit.blockType);
      
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
  }, [getChunksForRaycast, chunks, setChunk, addToInventory, removeTeleporter]);
  
  // Break block (left click) - uses current target
  const breakBlock = useCallback(() => {
    if (!targetBlock) return;
    breakBlockAt(targetBlock);
  }, [targetBlock, breakBlockAt]);

  // Place block at specific hit position
  const placeBlockAt = useCallback((hit: BlockHit) => {
    const selectedSlot = inventory[hotbarSelection];
    if (!selectedSlot || selectedSlot.count === 0 || selectedSlot.blockType === BlockType.AIR) {
      return;
    }
    
    const chunksMap = getChunksForRaycast();
    const pos = hit.placePosition;
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
  }, [inventory, hotbarSelection, getChunksForRaycast, chunks, setChunk, removeFromInventory, addTeleporter]);

  // Place block (right click) - uses current target
  const placeBlock = useCallback(() => {
    if (!targetBlock) return;
    placeBlockAt(targetBlock);
  }, [targetBlock, placeBlockAt]);

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
    
    // Handle mobile touch controls
    if (isMobile) {
      // Check for tap (place block) - raycast from tap position
      if (consumeTap) {
        const tap = consumeTap();
        if (tap) {
          // Raycast from tap position instead of screen center
          const tapDirection = screenToRayDirection(tap.x, tap.y, camera, size);
          const tapHit = raycastBlocks(camera.position, tapDirection, chunksMap, 6);
          if (tapHit) {
            placeBlockAt(tapHit);
          }
        }
      }
      
      // Check for hold (break block) - only if valid hold (centered, minimal movement)
      if (isHolding && holdDuration && isValidHoldForBreak) {
        const holding = isHolding();
        const duration = holdDuration();
        const validHold = isValidHoldForBreak();
        
        // Only break if: holding, long enough, valid hold position, and haven't already triggered
        if (holding && duration >= HOLD_BREAK_THRESHOLD && validHold && !hasTriggeredBreak.current) {
          // Use the center-screen hit for hold-to-break (since player looks at what they want to break)
          if (hit) {
            breakBlockAt(hit);
            hasTriggeredBreak.current = true;
          }
        }
        
        // Reset when not holding
        if (!holding) {
          hasTriggeredBreak.current = false;
        }
      }
    }
    
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
