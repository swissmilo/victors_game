'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, BLOOD_RAIN_COUNTDOWN, TSUNAMI_COUNTDOWN } from '@/stores';

// Blood rain timing configuration
const FADE_IN_DURATION = 3;     // Seconds to fade in
const ACTIVE_DURATION = 15;     // Seconds of active rain
const FADE_OUT_DURATION = 3;    // Seconds to fade out

// Rain particle configuration
const RAIN_COUNT = 5000;
const RAIN_AREA = 100;          // Area around player
const RAIN_HEIGHT = 50;         // Height of rain column
const RAIN_SPEED = 30;          // Fall speed

// Pre-generate random values outside component to avoid impure render
function generateRainData() {
  const pos = new Float32Array(RAIN_COUNT * 3);
  const vel = new Float32Array(RAIN_COUNT);
  
  for (let i = 0; i < RAIN_COUNT; i++) {
    pos[i * 3] = (Math.random() - 0.5) * RAIN_AREA;
    pos[i * 3 + 1] = Math.random() * RAIN_HEIGHT;
    pos[i * 3 + 2] = (Math.random() - 0.5) * RAIN_AREA;
    vel[i] = RAIN_SPEED + Math.random() * 10;
  }
  
  return { positions: pos, velocities: vel };
}

// Generate once at module load
const rainData = generateRainData();

// Create material once at module level
const rainMaterial = new THREE.PointsMaterial({
  color: 0x8b0000,  // Dark red
  size: 0.3,
  transparent: true,
  opacity: 0,
  sizeAttenuation: true,
});

export function BloodRainSystem() {
  const bloodRain = useGameStore((state) => state.bloodRain);
  const updateBloodRain = useGameStore((state) => state.updateBloodRain);
  const isPlaying = useGameStore((state) => state.isPlaying);
  const currentCatastrophe = useGameStore((state) => state.currentCatastrophe);
  const switchToNextCatastrophe = useGameStore((state) => state.switchToNextCatastrophe);
  const updateTsunami = useGameStore((state) => state.updateTsunami);
  const playerPosition = useGameStore((state) => state.playerPosition);
  
  const { scene } = useThree();
  const phaseTimer = useRef(0);
  const pointsRef = useRef<THREE.Points>(null);
  const originalFogColor = useRef<THREE.Color | null>(null);
  
  // Reset opacity on mount
  useEffect(() => {
    rainMaterial.opacity = 0;
  }, []);
  
  useFrame((_, delta) => {
    if (!isPlaying) return;
    
    // Only run when blood rain is the current catastrophe
    if (currentCatastrophe !== 'blood_rain') {
      // Reset intensity when not active
      if (bloodRain.intensity > 0) {
        updateBloodRain({ intensity: 0 });
      }
      return;
    }
    
    const { phase, countdown } = bloodRain;
    
    switch (phase) {
      case 'countdown': {
        // Count down to blood rain
        const newCountdown = countdown - delta;
        if (newCountdown <= 0) {
          updateBloodRain({ phase: 'starting', countdown: 0 });
          phaseTimer.current = 0;
          // Store original fog color
          if (scene.fog && scene.fog instanceof THREE.Fog) {
            originalFogColor.current = scene.fog.color.clone();
          }
        } else {
          updateBloodRain({ countdown: newCountdown });
        }
        break;
      }
      
      case 'starting': {
        // Fade in the blood rain
        phaseTimer.current += delta;
        const progress = Math.min(phaseTimer.current / FADE_IN_DURATION, 1);
        updateBloodRain({ intensity: progress });
        
        if (progress >= 1) {
          updateBloodRain({ phase: 'active' });
          phaseTimer.current = 0;
        }
        break;
      }
      
      case 'active': {
        // Active blood rain
        phaseTimer.current += delta;
        
        if (phaseTimer.current >= ACTIVE_DURATION) {
          updateBloodRain({ phase: 'ending' });
          phaseTimer.current = 0;
        }
        break;
      }
      
      case 'ending': {
        // Fade out
        phaseTimer.current += delta;
        const progress = Math.min(phaseTimer.current / FADE_OUT_DURATION, 1);
        updateBloodRain({ intensity: 1 - progress });
        
        if (progress >= 1) {
          updateBloodRain({
            phase: 'countdown',
            countdown: BLOOD_RAIN_COUNTDOWN,
            intensity: 0,
          });
          phaseTimer.current = 0;
          
          // Switch to tsunami and start its countdown
          switchToNextCatastrophe();
          updateTsunami({
            phase: 'countdown',
            countdown: TSUNAMI_COUNTDOWN,
          });
        }
        break;
      }
    }
    
    // Update fog color based on intensity
    if (scene.fog && scene.fog instanceof THREE.Fog && originalFogColor.current) {
      const bloodColor = new THREE.Color(0x4a0000);  // Dark blood red
      scene.fog.color.copy(originalFogColor.current).lerp(bloodColor, bloodRain.intensity * 0.5);
    }
    
    // Update rain particles
    if (pointsRef.current && bloodRain.intensity > 0) {
      const geometry = pointsRef.current.geometry;
      const posAttr = geometry.attributes.position as THREE.BufferAttribute;
      const posArray = posAttr.array as Float32Array;
      
      // Move rain particles relative to player
      const px = playerPosition[0];
      const pz = playerPosition[2];
      
      for (let i = 0; i < RAIN_COUNT; i++) {
        // Move particle down
        posArray[i * 3 + 1] -= rainData.velocities[i] * delta;
        
        // Reset if below ground - use seeded pseudo-random based on index
        if (posArray[i * 3 + 1] < 0) {
          const seed = (i * 1234.5678) % 1;
          posArray[i * 3] = px + (seed - 0.5) * RAIN_AREA;
          posArray[i * 3 + 1] = RAIN_HEIGHT + seed * 10;
          posArray[i * 3 + 2] = pz + ((i * 9876.5432) % 1 - 0.5) * RAIN_AREA;
        }
      }
      
      posAttr.needsUpdate = true;
      
      // Update position to follow player
      pointsRef.current.position.set(px, 0, pz);
    }
    
    // Update rain opacity
    rainMaterial.opacity = bloodRain.intensity * 0.8;
  });
  
  // Only render when blood rain is active
  const isActive = currentCatastrophe === 'blood_rain' && bloodRain.phase !== 'countdown';
  
  if (!isActive) return null;
  
  return (
    <>
      {/* Rain particles */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[rainData.positions, 3]}
          />
        </bufferGeometry>
        <primitive object={rainMaterial} attach="material" />
      </points>
      
      {/* Red tinted water/blood puddles at ground level */}
      {bloodRain.intensity > 0.3 && (
        <mesh 
          position={[playerPosition[0], 32.1, playerPosition[2]]} 
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[300, 300]} />
          <meshStandardMaterial
            color="#8b0000"
            transparent
            opacity={bloodRain.intensity * 0.4}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
    </>
  );
}
