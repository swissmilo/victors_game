'use client';

import { Sky } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { Player } from './Player';
import { World } from './World';

interface SceneProps {
  isLocked: boolean;
  consumeMovement: () => { x: number; y: number };
}

export function Scene({ isLocked, consumeMovement }: SceneProps) {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[50, 100, 50]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={200}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
      />
      
      {/* Sky */}
      <Sky 
        distance={450000}
        sunPosition={[100, 50, 100]}
        inclination={0.5}
        azimuth={0.25}
      />
      
      {/* Fog for distance */}
      <fog attach="fog" args={['#87CEEB', 30, 150]} />
      
      {/* Physics world */}
      <Physics gravity={[0, -20, 0]} debug={false}>
        <Player isLocked={isLocked} consumeMovement={consumeMovement} />
        <World renderDistance={3} />
      </Physics>
    </>
  );
}
