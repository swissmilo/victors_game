'use client';

import { useRef, useCallback, useEffect } from 'react';

interface TouchState {
  isLooking: boolean;
  lookDelta: { x: number; y: number };
  isTapping: boolean;
  isHolding: boolean;
  holdDuration: number;
  tapPosition: { x: number; y: number } | null;
}

interface UseTouchReturn {
  touchState: React.MutableRefObject<TouchState>;
  consumeLookDelta: () => { x: number; y: number };
  consumeTap: () => { x: number; y: number } | null;
  isHolding: () => boolean;
  holdDuration: () => number;
}

// Thresholds
const TAP_MAX_DURATION = 200;    // Max ms for a tap
const TAP_MAX_MOVEMENT = 20;     // Max pixels movement for a tap
const HOLD_THRESHOLD = 400;      // Ms to trigger hold
const LOOK_SENSITIVITY = 0.5;    // Touch look sensitivity multiplier

export function useTouch(containerRef: React.RefObject<HTMLElement | null>): UseTouchReturn {
  const touchState = useRef<TouchState>({
    isLooking: false,
    lookDelta: { x: 0, y: 0 },
    isTapping: false,
    isHolding: false,
    holdDuration: 0,
    tapPosition: null,
  });
  
  const touchStartTime = useRef(0);
  const touchStartPos = useRef({ x: 0, y: 0 });
  const lastTouchPos = useRef({ x: 0, y: 0 });
  const holdCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const pendingTap = useRef<{ x: number; y: number } | null>(null);
  
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    
    // Don't capture touches on buttons or interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('[role="button"]')) {
      return;
    }
    
    const touch = e.touches[0];
    touchStartTime.current = Date.now();
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    lastTouchPos.current = { x: touch.clientX, y: touch.clientY };
    
    touchState.current.isLooking = true;
    touchState.current.isHolding = false;
    touchState.current.holdDuration = 0;
    
    // Start checking for hold
    if (holdCheckInterval.current) {
      clearInterval(holdCheckInterval.current);
    }
    holdCheckInterval.current = setInterval(() => {
      const elapsed = Date.now() - touchStartTime.current;
      touchState.current.holdDuration = elapsed;
      
      if (elapsed >= HOLD_THRESHOLD) {
        touchState.current.isHolding = true;
      }
    }, 50);
    
    e.preventDefault();
  }, []);
  
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    
    // Only process if we're looking (started on a valid area)
    if (!touchState.current.isLooking) return;
    
    const touch = e.touches[0];
    const deltaX = (touch.clientX - lastTouchPos.current.x) * LOOK_SENSITIVITY;
    const deltaY = (touch.clientY - lastTouchPos.current.y) * LOOK_SENSITIVITY;
    
    touchState.current.lookDelta.x += deltaX;
    touchState.current.lookDelta.y += deltaY;
    
    lastTouchPos.current = { x: touch.clientX, y: touch.clientY };
    
    e.preventDefault();
  }, []);
  
  const handleTouchEnd = useCallback((e: TouchEvent) => {
    // Only process if we were looking (started on a valid area)
    if (!touchState.current.isLooking) {
      return;
    }
    
    const elapsed = Date.now() - touchStartTime.current;
    const movement = Math.sqrt(
      Math.pow(lastTouchPos.current.x - touchStartPos.current.x, 2) +
      Math.pow(lastTouchPos.current.y - touchStartPos.current.y, 2)
    );
    
    // Check if it was a tap (quick touch with minimal movement)
    if (elapsed < TAP_MAX_DURATION && movement < TAP_MAX_MOVEMENT) {
      pendingTap.current = { 
        x: touchStartPos.current.x, 
        y: touchStartPos.current.y 
      };
      touchState.current.isTapping = true;
    }
    
    // Clear hold check
    if (holdCheckInterval.current) {
      clearInterval(holdCheckInterval.current);
      holdCheckInterval.current = null;
    }
    
    touchState.current.isLooking = false;
    touchState.current.isHolding = false;
    touchState.current.holdDuration = 0;
    
    e.preventDefault();
  }, []);
  
  const handleTouchCancel = useCallback(() => {
    if (holdCheckInterval.current) {
      clearInterval(holdCheckInterval.current);
      holdCheckInterval.current = null;
    }
    
    touchState.current.isLooking = false;
    touchState.current.isHolding = false;
    touchState.current.holdDuration = 0;
  }, []);
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: false });
    container.addEventListener('touchcancel', handleTouchCancel, { passive: false });
    
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchCancel);
      
      if (holdCheckInterval.current) {
        clearInterval(holdCheckInterval.current);
      }
    };
  }, [containerRef, handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel]);
  
  const consumeLookDelta = useCallback(() => {
    const delta = { ...touchState.current.lookDelta };
    touchState.current.lookDelta = { x: 0, y: 0 };
    return delta;
  }, []);
  
  const consumeTap = useCallback(() => {
    const tap = pendingTap.current;
    pendingTap.current = null;
    touchState.current.isTapping = false;
    return tap;
  }, []);
  
  const isHolding = useCallback(() => {
    return touchState.current.isHolding;
  }, []);
  
  const holdDuration = useCallback(() => {
    return touchState.current.holdDuration;
  }, []);
  
  return {
    touchState,
    consumeLookDelta,
    consumeTap,
    isHolding,
    holdDuration,
  };
}
