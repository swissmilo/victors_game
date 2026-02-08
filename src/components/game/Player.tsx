'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useKeyboard } from '@/hooks';
import { useGameStore, TeleporterPosition } from '@/stores';
import { BLOCK_DEFINITIONS, BlockType, CHUNK_SIZE, getBlockFromChunk, chunkPositionToKey } from '@/types';
import { PORTAL_LOCATIONS, PortalLocation } from '@/lib/worldGen';
import { SHIP_WHEEL_OFFSET } from '@/lib/worldGen';

const MOVE_SPEED = 10;
const FLY_SPEED = 15;
const MOUSE_SENSITIVITY = 0.002;

// Player dimensions - sized to fit through 1-block holes
const PLAYER_HEIGHT = 0.9;      // Collision height (less than 1 block to fit through holes)
const PLAYER_WIDTH = 0.6;       // Collision width
const EYE_HEIGHT = 1.7;         // Camera/eye level relative to feet (normal viewing height)
const GRAVITY = 30;
const JUMP_VELOCITY = 12;       // Jump velocity
const DOUBLE_TAP_THRESHOLD = 300; // ms
const PORTAL_COOLDOWN = 2000;     // ms - time before player can teleport again
const TELEPORTER_COOLDOWN = 1000; // ms - time before player can use teleporter block again

interface PlayerProps {
  isLocked: boolean;
  consumeMovement: () => { x: number; y: number };
  isMobile?: boolean;
  consumeLookDelta?: () => { x: number; y: number };
}

