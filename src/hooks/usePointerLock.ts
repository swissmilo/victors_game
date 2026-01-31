'use client';

import { useEffect, useState, useCallback, RefObject } from 'react';

export function usePointerLock(elementRef: RefObject<HTMLElement | null>) {
  const [isLocked, setIsLocked] = useState(false);
  const [movement, setMovement] = useState({ x: 0, y: 0 });

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
      setIsLocked(document.pointerLockElement === elementRef.current);
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement === elementRef.current) {
        setMovement({ x: event.movementX, y: event.movementY });
      }
    };

    document.addEventListener('pointerlockchange', handleLockChange);
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('pointerlockchange', handleLockChange);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [elementRef]);

  // Reset movement after it's been read
  const consumeMovement = useCallback(() => {
    const currentMovement = { ...movement };
    setMovement({ x: 0, y: 0 });
    return currentMovement;
  }, [movement]);

  return { isLocked, requestLock, exitLock, movement, consumeMovement };
}
