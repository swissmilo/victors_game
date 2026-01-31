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
    <div className="absolute inset-0 flex items-center justify-center bg-black/80">
      <div className="text-center text-white max-w-md">
        <h1 className="text-5xl font-bold mb-2">Victor&apos;s World</h1>
        <p className="text-gray-400 mb-8">A Minecraft-style Tsunami Survival Game</p>
        
        <div className="space-y-4">
          {hasSave && (
            <button
              onClick={handleContinue}
              onTouchEnd={(e) => {
                e.stopPropagation();
                handleContinue();
              }}
              className="w-full px-8 py-5 bg-green-600 hover:bg-green-500 active:bg-green-400 text-white text-xl font-bold rounded-lg transition-colors touch-manipulation"
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
            className="w-full px-8 py-5 bg-blue-600 hover:bg-blue-500 active:bg-blue-400 text-white text-xl font-bold rounded-lg transition-colors touch-manipulation"
          >
            {hasSave ? 'New World' : 'Start New World'}
          </button>
        </div>
        
        <div className="mt-8 text-sm text-gray-400 space-y-1">
          {isMobile ? (
            <>
              <p>Drag - Look around | Joystick - Move</p>
              <p>Tap - Place block | Hold - Break block</p>
              <p className="text-yellow-400 mt-2">Survive the Catastrophes!</p>
            </>
          ) : (
            <>
              <p>WASD - Move | Mouse - Look | 1-9 - Select block</p>
              <p>Space - Jump | Double-tap Space - Toggle fly</p>
              <p>Left Click - Break | Right Click - Place</p>
              <p className="text-yellow-400 mt-2">Survive the Catastrophes!</p>
            </>
          )}
        </div>
        
        {hasSave && (
          <p className="mt-4 text-xs text-gray-500">
            Your world is automatically saved as you play
          </p>
        )}
      </div>
    </div>
  );
}
