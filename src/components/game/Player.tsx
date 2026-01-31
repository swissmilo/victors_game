'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, CapsuleCollider } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { useKeyboard } from '@/hooks';
import { useGameStore } from '@/stores';

const MOVE_SPEED = 5;
const JUMP_FORCE = 8;
const MOUSE_SENSITIVITY = 0.002;
const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.3;

interface PlayerProps {
  isLocked: boolean;
  consumeMovement: () => { x: number; y: number };
}

export function Player({ isLocked, consumeMovement }: PlayerProps) {
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const { camera } = useThree();
  const keys = useKeyboard();
  
  const setPlayerPosition = useGameStore((state) => state.setPlayerPosition);
  const setHotbarSelection = useGameStore((state) => state.setHotbarSelection);
  
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const isGroundedRef = useRef(false);
  const velocityRef = useRef(new THREE.Vector3());
  const lastVelocityY = useRef(0);

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

  useFrame(() => {
    if (!rigidBodyRef.current) return;

    // Get mouse movement for camera rotation
    if (isLocked) {
      const { x: movementX, y: movementY } = consumeMovement();
      
      yawRef.current -= movementX * MOUSE_SENSITIVITY;
      pitchRef.current -= movementY * MOUSE_SENSITIVITY;
      pitchRef.current = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitchRef.current));
    }

    // Calculate movement direction
    const direction = new THREE.Vector3();
    
    if (keys['KeyW']) direction.z -= 1;
    if (keys['KeyS']) direction.z += 1;
    if (keys['KeyA']) direction.x -= 1;
    if (keys['KeyD']) direction.x += 1;

    direction.normalize();
    direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), yawRef.current);
    direction.multiplyScalar(MOVE_SPEED);

    // Get current velocity
    const currentVel = rigidBodyRef.current.linvel();
    velocityRef.current.set(direction.x, currentVel.y, direction.z);

    // Ground detection: check if velocity has settled (player is resting on ground)
    // If falling velocity has stopped or reversed, player is grounded
    if (currentVel.y >= -0.1 && currentVel.y <= 0.1 && lastVelocityY.current <= 0) {
      isGroundedRef.current = true;
    } else if (currentVel.y > 0.5) {
      // Player is moving upward (jumping)
      isGroundedRef.current = false;
    }
    lastVelocityY.current = currentVel.y;

    // Jump
    if (keys['Space'] && isGroundedRef.current) {
      velocityRef.current.y = JUMP_FORCE;
      isGroundedRef.current = false;
    }

    // Apply velocity
    rigidBodyRef.current.setLinvel(
      { x: velocityRef.current.x, y: velocityRef.current.y, z: velocityRef.current.z },
      true
    );

    // Update camera position and rotation
    const playerPos = rigidBodyRef.current.translation();
    camera.position.set(playerPos.x, playerPos.y + 0.6, playerPos.z);
    
    // Set camera rotation using quaternion to avoid direct mutation
    const euler = new THREE.Euler(pitchRef.current, yawRef.current, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);

    // Update store
    setPlayerPosition([playerPos.x, playerPos.y, playerPos.z]);
  });

  // Spawn position - center of chunk 0,0 at y=50 (above terrain)
  const spawnPosition: [number, number, number] = [8, 50, 8];

  return (
    <RigidBody
      ref={rigidBodyRef}
      position={spawnPosition}
      enabledRotations={[false, false, false]}
      colliders={false}
      mass={1}
      linearDamping={0.5}
      angularDamping={1}
      lockRotations
    >
      <CapsuleCollider args={[PLAYER_HEIGHT / 2 - PLAYER_RADIUS, PLAYER_RADIUS]} />
    </RigidBody>
  );
}
