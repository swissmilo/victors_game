'use client';

import { useRef, useCallback, Suspense, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { usePointerLock, useTouch } from '@/hooks';
import { Scene } from './Scene';
import { Hotbar } from '../ui/Hotbar';
import { Crosshair } from '../ui/Crosshair';
import { CatastropheTimer } from '../ui/CatastropheTimer';
import { UnderwaterOverlay } from '../ui/UnderwaterOverlay';
import { MobileControls } from '../ui/MobileControls';
import { WorldMenu } from '../ui/WorldMenu';
import { useGameStore } from '@/stores';

// Detect if running on touch device
const isTouchDevice = () => {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

// Auto-save interval in milliseconds (30 seconds)
const AUTO_SAVE_INTERVAL = 30000;

export function Game() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showMenu, setShowMenu] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);
  
  // Detect mobile - use lazy initial state to avoid hydration mismatch
  const [isMobile] = useState(() => isTouchDevice());
  
  const { isLocked, requestLock, consumeMovement } = usePointerLock(containerRef);
  const { consumeLookDelta, consumeTap, isHolding, holdDuration, isValidHoldForBreak, getHoldPosition } = useTouch(containerRef);
  const setIsPlaying = useGameStore((state) => state.setIsPlaying);
  const isFlying = useGameStore((state) => state.isFlying);
  const saveGame = useGameStore((state) => state.saveGame);
  const chunks = useGameStore((state) => state.chunks);
  const earthquake = useGameStore((state) => state.earthquake);
  const blackHole = useGameStore((state) => state.blackHole);
  const currentCatastrophe = useGameStore((state) => state.currentCatastrophe);
  
  // Determine if earthquake shake should be active
  const isEarthquakeActive = currentCatastrophe === 'earthquake' && earthquake.phase !== 'countdown';
  const shakeClass = isEarthquakeActive 
    ? (earthquake.intensity > 0.5 ? 'animate-shake-strong' : 'animate-shake-mild')
    : '';
  
  // Black hole blackout opacity
  const blackoutOpacity = currentCatastrophe === 'black_hole' ? blackHole.blackoutOpacity : 0;

  // Handle starting the game from menu
  const handleStartGame = useCallback(() => {
    setShowMenu(false);
    setGameStarted(true);
  }, []);

  // Handle clicking to lock pointer when game is active (desktop)
  // On mobile, we don't need pointer lock
  const handleClick = useCallback(() => {
    if (gameStarted && !showMenu) {
      if (isMobile) {
        // On mobile, just set playing on first touch
        setIsPlaying(true);
      } else if (!isLocked) {
        requestLock();
        setIsPlaying(true);
      }
    }
  }, [gameStarted, isLocked, showMenu, requestLock, setIsPlaying, isMobile]);

  // Pause/unpause game based on pointer lock state (desktop only)
  useEffect(() => {
    if (!gameStarted || showMenu || isMobile) return;
    
    // On desktop, game is paused when pointer is unlocked
    setIsPlaying(isLocked);
  }, [gameStarted, showMenu, isLocked, isMobile, setIsPlaying]);

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
        <div className={`w-full h-full ${shakeClass}`}>
          <Canvas
            camera={{ fov: 75, near: 0.1, far: 1000 }}
            gl={{ antialias: true }}
          >
            <Suspense fallback={null}>
              <Scene 
                isLocked={isLocked} 
                consumeMovement={consumeMovement}
                isMobile={isMobile}
                consumeLookDelta={consumeLookDelta}
                consumeTap={consumeTap}
                isHolding={isHolding}
                holdDuration={holdDuration}
                isValidHoldForBreak={isValidHoldForBreak}
                getHoldPosition={getHoldPosition}
              />
            </Suspense>
          </Canvas>
          {/* Earthquake vignette overlay */}
          {isEarthquakeActive && (
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(circle, transparent 40%, rgba(139, 69, 19, ${earthquake.intensity * 0.4}) 100%)`,
              }}
            />
          )}
          {/* Black hole blackout overlay */}
          {blackoutOpacity > 0 && (
            <div 
              className="absolute inset-0 pointer-events-none bg-black"
              style={{ opacity: blackoutOpacity }}
            />
          )}
        </div>
      )}
      
      {/* World selection menu */}
      {showMenu && (
        <WorldMenu onStartGame={handleStartGame} />
      )}
      
      {/* UI Overlay - show when locked (desktop) or always on mobile; z-10 so it paints above canvas on iOS */}
      {gameStarted && (isLocked || isMobile) && !showMenu && (
        <div className="absolute inset-0 z-10 pointer-events-none">
          <UnderwaterOverlay />
          <Crosshair hidden={isMobile} />
          <Hotbar isMobile={isMobile} />
          <CatastropheTimer />
          {isMobile && <MobileControls />}
          {isFlying && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-500/80 text-white text-sm rounded">
              Flying
            </div>
          )}
        </div>
      )}
      
      {/* Click to resume when pointer unlocked but game started (desktop only) */}
      {gameStarted && !isLocked && !showMenu && !isMobile && (
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
