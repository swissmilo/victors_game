'use client';

import { useEffect, useState, useCallback } from 'react';

type KeyState = Record<string, boolean>;

export function useKeyboard() {
  const [keys, setKeys] = useState<KeyState>({});

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Prevent default for game controls
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft'].includes(event.code)) {
      event.preventDefault();
    }
    
    setKeys((prev) => ({ ...prev, [event.code]: true }));
  }, []);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    setKeys((prev) => ({ ...prev, [event.code]: false }));
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return keys;
}