export function Player({ isLocked, consumeMovement, isMobile = false, consumeLookDelta }: PlayerProps) {
  const { camera } = useThree();
  const keys = useKeyboard();
  
  const setPlayerPosition = useGameStore((state) => state.setPlayerPosition);
  const setHotbarSelection = useGameStore((state) => state.setHotbarSelection);
  const isFlying = useGameStore((state) => state.isFlying);
  const setIsFlying = useGameStore((state) => state.setIsFlying);
  const isInParkour = useGameStore((state) => state.isInBlackHoleParkour);
  const worldChunks = useGameStore((state) => state.chunks);
  const parkourChunks = useGameStore((state) => state.parkourChunks);

  // Use parkour chunks when in parkour mode, otherwise use world chunks
  const chunks = isInParkour ? parkourChunks : worldChunks;

  const teleporters = useGameStore((state) => state.teleporters);
  const blackHole = useGameStore((state) => state.blackHole);
  const hurricane = useGameStore((state) => state.hurricane);
  const respawnPosition = useGameStore((state) => state.respawnPosition);
  const setRespawnPosition = useGameStore((state) => state.setRespawnPosition);
  
  const positionRef = useRef(new THREE.Vector3(8, 50, 8));
  const velocityRef = useRef(new THREE.Vector3(0, 0, 0));
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const isGroundedRef = useRef(false);
  const lastSpacePressRef = useRef(0);
  const spaceWasDownRef = useRef(false);
  const lastTeleportTimeRef = useRef(0);
  const lastTeleporterUseRef = useRef(0);
  
  // Get block type at world position
  const getBlockAt = useCallback((worldX: number, worldY: number, worldZ: number): BlockType => {
    if (worldY < 0 || worldY >= 64) return BlockType.AIR;
    
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    const key = chunkPositionToKey({ x: chunkX, z: chunkZ });
    
    const chunk = chunks.get(key);
    if (!chunk) return BlockType.AIR;
    
    const localX = ((Math.floor(worldX) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((Math.floor(worldZ) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localY = Math.floor(worldY);
    
    return getBlockFromChunk(chunk.data, localX, localY, localZ);
  }, [chunks]);
  
  // Check if a world position contains a solid block
  const isBlockSolid = useCallback((worldX: number, worldY: number, worldZ: number): boolean => {
    if (worldY < 0) return true; // Below world is solid
    if (worldY >= 64) return false; // Above world is air
    
    const block = getBlockAt(worldX, worldY, worldZ);
    const def = BLOCK_DEFINITIONS[block];
    return def?.solid ?? false;
  }, [getBlockAt]);
  
  // Find which portal the player is in (if any)
  const findCurrentPortal = useCallback((x: number, y: number, z: number): PortalLocation | null => {
    // Check if player is standing in a portal block
    const feetBlock = getBlockAt(x, y, z);
    const bodyBlock = getBlockAt(x, y + 0.5, z);
    
    if (feetBlock !== BlockType.PORTAL && bodyBlock !== BlockType.PORTAL) {
      return null;
    }
    
    // Find the closest portal to this position
    let closestPortal: PortalLocation | null = null;
    let closestDist = Infinity;
    
    for (const portal of PORTAL_LOCATIONS) {
      const dx = x - portal.x;
      const dz = z - portal.z;
      const dist = dx * dx + dz * dz;
      
      if (dist < closestDist && dist < 16) { // Within 4 blocks
        closestDist = dist;
        closestPortal = portal;
      }
    }
    
    return closestPortal;
  }, [getBlockAt]);
  
  // Teleport to a portal
  const teleportToPortal = useCallback((targetPortal: PortalLocation) => {
    positionRef.current.set(targetPortal.x, targetPortal.y, targetPortal.z);
    velocityRef.current.set(0, 0, 0);
    yawRef.current = targetPortal.exitYaw;
    pitchRef.current = 0;
    lastTeleportTimeRef.current = Date.now();
  }, []);
  
  // Check if player is standing on a teleporter block
  const checkTeleporterBlock = useCallback((x: number, y: number, z: number): TeleporterPosition | null => {
    // Check the block directly below the player's feet
    const blockBelowY = Math.floor(y - 0.01);
    const blockBelow = getBlockAt(x, blockBelowY, z);
    
    if (blockBelow === BlockType.TELEPORTER) {
      return {
        x: Math.floor(x),
        y: blockBelowY,
        z: Math.floor(z),
      };
    }
    return null;
  }, [getBlockAt]);
  
  // Teleport to a random teleporter block
  const teleportToRandomTeleporter = useCallback((currentPos: TeleporterPosition) => {
    if (teleporters.length < 2) return;
    
    // Filter out the current teleporter
    const otherTeleporters = teleporters.filter(
      t => !(t.x === currentPos.x && t.y === currentPos.y && t.z === currentPos.z)
    );
    
    if (otherTeleporters.length === 0) return;
    
    // Pick a random one
    const targetIndex = Math.floor(Math.random() * otherTeleporters.length);
    const target = otherTeleporters[targetIndex];
    
    // Teleport to center of the block, on top of it
    positionRef.current.set(target.x + 0.5, target.y + 1, target.z + 0.5);
    velocityRef.current.set(0, 0, 0);
    lastTeleporterUseRef.current = Date.now();
  }, [teleporters]);
  
  // Handle hotbar selection and double-tap fly toggle
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore keyboard input when game is paused
      if (!isLocked) return;
      
      const key = event.key;
      
      // Hotbar selection
      if (key >= '1' && key <= '9') {
        setHotbarSelection(parseInt(key) - 1);
      }
      
      // Double-tap space to toggle fly mode
      if (event.code === 'Space' && !spaceWasDownRef.current) {
        const now = Date.now();
        const timeSinceLastPress = now - lastSpacePressRef.current;
        
        if (timeSinceLastPress < DOUBLE_TAP_THRESHOLD) {
          setIsFlying(!isFlying);
          // Reset velocity when toggling fly
          velocityRef.current.y = 0;
        }
        
        lastSpacePressRef.current = now;
        spaceWasDownRef.current = true;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spaceWasDownRef.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isLocked, setHotbarSelection, isFlying, setIsFlying]);

  useFrame((_, delta) => {
    // Skip all processing when game is paused (not locked/active)
    if (!isLocked) {
      // Still update camera position to current player position
      camera.position.set(
        positionRef.current.x,
        positionRef.current.y + EYE_HEIGHT,
        positionRef.current.z
      );
      return;
    }
    
    // Clamp delta to prevent huge jumps
    const dt = Math.min(delta, 0.1);
    
    // Check for respawn position (e.g., after black hole)
    if (respawnPosition) {
      positionRef.current.set(respawnPosition[0], respawnPosition[1], respawnPosition[2]);
      velocityRef.current.set(0, 0, 0);
      setRespawnPosition(null);
    }
    
    // Check if being pulled by black hole (skip normal physics)
    const isBeingPulledByBlackHole = blackHole.phase === 'pulling' || blackHole.phase === 'consuming';
    
    // Get mouse/touch movement for camera rotation
    if (isLocked) {
      if (isMobile && consumeLookDelta) {
        // Touch controls
        const { x: deltaX, y: deltaY } = consumeLookDelta();
        yawRef.current -= deltaX * MOUSE_SENSITIVITY * 0.5;
        pitchRef.current -= deltaY * MOUSE_SENSITIVITY * 0.5;
      } else {
        // Mouse controls
        const { x: movementX, y: movementY } = consumeMovement();
        yawRef.current -= movementX * MOUSE_SENSITIVITY;
        pitchRef.current -= movementY * MOUSE_SENSITIVITY;
      }
      pitchRef.current = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitchRef.current));
    }

    // If being pulled by black hole, directly lerp toward it (no collision, no normal physics)
    if (isBeingPulledByBlackHole) {
      const [bhX, bhY, bhZ] = blackHole.position;
      
      // Calculate pull speed based on phase (faster during consuming)
      const pullSpeed = blackHole.phase === 'consuming' ? 20 : 8;
      
      // Move directly toward black hole (straight line)
      const dx = bhX - positionRef.current.x;
      const dy = bhY - positionRef.current.y;
      const dz = bhZ - positionRef.current.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      if (distance > 0.5) {
        // Normalize and move toward black hole
        const moveAmount = Math.min(pullSpeed * dt, distance);
        positionRef.current.x += (dx / distance) * moveAmount;
        positionRef.current.y += (dy / distance) * moveAmount;
        positionRef.current.z += (dz / distance) * moveAmount;
      }
      
      // Clear velocity since we're overriding movement
      velocityRef.current.set(0, 0, 0);
      
      // Update camera position and rotation
      camera.position.set(
        positionRef.current.x,
        positionRef.current.y + EYE_HEIGHT,
        positionRef.current.z
      );
      
      const euler = new THREE.Euler(pitchRef.current, yawRef.current, 0, 'YXZ');
      camera.quaternion.setFromEuler(euler);

      // Update store
      setPlayerPosition([positionRef.current.x, positionRef.current.y, positionRef.current.z]);
      return; // Skip normal physics
    }

    // Check if player is steering the pirate ship
    const pirateShip = useGameStore.getState().pirateShip;
    if (pirateShip.isPlayerSteering) {
      // Lock player to the steering wheel position (dynamic, follows ship)
      const wheelX = pirateShip.position[0] + SHIP_WHEEL_OFFSET[0];
      const wheelY = pirateShip.position[1] + SHIP_WHEEL_OFFSET[1];
      const wheelZ = pirateShip.position[2] + SHIP_WHEEL_OFFSET[2];

      positionRef.current.set(wheelX, wheelY, wheelZ);
      velocityRef.current.set(0, 0, 0);

      // Update camera position and rotation
      camera.position.set(wheelX, wheelY + EYE_HEIGHT, wheelZ);
      const euler = new THREE.Euler(pitchRef.current, yawRef.current, 0, 'YXZ');
      camera.quaternion.setFromEuler(euler);

      // Update store
      setPlayerPosition([wheelX, wheelY, wheelZ]);
      return; // Skip normal movement
    }

    // Calculate movement direction (normal gameplay)
    const moveDirection = new THREE.Vector3();
    
    if (keys['KeyW']) moveDirection.z -= 1;
    if (keys['KeyS']) moveDirection.z += 1;
    if (keys['KeyA']) moveDirection.x -= 1;
    if (keys['KeyD']) moveDirection.x += 1;

    moveDirection.normalize();
    moveDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), yawRef.current);
    
    const currentSpeed = isFlying ? FLY_SPEED : MOVE_SPEED;
    moveDirection.multiplyScalar(currentSpeed);

    // Apply horizontal movement
    velocityRef.current.x = moveDirection.x;
    velocityRef.current.z = moveDirection.z;

    if (isFlying) {
      // Flying mode - space goes up, shift goes down
      let verticalVelocity = 0;
      if (keys['Space']) verticalVelocity += FLY_SPEED;
      if (keys['ShiftLeft'] || keys['ShiftRight']) verticalVelocity -= FLY_SPEED;
      velocityRef.current.y = verticalVelocity;
    } else {
      // Normal mode - apply gravity
      velocityRef.current.y -= GRAVITY * dt;

      // Jump
      if (keys['Space'] && isGroundedRef.current) {
        velocityRef.current.y = JUMP_VELOCITY;
        isGroundedRef.current = false;
      }
    }

    // Apply hurricane pull force (additive, player can still move)
    const isBeingPulledByHurricane = hurricane.phase === 'forming' || hurricane.phase === 'active';
    if (isBeingPulledByHurricane && hurricane.intensity > 0) {
      const [hx, , hz] = hurricane.position;
      const dx = hx - positionRef.current.x;
      const dz = hz - positionRef.current.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      // Pull strength: base 8, inversely proportional to distance
      // Active from 5-40 blocks distance
      if (distance > 5 && distance < 40) {
        const pullStrength = 8 * hurricane.intensity * (1 - (distance - 5) / 35);
        if (distance > 0.1) {
          velocityRef.current.x += (dx / distance) * pullStrength * dt;
          velocityRef.current.z += (dz / distance) * pullStrength * dt;
        }
      }
    }

    // Calculate new position
    const newX = positionRef.current.x + velocityRef.current.x * dt;
    const newY = positionRef.current.y + velocityRef.current.y * dt;
    const newZ = positionRef.current.z + velocityRef.current.z * dt;
    
    // Check horizontal collisions (feet and head level)
    const halfWidth = PLAYER_WIDTH / 2;
    const feetY = newY + 0.1;
    const headY = newY + PLAYER_HEIGHT - 0.1;
    
    // X-axis collision
    let finalX = newX;
    const xCheckPoints = [
      [newX + halfWidth, feetY, positionRef.current.z],
      [newX - halfWidth, feetY, positionRef.current.z],
      [newX + halfWidth, headY, positionRef.current.z],
      [newX - halfWidth, headY, positionRef.current.z],
    ];
    for (const [cx, cy, cz] of xCheckPoints) {
      if (isBlockSolid(cx, cy, cz)) {
        finalX = positionRef.current.x;
        velocityRef.current.x = 0;
        break;
      }
    }
    
    // Z-axis collision  
    let finalZ = newZ;
    const zCheckPoints = [
      [finalX, feetY, newZ + halfWidth],
      [finalX, feetY, newZ - halfWidth],
      [finalX, headY, newZ + halfWidth],
      [finalX, headY, newZ - halfWidth],
    ];
    for (const [cx, cy, cz] of zCheckPoints) {
      if (isBlockSolid(cx, cy, cz)) {
        finalZ = positionRef.current.z;
        velocityRef.current.z = 0;
        break;
      }
    }
    
    // Y-axis collision (ground and ceiling)
    let finalY = newY;
    
    if (!isFlying) {
      // Check ground collision - only check the block directly below feet
      // This prevents teleporting on top of overhead blocks
      const feetBlockY = Math.floor(newY - 0.01); // Block the feet would be in if slightly lower
      
      // Check if there's a solid block directly below feet
      const groundCheckPoints = [
        [finalX, feetBlockY, finalZ],
        [finalX + halfWidth * 0.8, feetBlockY, finalZ],
        [finalX - halfWidth * 0.8, feetBlockY, finalZ],
        [finalX, feetBlockY, finalZ + halfWidth * 0.8],
        [finalX, feetBlockY, finalZ - halfWidth * 0.8],
      ];
      
      let groundBlockY = -1;
      for (const [cx, cy, cz] of groundCheckPoints) {
        if (isBlockSolid(cx, cy, cz)) {
          groundBlockY = cy;
          break;
        }
      }
      
      // Only snap to ground if we're falling and there's ground directly below
      if (groundBlockY >= 0 && velocityRef.current.y <= 0) {
        const groundTop = groundBlockY + 1;
        // Only land if we're actually at or below ground level
        if (newY <= groundTop + 0.01) {
          finalY = groundTop;
          velocityRef.current.y = 0;
          isGroundedRef.current = true;
        } else {
          isGroundedRef.current = false;
        }
      } else {
        isGroundedRef.current = false;
      }
      
      // Check ceiling collision (check above head)
      if (velocityRef.current.y > 0) {
        // Check the block that the top of the player's head would enter
        const headY = newY + PLAYER_HEIGHT;
        const ceilingBlockY = Math.floor(headY);
        
        // Check multiple points at head level
        const ceilingCheckPoints = [
          [finalX, ceilingBlockY, finalZ],
          [finalX + halfWidth * 0.8, ceilingBlockY, finalZ],
          [finalX - halfWidth * 0.8, ceilingBlockY, finalZ],
          [finalX, ceilingBlockY, finalZ + halfWidth * 0.8],
          [finalX, ceilingBlockY, finalZ - halfWidth * 0.8],
        ];
        
        for (const [cx, cy, cz] of ceilingCheckPoints) {
          if (isBlockSolid(cx, cy, cz)) {
            // Stop at the bottom of the ceiling block
            finalY = cy - PLAYER_HEIGHT;
            velocityRef.current.y = 0;
            break;
          }
        }
      }
    }
    
    // Apply final position
    positionRef.current.x = finalX;
    positionRef.current.y = finalY;
    positionRef.current.z = finalZ;
    
    // Check for portal teleportation
    const now = Date.now();
    if (now - lastTeleportTimeRef.current > PORTAL_COOLDOWN) {
      const currentPortal = findCurrentPortal(finalX, finalY, finalZ);
      if (currentPortal) {
        // Find the linked portal
        const targetPortal = PORTAL_LOCATIONS.find(p => p.id === currentPortal.linkedTo);
        if (targetPortal) {
          teleportToPortal(targetPortal);
        }
      }
    }
    
    // Check for teleporter block teleportation (when grounded on a teleporter)
    if (isGroundedRef.current && 
        teleporters.length >= 2 && 
        now - lastTeleporterUseRef.current > TELEPORTER_COOLDOWN) {
      const currentTeleporter = checkTeleporterBlock(finalX, finalY, finalZ);
      if (currentTeleporter) {
        teleportToRandomTeleporter(currentTeleporter);
      }
    }

    // Update camera position and rotation
    camera.position.set(
      positionRef.current.x,
      positionRef.current.y + EYE_HEIGHT,
      positionRef.current.z
    );
    
    const euler = new THREE.Euler(pitchRef.current, yawRef.current, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);

    // Update store
    setPlayerPosition([positionRef.current.x, positionRef.current.y, positionRef.current.z]);
  });

  return null; // Player is camera-only, no mesh
}
