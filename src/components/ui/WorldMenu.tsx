'use client';

import { useMemo, useState } from 'react';
import { useGameStore } from '@/stores';

interface WorldMenuProps {
  onStartGame: () => void;
}

// Detect touch device
const isTouchDevice = () => {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

export function WorldMenu({ onStartGame }: WorldMenuProps) {
  const hasExistingSave = useGameStore((state) => state.hasExistingSave);
  const loadGame = useGameStore((state) => state.loadGame);
  const resetWorld = useGameStore((state) => state.resetWorld);
  const [isMobile] = useState(() => isTouchDevice());
  
  // Check for existing save (computed once on mount)
  const hasSave = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return hasExistingSave();
  }, [hasExistingSave]);
  
  const handleContinue = () => {
    const success = loadGame();
    if (success) {
      onStartGame();
    } else {
      // If load fails, start new game
      resetWorld();
      onStartGame();
    }
  };
  
  const handleNewWorld = () => {
    resetWorld();
    onStartGame();
  };
  
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-gray-900 via-black to-gray-900">
      <div className="text-center text-white max-w-lg px-6">
        {/* Title */}
        <h1 className="text-6xl md:text-7xl font-black mb-12 tracking-tight">
          <span className="bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 bg-clip-text text-transparent">
            Victor&apos;s World
          </span>
        </h1>
        
        {/* Buttons */}
        <div className="flex flex-col gap-1 mb-10">
          {hasSave && (
            <button
              onClick={handleContinue}
              onTouchEnd={(e) => {
                e.stopPropagation();
                handleContinue();
              }}
              className="w-full px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 active:from-green-400 active:to-emerald-400 text-white text-xl font-bold rounded-xl transition-all shadow-lg shadow-green-900/30 touch-manipulation"
            >
              Continue World
            </button>
          )}
          
          <button
            onClick={handleNewWorld}
            onTouchEnd={(e) => {
              e.stopPropagation();
              handleNewWorld();
            }}
            className="w-full px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:from-blue-400 active:to-indigo-400 text-white text-xl font-bold rounded-xl transition-all shadow-lg shadow-blue-900/30 touch-manipulation"
          >
            {hasSave ? 'New World' : 'Start New World'}
          </button>
        </div>
        
        {/* Tagline */}
        <p className="text-amber-400 font-semibold text-lg mb-8">
          Survive the Catastrophes!
        </p>
        
        {/* Controls */}
        <div className="text-sm text-gray-500 space-y-1">
          {isMobile ? (
            <>
              <p>Drag to look • Joystick to move</p>
              <p>Tap to place • Hold to break</p>
            </>
          ) : (
            <>
              <p>WASD to move • Mouse to look • 1-9 to select</p>
              <p>Click to break/place • Double-space to fly</p>
            </>
          )}
        </div>
        
        {hasSave && (
          <p className="mt-6 text-xs text-gray-600">
            Your world is automatically saved
          </p>
        )}
      </div>
    </div>
  );
}
