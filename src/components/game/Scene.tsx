'use client';

import { useMemo } from 'react';
import { Sky } from '@react-three/drei';
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

      {/* Sky */}
      <Sky
        distance={450000}
        sunPosition={skySettings.sunPosition}
        inclination={0.6}
        azimuth={0.25}
      />

      {/* Fog for distance - starts at 100 blocks, fades to 180 */}
      <fog attach="fog" args={['#87CEEB', 100, 180]} />
      
      {/* Player controller */}
      <Player 
        isLocked={controlsActive} 
        consumeMovement={consumeMovement}
        isMobile={isMobile}
        consumeLookDelta={consumeLookDelta}
      />
      
      {/* Block selection/interaction */}
      <BlockSelector 
        enabled={controlsActive}
        isMobile={isMobile}
        consumeTap={consumeTap}
        isHolding={isHolding}
        holdDuration={holdDuration}
        isValidHoldForBreak={isValidHoldForBreak}
        getHoldPosition={getHoldPosition}
      />
      
      {/* Voxel world - render distance 8 = ~128 blocks, unload at 12 */}
      <World renderDistance={8} unloadDistance={12} />
      
      {/* Catastrophe systems */}
      <EarthquakeSystem />
      <BlackHoleSystem />
      <TsunamiSystem />
      <BloodRainSystem />
      <HurricaneSystem />
      <MeteorShowerSystem />
      <SandstormSystem />
    </>
  );
}
