'use client';

import { useRef, useCallback, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { usePointerLock } from '@/hooks';
import { Scene } from './Scene';
import { Hotbar } from '../ui/Hotbar';
import { Crosshair } from '../ui/Crosshair';
import { TsunamiTimer } from '../ui/TsunamiTimer';
import { UnderwaterOverlay } from '../ui/UnderwaterOverlay';
import { useGameStore } from '@/stores';

export function Game() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isLocked, requestLock, consumeMovement } = usePointerLock(containerRef);
  const setIsPlaying = useGameStore((state) => state.setIsPlaying);
  const isFlying = useGameStore((state) => state.isFlying);

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
          <UnderwaterOverlay />
          <Crosshair />
          <Hotbar />
          <TsunamiTimer />
          
          {/* Flying indicator */}
          {isFlying && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-500/80 text-white text-sm rounded">
              Flying
            </div>
          )}
        </>
      )}
      
      {/* Start screen */}
      {!isLocked && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-center text-white">
            <h1 className="text-4xl font-bold mb-4">Victor&apos;s World</h1>
            <p className="text-xl mb-2">Click to play</p>
            <div className="text-sm text-gray-300 space-y-1">
              <p>WASD - Move | Mouse - Look | 1-9 - Select block</p>
              <p>Space - Jump | Double-tap Space - Toggle fly</p>
              <p>Left Click - Break | Right Click - Place</p>
              <p className="text-yellow-400 mt-2">Survive the Tsunami every 60 seconds!</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
