'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, BLACK_HOLE_COUNTDOWN, TSUNAMI_COUNTDOWN } from '@/stores';

// Black hole timing configuration
const APPEARING_DURATION = 2;     // Seconds for black hole to form
const PULLING_DURATION = 6;       // Seconds of pulling the player
const CONSUMING_DURATION = 1;     // Seconds of final "consume" animation
const BLACKOUT_DURATION = 2;      // Seconds of screen blackout

// Black hole distance from player when spawning
const SPAWN_DISTANCE = 30;

// Black hole visual properties
const BLACK_HOLE_SIZE = 5;
const ACCRETION_DISK_SIZE = 12;

export function BlackHoleSystem() {
  const blackHole = useGameStore((state) => state.blackHole);
  const updateBlackHole = useGameStore((state) => state.updateBlackHole);
  const playerPosition = useGameStore((state) => state.playerPosition);
  const setRespawnPosition = useGameStore((state) => state.setRespawnPosition);
  const isPlaying = useGameStore((state) => state.isPlaying);
  const currentCatastrophe = useGameStore((state) => state.currentCatastrophe);
  const switchToNextCatastrophe = useGameStore((state) => state.switchToNextCatastrophe);
  const updateTsunami = useGameStore((state) => state.updateTsunami);
  
  // Store player's original position when black hole starts
  const originalPositionRef = useRef<[number, number, number] | null>(null);
  
  const phaseTimer = useRef(0);
  const meshRef = useRef<THREE.Mesh>(null);
  const diskRef = useRef<THREE.Mesh>(null);
  const outerRingRef = useRef<THREE.Mesh>(null);
  const innerRingRef = useRef<THREE.Mesh>(null);
  const rotationRef = useRef(0);
  
  // Create accretion disk geometry
  const diskGeometry = useMemo(() => {
    return new THREE.RingGeometry(BLACK_HOLE_SIZE * 0.8, ACCRETION_DISK_SIZE, 64);
  }, []);
  
  useFrame((_, delta) => {
    if (!isPlaying) return;
    
    // Only run when black hole is the current catastrophe
    if (currentCatastrophe !== 'black_hole') {
      return;
    }
    
    const { phase, countdown } = blackHole;
    
    switch (phase) {
      case 'countdown': {
        // Count down to black hole
        const newCountdown = countdown - delta;
        if (newCountdown <= 0) {
          // Calculate spawn position 30 blocks in front of player (in their facing direction)
          const angle = Math.random() * Math.PI * 2;
          const spawnX = playerPosition[0] + Math.cos(angle) * SPAWN_DISTANCE;
          const spawnZ = playerPosition[2] + Math.sin(angle) * SPAWN_DISTANCE;
          const spawnY = playerPosition[1] + 10; // Slightly above player
          
          updateBlackHole({ 
            phase: 'appearing', 
            countdown: 0,
            position: [spawnX, spawnY, spawnZ],
            intensity: 0,
          });
          phaseTimer.current = 0;
        } else {
          updateBlackHole({ countdown: newCountdown });
        }
        break;
      }
      
      case 'appearing': {
        // Black hole forms and grows
        phaseTimer.current += delta;
        const progress = Math.min(phaseTimer.current / APPEARING_DURATION, 1);
        updateBlackHole({ intensity: progress });
        
        // Store original position when black hole starts appearing
        if (originalPositionRef.current === null) {
          originalPositionRef.current = [...playerPosition] as [number, number, number];
        }
        
        if (progress >= 1) {
          updateBlackHole({ phase: 'pulling', intensity: 1 });
          phaseTimer.current = 0;
        }
        break;
      }
      
      case 'pulling': {
        // Player is being pulled toward black hole (handled by Player component)
        phaseTimer.current += delta;
        
        if (phaseTimer.current >= PULLING_DURATION) {
          updateBlackHole({ phase: 'consuming' });
          phaseTimer.current = 0;
        }
        break;
      }
      
      case 'consuming': {
        // Final consume - rapid pull (handled by Player) and start blackout
        phaseTimer.current += delta;
        const progress = Math.min(phaseTimer.current / CONSUMING_DURATION, 1);
        
        // Start blackout
        updateBlackHole({ blackoutOpacity: progress });
        
        if (progress >= 1) {
          updateBlackHole({ phase: 'blackout', blackoutOpacity: 1 });
          phaseTimer.current = 0;
        }
        break;
      }
      
      case 'blackout': {
        // Screen is black, then reset
        phaseTimer.current += delta;
        
        if (phaseTimer.current >= BLACKOUT_DURATION) {
          // Respawn player at original position (above ground)
          if (originalPositionRef.current) {
            const [origX, , origZ] = originalPositionRef.current;
            // Spawn at original X/Z but at a safe height above ground
            setRespawnPosition([origX, 50, origZ]);
          }
          originalPositionRef.current = null;
          
          // Reset and transition to next catastrophe
          updateBlackHole({
            phase: 'countdown',
            countdown: BLACK_HOLE_COUNTDOWN,
            intensity: 0,
            blackoutOpacity: 0,
            position: [0, 40, 0],
            pullForce: [0, 0, 0],
          });
          phaseTimer.current = 0;
          
          // Switch to tsunami
          switchToNextCatastrophe();
          updateTsunami({
            phase: 'countdown',
            countdown: TSUNAMI_COUNTDOWN,
          });
        }
        break;
      }
    }
    
    // Rotate accretion disk and rings
    rotationRef.current += delta * 2;
    if (diskRef.current) {
      diskRef.current.rotation.z = rotationRef.current;
    }
    if (outerRingRef.current) {
      outerRingRef.current.rotation.z = rotationRef.current * 0.5;
    }
    if (innerRingRef.current) {
      innerRingRef.current.rotation.z = -rotationRef.current;
    }
  });
  
  // Only render when black hole is visible
  const isVisible = currentCatastrophe === 'black_hole' && 
    blackHole.phase !== 'countdown' && 
    blackHole.phase !== 'blackout';
  
  if (!isVisible) return null;
  
  const scale = blackHole.intensity;
  
  return (
    <group position={blackHole.position}>
      {/* Core black sphere */}
      <mesh ref={meshRef} scale={[scale, scale, scale]}>
        <sphereGeometry args={[BLACK_HOLE_SIZE, 32, 32]} />
        <meshBasicMaterial color="black" />
      </mesh>
      
      {/* Accretion disk */}
      <mesh 
        ref={diskRef} 
        rotation={[Math.PI / 2, 0, 0]}
        scale={[scale, scale, scale]}
      >
        <primitive object={diskGeometry} attach="geometry" />
        <meshBasicMaterial 
          color="#ff6600" 
          side={THREE.DoubleSide}
          transparent
          opacity={0.8}
        />
      </mesh>
      
      {/* Outer glow ring */}
      <mesh 
        ref={outerRingRef}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[scale, scale, scale]}
      >
        <ringGeometry args={[ACCRETION_DISK_SIZE, ACCRETION_DISK_SIZE * 1.2, 64]} />
        <meshBasicMaterial 
          color="#ff3300" 
          side={THREE.DoubleSide}
          transparent
          opacity={0.5}
        />
      </mesh>
      
      {/* Inner hot ring */}
      <mesh 
        ref={innerRingRef}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[scale, scale, scale]}
      >
        <ringGeometry args={[BLACK_HOLE_SIZE * 0.5, BLACK_HOLE_SIZE * 0.8, 64]} />
        <meshBasicMaterial 
          color="#ffff00" 
          side={THREE.DoubleSide}
          transparent
          opacity={0.9}
        />
      </mesh>
    </group>
  );
}
