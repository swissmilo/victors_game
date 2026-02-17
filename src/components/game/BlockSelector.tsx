'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '@/stores';
import { raycastBlocks, setBlockAtWorld, spreadWater, BlockHit } from '@/lib/blockInteraction';
import { BlockType } from '@/types';
import { MISSILE_SITE_X, MISSILE_SITE_Y, MISSILE_SITE_Z } from '@/lib/worldGen';

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
  getHoldPosition?: () => { x: number; y: number } | null;
}

// Hold duration needed to break a block on mobile (ms)
const HOLD_BREAK_THRESHOLD = 500;
// Cooldown between continuous block actions (ms)
const CONTINUOUS_ACTION_COOLDOWN = 300;
// Minimum distance from player for continuous placement (blocks)
const MIN_CONTINUOUS_DISTANCE = 2.0;

export function BlockSelector({
  enabled,
  isMobile = false,
  consumeTap,
  isHolding,
  holdDuration,
  isValidHoldForBreak,
  getHoldPosition,
}: BlockSelectorProps) {
  const { camera, size, scene } = useThree();
  const [targetBlock, setTargetBlock] = useState<BlockHit | null>(null);
  const [targetedZombieId, setTargetedZombieId] = useState<number | null>(null);
  const highlightRef = useRef<THREE.Mesh>(null);
  const hasTriggeredBreak = useRef(false);  // Track if we've broken a block during current hold
  
  // Track mouse button states for continuous placement/breaking
  const isLeftMouseDown = useRef(false);
  const isRightMouseDown = useRef(false);
  // Track last block position to avoid repeated actions on same block
  const lastBreakPos = useRef<string | null>(null);
  const lastPlacePos = useRef<string | null>(null);
  // Track last action time for cooldown
  const lastBreakTime = useRef(0);
  const lastPlaceTime = useRef(0);
  
  const chunks = useGameStore((state) => state.chunks);
  const setChunk = useGameStore((state) => state.setChunk);
  const inventory = useGameStore((state) => state.inventory);
  const hotbarSelection = useGameStore((state) => state.hotbarSelection);
  const addToInventory = useGameStore((state) => state.addToInventory);
  const removeFromInventory = useGameStore((state) => state.removeFromInventory);
  const addTeleporter = useGameStore((state) => state.addTeleporter);
  const removeTeleporter = useGameStore((state) => state.removeTeleporter);
  const playerPosition = useGameStore((state) => state.playerPosition);
  const hitZombie = useGameStore((state) => state.hitZombie);
  const zombies = useGameStore((state) => state.zombies);
  const setTargetedZombieInStore = useGameStore((state) => state.setTargetedZombieId);
  const hitAnimatronic = useGameStore((state) => state.hitAnimatronic);
  const animatronics = useGameStore((state) => state.animatronics);
  
  // Helper to check if a position is far enough from player for continuous action
  const isFarEnoughFromPlayer = useCallback((pos: { x: number; y: number; z: number }) => {
    const dx = pos.x - playerPosition[0];
    const dy = pos.y - playerPosition[1];
    const dz = pos.z - playerPosition[2];
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return distance >= MIN_CONTINUOUS_DISTANCE;
  }, [playerPosition]);

  // Convert chunks Map to the format needed by raycast
  const getChunksForRaycast = useCallback(() => {
    const result = new Map<string, { data: Uint8Array; position: { x: number; z: number } }>();
    chunks.forEach((chunk, key) => {
      result.set(key, { data: chunk.data, position: chunk.position });
    });
    return result;
  }, [chunks]);

  // Check if ray hits a zombie using manual distance check (like block raycasting)
  const checkZombieHit = useCallback((): number | null => {
    if (zombies.length === 0) return null;

    // Get ray direction from camera
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(camera.quaternion);
    direction.normalize();

    const origin = camera.position.clone();
    const maxDistance = 10; // Maximum reach distance
    const zombieHitRadius = 2.5; // How close to zombie center counts as a hit (scaled for 4x size)

    // Step along the ray and check distance to each zombie
    let closestZombieId: number | null = null;
    let closestDistance = Infinity;

    const step = 0.1; // Step size along ray
    for (let t = 0; t < maxDistance; t += step) {
      const rayPoint = origin.clone().add(direction.clone().multiplyScalar(t));

      // Check all zombies
      for (const zombie of zombies) {
        if (zombie.isDead) continue;

        const zombiePos = new THREE.Vector3(
          zombie.position[0],
          zombie.position[1],
          zombie.position[2]
        );

        const distToZombie = rayPoint.distanceTo(zombiePos);

        if (distToZombie < zombieHitRadius && t < closestDistance) {
          closestZombieId = zombie.id;
          closestDistance = t;
        }
      }

      // If we found a zombie, stop checking further
      if (closestZombieId !== null) {
        break;
      }
    }

    return closestZombieId;
  }, [camera, zombies]);

  // Check if player is looking at an animatronic (ray march)
  const checkAnimatronicHit = useCallback((): number | null => {
    if (animatronics.length === 0) return null;

    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(camera.quaternion);
    direction.normalize();

    const origin = camera.position.clone();
    const maxDistance = 10;
    const hitRadius = 2.5;

    let closestId: number | null = null;
    let closestDist = Infinity;

    const step = 0.1;
    for (let t = 0; t < maxDistance; t += step) {
      const rayPoint = origin.clone().add(direction.clone().multiplyScalar(t));
      for (const anim of animatronics) {
        if (anim.isDead) continue;
        const pos = new THREE.Vector3(anim.position[0], anim.position[1], anim.position[2]);
        const dist = rayPoint.distanceTo(pos);
        if (dist < hitRadius && t < closestDist) {
          closestId = anim.id;
          closestDist = t;
        }
      }
      if (closestId !== null) break;
    }
    return closestId;
  }, [camera, animatronics]);

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

    // Check if clicking the missile launch button (obsidian at control panel)
    const pos = targetBlock.blockPosition;
    const blockX = Math.floor(pos.x);
    const blockY = Math.floor(pos.y);
    const blockZ = Math.floor(pos.z);

    // Control panel button is obsidian at X=20, Z=9 (any Y, since terrain height varies)
    // It's located 5 blocks from missile site X, and 1 block in front of panel Z
    const buttonX = MISSILE_SITE_X + 5;
    const buttonZ = MISSILE_SITE_Z - 1;

    if (blockX === buttonX && blockZ === buttonZ && targetBlock.blockType === BlockType.OBSIDIAN) {
      // Launch missile!
      const launchMissile = useGameStore.getState().launchMissile;
      const missileState = useGameStore.getState().missileState;

      // Only launch if missile is idle
      if (missileState === 'idle') {
        launchMissile();
      }
      return; // Don't break the button
    }

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

      // If placing water, spread it to nearby blocks
      const dirtyKeys = new Set<string>([modifiedKey]);
      if (selectedSlot.blockType === BlockType.WATER) {
        const waterKeys = spreadWater(blockX, blockY, blockZ, chunksMap);
        for (const k of waterKeys) dirtyKeys.add(k);
      }

      // Remove from inventory
      removeFromInventory(hotbarSelection, 1);

      // Trigger chunk re-renders for all affected chunks
      for (const key of dirtyKeys) {
        const chunk = chunks.get(key);
        if (chunk) {
          const newData = new Uint8Array(chunk.data);
          setChunk(chunk.position, {
            ...chunk,
            data: newData,
            isDirty: true,
          });
        }
      }
    }
  }, [inventory, hotbarSelection, getChunksForRaycast, chunks, setChunk, removeFromInventory, addTeleporter]);

  // Place block (right click) - uses current target
  const placeBlock = useCallback(() => {
    if (!targetBlock) return;
    placeBlockAt(targetBlock);
  }, [targetBlock, placeBlockAt]);

  // Handle mouse clicks - track button state for continuous placement
  useEffect(() => {
    if (!enabled) return;

    const handleMouseDown = (event: MouseEvent) => {
      // Ignore clicks on UI elements (hotbar, buttons, etc.)
      const target = event.target as HTMLElement;
      if (
        target.closest('button') ||
        target.closest('a') ||
        target.closest('[role="button"]') ||
        target.closest('[data-hotbar]')
      ) {
        return;
      }

      const now = Date.now();
      if (event.button === 0) {
        // Left click - first check for zombie/animatronic hit
        const zombieId = checkZombieHit();
        if (zombieId !== null) {
          hitZombie(zombieId);
          return;
        }
        const animId = checkAnimatronicHit();
        if (animId !== null) {
          hitAnimatronic(animId);
          return;
        }

        // No zombie hit, break block
        isLeftMouseDown.current = true;
        breakBlock();
        // Update last break position and time to prevent double-action
        if (targetBlock) {
          const pos = targetBlock.blockPosition;
          lastBreakPos.current = `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
          lastBreakTime.current = now;
        }
      } else if (event.button === 2) {
        // Right click - place
        isRightMouseDown.current = true;
        placeBlock();
        // Update last place position and time to prevent double-action
        if (targetBlock) {
          const pos = targetBlock.placePosition;
          lastPlacePos.current = `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
          lastPlaceTime.current = now;
        }
      }
    };
    
    const handleMouseUp = (event: MouseEvent) => {
      if (event.button === 0) {
        isLeftMouseDown.current = false;
        lastBreakPos.current = null;
      } else if (event.button === 2) {
        isRightMouseDown.current = false;
        lastPlacePos.current = null;
      }
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [enabled, breakBlock, placeBlock, targetBlock, checkZombieHit, hitZombie, checkAnimatronicHit, hitAnimatronic]);

  // Raycast every frame to find targeted block and zombie
  useFrame(() => {
    if (!enabled) {
      setTargetBlock(null);
      setTargetedZombieId(null);
      setTargetedZombieInStore(null);
      return;
    }

    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(camera.quaternion);

    // Check for zombie first
    const zombieId = checkZombieHit();
    setTargetedZombieId(zombieId); // Local state
    setTargetedZombieInStore(zombieId); // Store state for UI

    const chunksMap = getChunksForRaycast();
    const hit = raycastBlocks(camera.position, direction, chunksMap, 6);

    setTargetBlock(hit);
    
    // Desktop: Continuous breaking while left mouse held and moving to new blocks
    if (!isMobile && isLeftMouseDown.current && hit) {
      const now = Date.now();
      const pos = hit.blockPosition;
      const posKey = `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
      
      // Check cooldown, new position, and minimum distance from player
      const cooldownPassed = now - lastBreakTime.current >= CONTINUOUS_ACTION_COOLDOWN;
      const isNewBlock = posKey !== lastBreakPos.current;
      const farEnough = isFarEnoughFromPlayer(pos);
      
      if (isNewBlock && cooldownPassed && farEnough) {
        breakBlockAt(hit);
        lastBreakPos.current = posKey;
        lastBreakTime.current = now;
      }
    }
    
    // Desktop: Continuous placement while right mouse held and moving to new blocks
    if (!isMobile && isRightMouseDown.current && hit) {
      const now = Date.now();
      const pos = hit.placePosition;
      const posKey = `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
      
      // Check cooldown, new position, and minimum distance from player
      const cooldownPassed = now - lastPlaceTime.current >= CONTINUOUS_ACTION_COOLDOWN;
      const isNewBlock = posKey !== lastPlacePos.current;
      const farEnough = isFarEnoughFromPlayer(pos);
      
      if (isNewBlock && cooldownPassed && farEnough) {
        placeBlockAt(hit);
        lastPlacePos.current = posKey;
        lastPlaceTime.current = now;
      }
    }
    
    // Handle mobile touch controls
    if (isMobile) {
      // Check for tap - first check for zombie hit, then place block
      if (consumeTap) {
        const tap = consumeTap();
        if (tap && zombies.length > 0) {
          // Manual raycast for zombie hit at tap position
          const tapDirection = screenToRayDirection(tap.x, tap.y, camera, size);
          tapDirection.normalize();
          const origin = camera.position.clone();
          const maxDistance = 10;
          const zombieHitRadius = 2.5;

          let hitZombieId: number | null = null;
          let closestDistance = Infinity;

          const step = 0.1;
          for (let t = 0; t < maxDistance; t += step) {
            const rayPoint = origin.clone().add(tapDirection.clone().multiplyScalar(t));

            for (const zombie of zombies) {
              if (zombie.isDead) continue;

              const zombiePos = new THREE.Vector3(
                zombie.position[0],
                zombie.position[1],
                zombie.position[2]
              );

              const distToZombie = rayPoint.distanceTo(zombiePos);

              if (distToZombie < zombieHitRadius && t < closestDistance) {
                hitZombieId = zombie.id;
                closestDistance = t;
              }
            }

            if (hitZombieId !== null) {
              break;
            }
          }

          if (hitZombieId !== null) {
            hitZombie(hitZombieId);
            return; // Don't place block if we hit a zombie
          }

          // Also check animatronics on right-click
          const animHitId = checkAnimatronicHit();
          if (animHitId !== null) {
            hitAnimatronic(animHitId);
            return;
          }

          // No zombie hit, raycast for blocks and place block
          const tapHit = raycastBlocks(camera.position, tapDirection, chunksMap, 6);
          if (tapHit) {
            placeBlockAt(tapHit);
          }
        }
      }
      
      // Check for hold (break block) - only if valid hold (centered, minimal movement)
      if (isHolding && holdDuration && isValidHoldForBreak && getHoldPosition) {
        const holding = isHolding();
        const duration = holdDuration();
        const validHold = isValidHoldForBreak();
        
        // Only break if: holding, long enough, valid hold position, and haven't already triggered
        if (holding && duration >= HOLD_BREAK_THRESHOLD && validHold && !hasTriggeredBreak.current) {
          // Raycast from hold position (where the touch started)
          const holdPos = getHoldPosition();
          if (holdPos) {
            const holdDirection = screenToRayDirection(holdPos.x, holdPos.y, camera, size);
            const holdHit = raycastBlocks(camera.position, holdDirection, chunksMap, 6);
            if (holdHit) {
              breakBlockAt(holdHit);
              hasTriggeredBreak.current = true;
            }
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
