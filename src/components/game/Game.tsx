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
import { useGameStore, EARTHQUAKE_COUNTDOWN, BLACK_HOLE_COUNTDOWN, TSUNAMI_COUNTDOWN, BLOOD_RAIN_COUNTDOWN, HURRICANE_COUNTDOWN, METEOR_SHOWER_COUNTDOWN, SANDSTORM_COUNTDOWN } from '@/stores';

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
  const tsunami = useGameStore((state) => state.tsunami);
  const bloodRain = useGameStore((state) => state.bloodRain);
  const hurricane = useGameStore((state) => state.hurricane);
  const meteorShower = useGameStore((state) => state.meteorShower);
  const sandstorm = useGameStore((state) => state.sandstorm);
  const currentCatastrophe = useGameStore((state) => state.currentCatastrophe);
  const switchToNextCatastrophe = useGameStore((state) => state.switchToNextCatastrophe);
  const nextCatastrophe = useGameStore((state) => state.nextCatastrophe);
  const updateEarthquake = useGameStore((state) => state.updateEarthquake);
  const updateBlackHole = useGameStore((state) => state.updateBlackHole);
  const updateTsunami = useGameStore((state) => state.updateTsunami);
  const updateBloodRain = useGameStore((state) => state.updateBloodRain);
  const updateHurricane = useGameStore((state) => state.updateHurricane);
  const updateMeteorShower = useGameStore((state) => state.updateMeteorShower);
  const updateSandstorm = useGameStore((state) => state.updateSandstorm);
  const isPlaying = useGameStore((state) => state.isPlaying);

  // Check if current catastrophe is in countdown phase (only then can we skip)
  const isInCountdown = (() => {
    switch (currentCatastrophe) {
      case 'earthquake': return earthquake.phase === 'countdown';
      case 'black_hole': return blackHole.phase === 'countdown';
      case 'tsunami': return tsunami.phase === 'countdown';
      case 'blood_rain': return bloodRain.phase === 'countdown';
      case 'hurricane': return hurricane.phase === 'countdown';
      case 'meteor_shower': return meteorShower.phase === 'countdown';
      case 'sandstorm': return sandstorm.phase === 'countdown';
      default: return false;
    }
  })();
  
  // Determine if earthquake shake should be active
  const isEarthquakeActive = currentCatastrophe === 'earthquake' && earthquake.phase !== 'countdown';
  const shakeClass = isEarthquakeActive 
    ? (earthquake.intensity > 0.5 ? 'animate-shake-strong' : 'animate-shake-mild')
    : '';
  
  // Black hole blackout opacity
  const blackoutOpacity = currentCatastrophe === 'black_hole' ? blackHole.blackoutOpacity : 0;

  // Determine if sandstorm overlay should be active
  const isSandstormActive = currentCatastrophe === 'sandstorm' && sandstorm.phase !== 'countdown';

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

  // Handle "N" key to skip to next catastrophe (only during countdown phase)
  useEffect(() => {
    if (!gameStarted || !isPlaying) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'n' || e.key === 'N') && isInCountdown) {
        // Switch to the next catastrophe
        switchToNextCatastrophe();

        // Reset the new current catastrophe's countdown based on what it will be
        // nextCatastrophe becomes the new current after switching
        const newCurrent = nextCatastrophe;
        switch (newCurrent) {
          case 'earthquake':
            updateEarthquake({ phase: 'countdown', countdown: EARTHQUAKE_COUNTDOWN, intensity: 0, hasDestroyedBlocks: false });
            break;
          case 'black_hole':
            updateBlackHole({ phase: 'countdown', countdown: BLACK_HOLE_COUNTDOWN, intensity: 0, blackoutOpacity: 0, pullForce: [0, 0, 0] });
            break;
          case 'tsunami':
            updateTsunami({ phase: 'countdown', countdown: TSUNAMI_COUNTDOWN, waterLevel: 0 });
            break;
          case 'blood_rain':
            updateBloodRain({ phase: 'countdown', countdown: BLOOD_RAIN_COUNTDOWN, intensity: 0 });
            break;
          case 'hurricane':
            updateHurricane({ phase: 'countdown', countdown: HURRICANE_COUNTDOWN, intensity: 0, hasDestroyedBlocks: false, pullForce: [0, 0, 0] });
            break;
          case 'meteor_shower':
            updateMeteorShower({ phase: 'countdown', countdown: METEOR_SHOWER_COUNTDOWN, intensity: 0, meteorsSpawned: 0 });
            break;
          case 'sandstorm':
            updateSandstorm({ phase: 'countdown', countdown: SANDSTORM_COUNTDOWN, intensity: 0, sandPlaced: 0 });
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameStarted, isPlaying, isInCountdown, nextCatastrophe, switchToNextCatastrophe, updateEarthquake, updateBlackHole, updateTsunami, updateBloodRain, updateHurricane, updateMeteorShower, updateSandstorm]);

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
          {/* Sandstorm yellow tint overlay */}
          {isSandstormActive && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(circle, transparent 30%, rgba(194, 163, 90, ${sandstorm.intensity * 0.5}) 100%)`,
              }}
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
