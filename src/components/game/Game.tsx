'use client';

import { useRef, useCallback, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { usePointerLock } from '@/hooks';
import { Scene } from './Scene';
import { Hotbar } from '../ui/Hotbar';
import { Crosshair } from '../ui/Crosshair';
import { useGameStore } from '@/stores';

export function Game() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isLocked, requestLock, consumeMovement } = usePointerLock(containerRef);
  const setIsPlaying = useGameStore((state) => state.setIsPlaying);

  const handleClick = useCallback(() => {
    if (!isLocked) {
      requestLock();
      setIsPlaying(true);
    }
  }, [isLocked, requestLock, setIsPlaying]);

  return (
    <div 
      ref={containerRef}
      className="w-full h-screen relative cursor-pointer"
      onClick={handleClick}
    >
      <Canvas
        shadows
        camera={{ fov: 75, near: 0.1, far: 1000 }}
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          <Scene isLocked={isLocked} consumeMovement={consumeMovement} />
        </Suspense>
      </Canvas>
      
      {/* UI Overlay */}
      {isLocked && (
        <>
          <Crosshair />
          <Hotbar />
        </>
      )}
      
      {/* Start screen */}
      {!isLocked && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-center text-white">
            <h1 className="text-4xl font-bold mb-4">Voxel World</h1>
            <p className="text-xl mb-2">Click to play</p>
            <p className="text-sm text-gray-300">
              WASD - Move | Space - Jump | Mouse - Look | 1-9 - Select block
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
