'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useKeyboard } from '@/hooks';
import { useGameStore } from '@/stores';

const MOVE_SPEED = 10;
const MOUSE_SENSITIVITY = 0.002;
const PLAYER_HEIGHT = 1.7;
const GRAVITY = 30;
const JUMP_VELOCITY = 12;
const GROUND_LEVEL = 35; // Approximate ground level

interface PlayerProps {
  isLocked: boolean;
  consumeMovement: () => { x: number; y: number };
}

export function Player({ isLocked, consumeMovement }: PlayerProps) {
  const { camera } = useThree();
  const keys = useKeyboard();
  
  const setPlayerPosition = useGameStore((state) => state.setPlayerPosition);
  const setHotbarSelection = useGameStore((state) => state.setHotbarSelection);
  
  const positionRef = useRef(new THREE.Vector3(8, 50, 8));
  const velocityRef = useRef(new THREE.Vector3(0, 0, 0));
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const isGroundedRef = useRef(false);

  // Handle hotbar selection with number keys
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      if (key >= '1' && key <= '9') {
        setHotbarSelection(parseInt(key) - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setHotbarSelection]);

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
    moveDirection.multiplyScalar(MOVE_SPEED);

    // Apply horizontal movement
    velocityRef.current.x = moveDirection.x;
    velocityRef.current.z = moveDirection.z;

    // Apply gravity
    velocityRef.current.y -= GRAVITY * dt;

    // Jump
    if (keys['Space'] && isGroundedRef.current) {
      velocityRef.current.y = JUMP_VELOCITY;
      isGroundedRef.current = false;
    }

    // Update position
    positionRef.current.x += velocityRef.current.x * dt;
    positionRef.current.y += velocityRef.current.y * dt;
    positionRef.current.z += velocityRef.current.z * dt;

    // Simple ground collision (temporary until proper voxel collision)
    if (positionRef.current.y < GROUND_LEVEL) {
      positionRef.current.y = GROUND_LEVEL;
      velocityRef.current.y = 0;
      isGroundedRef.current = true;
    }

    // Update camera position and rotation
    camera.position.set(
      positionRef.current.x,
      positionRef.current.y + PLAYER_HEIGHT,
      positionRef.current.z
    );
    
    const euler = new THREE.Euler(pitchRef.current, yawRef.current, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);

    // Update store
    setPlayerPosition([positionRef.current.x, positionRef.current.y, positionRef.current.z]);
  });

  return null; // Player is camera-only, no mesh
}
