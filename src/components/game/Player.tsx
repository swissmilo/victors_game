'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useKeyboard } from '@/hooks';
import { useGameStore } from '@/stores';

const MOVE_SPEED = 10;
const FLY_SPEED = 15;
const MOUSE_SENSITIVITY = 0.002;
const PLAYER_HEIGHT = 1.7;
const GRAVITY = 30;
const JUMP_VELOCITY = 12;
const GROUND_LEVEL = 35; // Approximate ground level
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
  
  const positionRef = useRef(new THREE.Vector3(8, 50, 8));
  const velocityRef = useRef(new THREE.Vector3(0, 0, 0));
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const isGroundedRef = useRef(false);
  const lastSpacePressRef = useRef(0);
  const spaceWasDownRef = useRef(false);

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

    // Update position
    positionRef.current.x += velocityRef.current.x * dt;
    positionRef.current.y += velocityRef.current.y * dt;
    positionRef.current.z += velocityRef.current.z * dt;

    // Ground collision (only when not flying)
    if (!isFlying && positionRef.current.y < GROUND_LEVEL) {
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
