'use client';

import { useRef, useCallback, useEffect } from 'react';

interface TouchState {
  isLooking: boolean;
  lookDelta: { x: number; y: number };
  isTapping: boolean;
  isHolding: boolean;
  holdDuration: number;
  tapPosition: { x: number; y: number } | null;
  totalMovement: number;  // Track total movement during touch
  isCenterTouch: boolean; // Whether touch started in center area (not on controls)
}

interface UseTouchReturn {
  touchState: React.MutableRefObject<TouchState>;
  consumeLookDelta: () => { x: number; y: number };
  consumeTap: () => { x: number; y: number } | null;
  isHolding: () => boolean;
  holdDuration: () => number;
  isValidHoldForBreak: () => boolean;  // Check if hold is valid for breaking blocks
}

// Thresholds
const TAP_MAX_DURATION = 200;    // Max ms for a tap
const TAP_MAX_MOVEMENT = 20;     // Max pixels movement for a tap
const HOLD_THRESHOLD = 400;      // Ms to trigger hold
const HOLD_MAX_MOVEMENT = 15;    // Max pixels movement during hold for block break
const LOOK_SENSITIVITY = 3.0;    // Touch look sensitivity multiplier (increased for faster turning)

export function useTouch(containerRef: React.RefObject<HTMLElement | null>): UseTouchReturn {
  const touchState = useRef<TouchState>({
    isLooking: false,
    lookDelta: { x: 0, y: 0 },
    isTapping: false,
    isHolding: false,
    holdDuration: 0,
    tapPosition: null,
    totalMovement: 0,
    isCenterTouch: false,
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
    
    // Check if touch is in center area (not on joystick or jump button)
    // Joystick is bottom-left, jump is bottom-right
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const bottomControlsHeight = 200; // Height of bottom controls area
    const isInBottomControls = touch.clientY > screenHeight - bottomControlsHeight;
    const isInLeftControls = touch.clientX < 180; // Joystick area
    const isInRightControls = touch.clientX > screenWidth - 120; // Jump button area
    const isCenterTouch = !(isInBottomControls && (isInLeftControls || isInRightControls));
    
    touchState.current.isLooking = true;
    touchState.current.isHolding = false;
    touchState.current.holdDuration = 0;
    touchState.current.totalMovement = 0;
    touchState.current.isCenterTouch = isCenterTouch;
    
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
    const rawDeltaX = touch.clientX - lastTouchPos.current.x;
    const rawDeltaY = touch.clientY - lastTouchPos.current.y;
    
    // Track total movement (raw, before sensitivity)
    touchState.current.totalMovement += Math.abs(rawDeltaX) + Math.abs(rawDeltaY);
    
    // Apply sensitivity for look delta
    touchState.current.lookDelta.x += rawDeltaX * LOOK_SENSITIVITY;
    touchState.current.lookDelta.y += rawDeltaY * LOOK_SENSITIVITY;
    
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
  
  // Check if the current hold is valid for breaking a block
  // (centered touch with minimal movement)
  const isValidHoldForBreak = useCallback(() => {
    return touchState.current.isHolding && 
           touchState.current.isCenterTouch && 
           touchState.current.totalMovement < HOLD_MAX_MOVEMENT;
  }, []);
  
  return {
    touchState,
    consumeLookDelta,
    consumeTap,
    isHolding,
    holdDuration,
    isValidHoldForBreak,
  };
}
