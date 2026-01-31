'use client';

import { useRef, useCallback, Suspense, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { usePointerLock } from '@/hooks';
import { Scene } from './Scene';
import { Hotbar } from '../ui/Hotbar';
import { Crosshair } from '../ui/Crosshair';
import { TsunamiTimer } from '../ui/TsunamiTimer';
import { UnderwaterOverlay } from '../ui/UnderwaterOverlay';
import { WorldMenu } from '../ui/WorldMenu';
import { useGameStore } from '@/stores';

// Auto-save interval in milliseconds (30 seconds)
const AUTO_SAVE_INTERVAL = 30000;

export function Game() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showMenu, setShowMenu] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);
  
  const { isLocked, requestLock, consumeMovement } = usePointerLock(containerRef);
  const setIsPlaying = useGameStore((state) => state.setIsPlaying);
  const isFlying = useGameStore((state) => state.isFlying);
  const saveGame = useGameStore((state) => state.saveGame);
  const chunks = useGameStore((state) => state.chunks);

  // Handle starting the game from menu
  const handleStartGame = useCallback(() => {
    setShowMenu(false);
    setGameStarted(true);
  }, []);

  // Handle clicking to lock pointer when game is active
  const handleClick = useCallback(() => {
    if (gameStarted && !isLocked && !showMenu) {
      requestLock();
      setIsPlaying(true);
    }
  }, [gameStarted, isLocked, showMenu, requestLock, setIsPlaying]);

  // Auto-save every 30 seconds when playing
  useEffect(() => {
    if (!gameStarted || showMenu) return;
    
    const saveInterval = setInterval(() => {
      if (chunks.size > 0) {
        saveGame();
      }
    }, AUTO_SAVE_INTERVAL);
    
    return () => clearInterval(saveInterval);
  }, [gameStarted, showMenu, saveGame, chunks.size]);

  // Save when losing focus or closing tab
  useEffect(() => {
    if (!gameStarted) return;
    
    const handleBeforeUnload = () => {
      if (chunks.size > 0) {
        saveGame();
      }
    };
    
    const handleVisibilityChange = () => {
      if (document.hidden && chunks.size > 0) {
        saveGame();
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [gameStarted, saveGame, chunks.size]);

  return (
    <div 
      ref={containerRef}
      className="w-full h-screen relative cursor-pointer"
      onClick={handleClick}
    >
      {gameStarted && (
        <Canvas
          camera={{ fov: 75, near: 0.1, far: 1000 }}
          gl={{ antialias: true }}
        >
          <Suspense fallback={null}>
            <Scene isLocked={isLocked} consumeMovement={consumeMovement} />
          </Suspense>
        </Canvas>
      )}
      
      {/* World selection menu */}
      {showMenu && (
        <WorldMenu onStartGame={handleStartGame} />
      )}
      
      {/* UI Overlay */}
      {gameStarted && isLocked && (
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
      
      {/* Click to resume when pointer unlocked but game started */}
      {gameStarted && !isLocked && !showMenu && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-center text-white">
            <h2 className="text-3xl font-bold mb-4">Game Paused</h2>
            <p className="text-xl mb-2">Click to resume</p>
            <p className="text-sm text-gray-400">Your world is automatically saved</p>
          </div>
        </div>
      )}
    </div>
  );
}
