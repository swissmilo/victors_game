'use client';

import { useMemo, useEffect } from 'react';
import { Sky } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Player } from './Player';
import { World } from './World';
import { BlockSelector } from './BlockSelector';
import { EarthquakeSystem } from './EarthquakeSystem';
import { BlackHoleSystem } from './BlackHoleSystem';
import { TsunamiSystem } from './TsunamiSystem';
import { BloodRainSystem } from './BloodRainSystem';
import { HurricaneSystem } from './HurricaneSystem';
import { MeteorShowerSystem } from './MeteorShowerSystem';
import { SandstormSystem } from './SandstormSystem';
import { GodzillaSystem } from './GodzillaSystem';
import { ZombieSystem } from './ZombieSystem';
import { AnimatronicSystem } from './AnimatronicSystem';
import { BlackHoleParkour } from './BlackHoleParkour';
import { NuclearMissileSystem } from './NuclearMissileSystem';
import { SeaMonsters } from './SeaMonsters';
import { PirateShipSystem } from './PirateShipSystem';
import { FNAFLighting } from './FNAFLighting';
import { useGameStore } from '@/stores';

interface SceneProps {
  isLocked: boolean;
  consumeMovement: () => { x: number; y: number };
  isMobile: boolean;
  consumeLookDelta: () => { x: number; y: number };
  consumeTap: () => { x: number; y: number } | null;
  isHolding: () => boolean;
  holdDuration: () => number;
  isValidHoldForBreak: () => boolean;
  getHoldPosition: () => { x: number; y: number } | null;
}

export function Scene({
  isLocked,
  consumeMovement,
  isMobile,
  consumeLookDelta,
  consumeTap,
  isHolding,
  holdDuration,
  isValidHoldForBreak,
  getHoldPosition,
}: SceneProps) {
  // On mobile, controls are always active; on desktop, only when pointer is locked
  const controlsActive = isMobile || isLocked;

  // Get sandstorm state for sky darkening
  const sandstorm = useGameStore((state) => state.sandstorm);
  const currentCatastrophe = useGameStore((state) => state.currentCatastrophe);
  const isSandstormActive = currentCatastrophe === 'sandstorm' && sandstorm.phase !== 'countdown';
  const sandstormIntensity = isSandstormActive ? sandstorm.intensity : 0;

  // Black hole parkour mode
  const isInBlackHoleParkour = useGameStore((state) => state.isInBlackHoleParkour);

  // Set background color based on parkour mode
  const { scene } = useThree();
  useEffect(() => {
    if (isInBlackHoleParkour) {
      scene.background = new THREE.Color(0x000000); // Pure black
    } else {
      scene.background = null; // Let Sky component handle it
    }
  }, [isInBlackHoleParkour, scene]);

  // Calculate sky/lighting adjustments based on sandstorm
  const skySettings = useMemo(() => {
    // During sandstorm, lower the sun to create a darker, more orange sky
    const baseSunY = 100;
    const sunY = baseSunY - (sandstormIntensity * 80); // Lower sun during sandstorm

    // Ambient light dims and becomes more yellow during sandstorm
    const ambientIntensity = 1.0 - (sandstormIntensity * 0.5);

    // Hemisphere light adjustments
    const hemiIntensity = 0.5 - (sandstormIntensity * 0.3);

    // Directional light dims
    const dirIntensity = 0.5 - (sandstormIntensity * 0.3);

    return {
      sunPosition: [100, sunY, 100] as [number, number, number],
      ambientIntensity,
      hemiIntensity,
      dirIntensity,
    };
  }, [sandstormIntensity]);

  return (
    <>
      {/* Lighting - bright ambient for Minecraft-like flat shading */}
      <ambientLight
        intensity={skySettings.ambientIntensity}
        color={sandstormIntensity > 0 ? '#c4a060' : '#ffffff'}
      />
      <directionalLight
        position={[100, 200, 100]}
        intensity={skySettings.dirIntensity}
        color={sandstormIntensity > 0 ? '#d4a050' : '#ffffff'}
      />
      <hemisphereLight
        args={[
          sandstormIntensity > 0 ? '#8b7355' : '#87CEEB',
          '#545454',
          skySettings.hemiIntensity
        ]}
      />

      {/* Sky - hide in parkour mode */}
      {!isInBlackHoleParkour && (
        <Sky
          distance={450000}
          sunPosition={skySettings.sunPosition}
          inclination={0.6}
          azimuth={0.25}
        />
      )}

      {/* Fog for distance - black in parkour, normal otherwise */}
      <fog attach="fog" args={[isInBlackHoleParkour ? '#000000' : '#87CEEB', isInBlackHoleParkour ? 10 : 100, isInBlackHoleParkour ? 50 : 180]} />
      
      {/* Player controller */}
      <Player 
        isLocked={controlsActive} 
        consumeMovement={consumeMovement}
        isMobile={isMobile}
        consumeLookDelta={consumeLookDelta}
      />
      
      {/* Block selection/interaction - disabled in parkour */}
      <BlockSelector
        enabled={controlsActive && !isInBlackHoleParkour}
        isMobile={isMobile}
        consumeTap={consumeTap}
        isHolding={isHolding}
        holdDuration={holdDuration}
        isValidHoldForBreak={isValidHoldForBreak}
        getHoldPosition={getHoldPosition}
      />
      
      {/* Black Hole Parkour - only shown when in parkour mode */}
      {isInBlackHoleParkour && <BlackHoleParkour />}

      {/* FNAF Pizzeria interior lighting */}
      {!isInBlackHoleParkour && <FNAFLighting />}

      {/* Pirate ship - always present */}
      {!isInBlackHoleParkour && <PirateShipSystem />}

      {/* Voxel world - hidden during parkour */}
      {!isInBlackHoleParkour && <World renderDistance={8} unloadDistance={12} />}

      {/* Catastrophe systems - disabled during parkour */}
      {!isInBlackHoleParkour && (
        <>
          <EarthquakeSystem />
          <BlackHoleSystem />
          <TsunamiSystem />
          {/* <SeaMonsters /> */}
          <BloodRainSystem />
          <HurricaneSystem />
          <MeteorShowerSystem />
          <SandstormSystem />
          <GodzillaSystem />
          <ZombieSystem />
          <AnimatronicSystem />
          <NuclearMissileSystem />
        </>
      )}
    </>
  );
}
