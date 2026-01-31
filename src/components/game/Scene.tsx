'use client';

import { Sky, Stats } from '@react-three/drei';
import { Player } from './Player';
import { World } from './World';
import { BlockSelector } from './BlockSelector';

interface SceneProps {
  isLocked: boolean;
  consumeMovement: () => { x: number; y: number };
}

export function Scene({ isLocked, consumeMovement }: SceneProps) {
  return (
    <>
      {/* Performance stats */}
      <Stats />
      
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[50, 100, 50]}
        intensity={1.0}
      />
      
      {/* Sky */}
      <Sky 
        distance={450000}
        sunPosition={[100, 50, 100]}
        inclination={0.5}
        azimuth={0.25}
      />
      
      {/* Fog for distance */}
      <fog attach="fog" args={['#87CEEB', 50, 200]} />
      
      {/* Player controller */}
      <Player isLocked={isLocked} consumeMovement={consumeMovement} />
      
      {/* Block selection/interaction */}
      <BlockSelector enabled={isLocked} />
      
      {/* Voxel world */}
      <World renderDistance={2} />
    </>
  );
}
