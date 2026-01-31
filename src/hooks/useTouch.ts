'use client';

import { useRef, useCallback, useEffect } from 'react';

// Track individual touch data
interface TrackedTouch {
  id: number;
  startTime: number;
  startPos: { x: number; y: number };
  lastPos: { x: number; y: number };
  totalMovement: number;
  isLookTouch: boolean;  // True if this touch is for looking (not on controls)
  isHolding: boolean;
  holdDuration: number;
}

interface TouchState {
  isLooking: boolean;
  lookDelta: { x: number; y: number };
  isTapping: boolean;
  isHolding: boolean;
  holdDuration: number;
  tapPosition: { x: number; y: number } | null;
  totalMovement: number;
  isCenterTouch: boolean;
}

interface UseTouchReturn {
  touchState: React.MutableRefObject<TouchState>;
  consumeLookDelta: () => { x: number; y: number };
  consumeTap: () => { x: number; y: number } | null;
  isHolding: () => boolean;
  holdDuration: () => number;
  isValidHoldForBreak: () => boolean;
  getHoldPosition: () => { x: number; y: number } | null;
}

// Thresholds
const TAP_MAX_DURATION = 200;
const TAP_MAX_MOVEMENT = 20;
const HOLD_THRESHOLD = 400;
const HOLD_MAX_MOVEMENT = 15;
const LOOK_SENSITIVITY = 3.0;

// Check if a touch position is in the control areas (joystick or jump button)
function isInControlArea(x: number, y: number): boolean {
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  const bottomControlsHeight = 200;
  const isInBottomControls = y > screenHeight - bottomControlsHeight;
  const isInLeftControls = x < 180;  // Joystick area
  const isInRightControls = x > screenWidth - 120;  // Jump button area
  return isInBottomControls && (isInLeftControls || isInRightControls);
}

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
  
  // Track multiple touches by ID
  const trackedTouches = useRef<Map<number, TrackedTouch>>(new Map());
  const holdCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const pendingTap = useRef<{ x: number; y: number } | null>(null);
  
  // Find the current "look" touch (one that's for looking, not on controls)
  const getLookTouch = useCallback((): TrackedTouch | null => {
    for (const touch of trackedTouches.current.values()) {
      if (touch.isLookTouch) {
        return touch;
      }
    }
    return null;
  }, []);
  
  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Don't capture touches on buttons or interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('[role="button"]')) {
      return;
    }
    
    // Process each new touch
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      
      // Skip if already tracking this touch
      if (trackedTouches.current.has(touch.identifier)) continue;
      
      // Check if this touch is in the control area
      const inControlArea = isInControlArea(touch.clientX, touch.clientY);
      
      // If in control area, don't track for looking (controls handle themselves)
      if (inControlArea) continue;
      
      // Create tracked touch
      const tracked: TrackedTouch = {
        id: touch.identifier,
        startTime: Date.now(),
        startPos: { x: touch.clientX, y: touch.clientY },
        lastPos: { x: touch.clientX, y: touch.clientY },
        totalMovement: 0,
        isLookTouch: true,  // Not on controls = looking touch
        isHolding: false,
        holdDuration: 0,
      };
      
      trackedTouches.current.set(touch.identifier, tracked);
      
      // Update state
      touchState.current.isLooking = true;
      touchState.current.isCenterTouch = true;
      touchState.current.totalMovement = 0;
      touchState.current.isHolding = false;
      touchState.current.holdDuration = 0;
    }
    
    // Start hold check interval if we have look touches
    if (getLookTouch() && !holdCheckInterval.current) {
      holdCheckInterval.current = setInterval(() => {
        const lookTouch = getLookTouch();
        if (lookTouch) {
          const elapsed = Date.now() - lookTouch.startTime;
          lookTouch.holdDuration = elapsed;
          touchState.current.holdDuration = elapsed;
          
          if (elapsed >= HOLD_THRESHOLD) {
            lookTouch.isHolding = true;
            touchState.current.isHolding = true;
          }
        }
      }, 50);
    }
    
    e.preventDefault();
  }, [getLookTouch]);
  
  const handleTouchMove = useCallback((e: TouchEvent) => {
    // Process each moved touch
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const tracked = trackedTouches.current.get(touch.identifier);
      
      // Only process look touches we're tracking
      if (!tracked || !tracked.isLookTouch) continue;
      
      const rawDeltaX = touch.clientX - tracked.lastPos.x;
      const rawDeltaY = touch.clientY - tracked.lastPos.y;
      
      // Track total movement
      tracked.totalMovement += Math.abs(rawDeltaX) + Math.abs(rawDeltaY);
      touchState.current.totalMovement = tracked.totalMovement;
      
      // Apply look delta
      touchState.current.lookDelta.x += rawDeltaX * LOOK_SENSITIVITY;
      touchState.current.lookDelta.y += rawDeltaY * LOOK_SENSITIVITY;
      
      tracked.lastPos = { x: touch.clientX, y: touch.clientY };
    }
    
    e.preventDefault();
  }, []);
  
  const handleTouchEnd = useCallback((e: TouchEvent) => {
    // Process each ended touch
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const tracked = trackedTouches.current.get(touch.identifier);
      
      if (!tracked) continue;
      
      // Only process taps/holds for look touches
      if (tracked.isLookTouch) {
        const elapsed = Date.now() - tracked.startTime;
        const movement = Math.sqrt(
          Math.pow(tracked.lastPos.x - tracked.startPos.x, 2) +
          Math.pow(tracked.lastPos.y - tracked.startPos.y, 2)
        );
        
        // Check if it was a tap
        if (elapsed < TAP_MAX_DURATION && movement < TAP_MAX_MOVEMENT) {
          pendingTap.current = { 
            x: tracked.startPos.x, 
            y: tracked.startPos.y 
          };
          touchState.current.isTapping = true;
        }
      }
      
      // Remove from tracking
      trackedTouches.current.delete(touch.identifier);
    }
    
    // Update state based on remaining look touches
    const remainingLookTouch = getLookTouch();
    if (!remainingLookTouch) {
      touchState.current.isLooking = false;
      touchState.current.isHolding = false;
      touchState.current.holdDuration = 0;
      
      // Clear hold check if no more look touches
      if (holdCheckInterval.current) {
        clearInterval(holdCheckInterval.current);
        holdCheckInterval.current = null;
      }
    }
    
    e.preventDefault();
  }, [getLookTouch]);
  
  const handleTouchCancel = useCallback((e: TouchEvent) => {
    // Remove cancelled touches
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      trackedTouches.current.delete(touch.identifier);
    }
    
    // Update state
    const remainingLookTouch = getLookTouch();
    if (!remainingLookTouch) {
      touchState.current.isLooking = false;
      touchState.current.isHolding = false;
      touchState.current.holdDuration = 0;
      
      if (holdCheckInterval.current) {
        clearInterval(holdCheckInterval.current);
        holdCheckInterval.current = null;
      }
    }
  }, [getLookTouch]);
  
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
  
  const isValidHoldForBreak = useCallback(() => {
    return touchState.current.isHolding && 
           touchState.current.isCenterTouch && 
           touchState.current.totalMovement < HOLD_MAX_MOVEMENT;
  }, []);
  
  const getHoldPosition = useCallback(() => {
    const lookTouch = getLookTouch();
    if (!lookTouch) return null;
    return { ...lookTouch.startPos };
  }, [getLookTouch]);
  
  return {
    touchState,
    consumeLookDelta,
    consumeTap,
    isHolding,
    holdDuration,
    isValidHoldForBreak,
    getHoldPosition,
  };
}
