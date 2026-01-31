'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useKeyboard } from '@/hooks';
import { useGameStore } from '@/stores';
import { BLOCK_DEFINITIONS, CHUNK_SIZE, getBlockFromChunk, chunkPositionToKey } from '@/types';

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

interface PlayerProps {
  isLocked: boolean;
  consumeMovement: () => { x: number; y: number };
}

export function Player({ isLocked, consumeMovement }: PlayerProps) {
  const { camera } = useThree();
  const keys = useKeyboard();
  
  const setPlayerPosition = useGameStore((state) => state.setPlayerPosition);
  const setHotbarSelection = useGameStore((state) => state.setHotbarSelection);
  const isFlying = useGameStore((state) => state.isFlying);
  const setIsFlying = useGameStore((state) => state.setIsFlying);
  const chunks = useGameStore((state) => state.chunks);
  
  const positionRef = useRef(new THREE.Vector3(8, 50, 8));
  const velocityRef = useRef(new THREE.Vector3(0, 0, 0));
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const isGroundedRef = useRef(false);
  const lastSpacePressRef = useRef(0);
  const spaceWasDownRef = useRef(false);
  
  // Check if a world position contains a solid block
  const isBlockSolid = useCallback((worldX: number, worldY: number, worldZ: number): boolean => {
    if (worldY < 0) return true; // Below world is solid
    if (worldY >= 64) return false; // Above world is air
    
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    const key = chunkPositionToKey({ x: chunkX, z: chunkZ });
    
    const chunk = chunks.get(key);
    if (!chunk) return false; // Unloaded chunks are passable
    
    const localX = ((Math.floor(worldX) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((Math.floor(worldZ) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localY = Math.floor(worldY);
    
    const block = getBlockFromChunk(chunk.data, localX, localY, localZ);
    const def = BLOCK_DEFINITIONS[block];
    return def?.solid ?? false;
  }, [chunks]);
  
  // Handle hotbar selection and double-tap fly toggle
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
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
  }, [setHotbarSelection, isFlying, setIsFlying]);

  useFrame((_, delta) => {
    // Clamp delta to prevent huge jumps
    const dt = Math.min(delta, 0.1);
    
    // Get mouse movement for camera rotation
    if (isLocked) {
      const { x: movementX, y: movementY } = consumeMovement();
      
      yawRef.current -= movementX * MOUSE_SENSITIVITY;
      pitchRef.current -= movementY * MOUSE_SENSITIVITY;
      pitchRef.current = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitchRef.current));
    }

    // Calculate movement direction
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
