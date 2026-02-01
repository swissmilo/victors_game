'use client';

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
  
  return (
    <>
      {/* Lighting - bright ambient for Minecraft-like flat shading */}
      <ambientLight intensity={1.0} />
      <directionalLight
        position={[100, 200, 100]}
        intensity={0.5}
      />
      <hemisphereLight
        args={['#87CEEB', '#545454', 0.5]}
      />
      
      {/* Sky */}
      <Sky 
        distance={450000}
        sunPosition={[100, 100, 100]}
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
    </>
  );
}
