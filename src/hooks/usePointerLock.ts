'use client';

import { useEffect, useState, useCallback, useRef, RefObject } from 'react';

export function usePointerLock(elementRef: RefObject<HTMLElement | null>) {
  const [isLocked, setIsLocked] = useState(false);
  
  // Use refs for movement to avoid state update timing issues
  const movementRef = useRef({ x: 0, y: 0 });

  const requestLock = useCallback(() => {
    if (elementRef.current) {
      elementRef.current.requestPointerLock();
    }
  }, [elementRef]);

  const exitLock = useCallback(() => {
    document.exitPointerLock();
  }, []);

  useEffect(() => {
    const handleLockChange = () => {
      const locked = document.pointerLockElement === elementRef.current;
      setIsLocked(locked);
      if (!locked) {
        // Reset movement when unlocking
        movementRef.current = { x: 0, y: 0 };
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement === elementRef.current) {
        // Accumulate movement
        movementRef.current.x += event.movementX;
        movementRef.current.y += event.movementY;
      }
    };

    document.addEventListener('pointerlockchange', handleLockChange);
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('pointerlockchange', handleLockChange);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [elementRef]);

  // Consume and reset movement - called each frame
  const consumeMovement = useCallback(() => {
    const currentMovement = { ...movementRef.current };
    movementRef.current = { x: 0, y: 0 };
    return currentMovement;
  }, []);

  return { isLocked, requestLock, exitLock, consumeMovement };
}
