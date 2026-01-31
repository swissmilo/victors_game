'use client';

import { useCallback, useRef, useEffect } from 'react';

export function MobileControls() {
  const joystickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const touchIdRef = useRef<number | null>(null);
  const centerRef = useRef({ x: 0, y: 0 });
  
  const handleJoystickStart = useCallback((e: React.TouchEvent) => {
    if (touchIdRef.current !== null) return;
    
    const touch = e.touches[0];
    touchIdRef.current = touch.identifier;
    
    const rect = joystickRef.current?.getBoundingClientRect();
    if (rect) {
      centerRef.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }
  }, []);
  
  const handleJoystickMove = useCallback((e: React.TouchEvent) => {
    if (touchIdRef.current === null) return;
    
    const touch = Array.from(e.touches).find(t => t.identifier === touchIdRef.current);
    if (!touch || !knobRef.current) return;
    
    const dx = touch.clientX - centerRef.current.x;
    const dy = touch.clientY - centerRef.current.y;
    
    // Limit to joystick radius
    const maxRadius = 40;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const clampedDistance = Math.min(distance, maxRadius);
    const angle = Math.atan2(dy, dx);
    
    const clampedX = Math.cos(angle) * clampedDistance;
    const clampedY = Math.sin(angle) * clampedDistance;
    
    knobRef.current.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
    
    // Simulate keyboard input based on joystick position
    const threshold = 15;
    
    // Forward/backward
    if (clampedY < -threshold) {
      simulateKey('KeyW', true);
      simulateKey('KeyS', false);
    } else if (clampedY > threshold) {
      simulateKey('KeyS', true);
      simulateKey('KeyW', false);
    } else {
      simulateKey('KeyW', false);
      simulateKey('KeyS', false);
    }
    
    // Left/right
    if (clampedX < -threshold) {
      simulateKey('KeyA', true);
      simulateKey('KeyD', false);
    } else if (clampedX > threshold) {
      simulateKey('KeyD', true);
      simulateKey('KeyA', false);
    } else {
      simulateKey('KeyA', false);
      simulateKey('KeyD', false);
    }
  }, []);
  
  const handleJoystickEnd = useCallback(() => {
    touchIdRef.current = null;
    if (knobRef.current) {
      knobRef.current.style.transform = 'translate(0px, 0px)';
    }
    // Release all movement keys
    simulateKey('KeyW', false);
    simulateKey('KeyS', false);
    simulateKey('KeyA', false);
    simulateKey('KeyD', false);
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      simulateKey('KeyW', false);
      simulateKey('KeyS', false);
      simulateKey('KeyA', false);
      simulateKey('KeyD', false);
    };
  }, []);
  
  return (
    <div className="pointer-events-auto z-20">
      {/* Virtual joystick for movement */}
      <div 
        ref={joystickRef}
        className="absolute bottom-24 left-8 w-32 h-32 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center touch-none"
        onTouchStart={handleJoystickStart}
        onTouchMove={handleJoystickMove}
        onTouchEnd={handleJoystickEnd}
        onTouchCancel={handleJoystickEnd}
      >
      <div 
        ref={knobRef}
        className="w-14 h-14 rounded-full bg-white/50 border-2 border-white/70 transition-none"
        />
      </div>
      
      {/* Jump button */}
      <div 
        className="absolute bottom-24 right-8 w-20 h-20 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center touch-none active:bg-white/40"
        onTouchStart={() => simulateKey('Space', true)}
        onTouchEnd={() => simulateKey('Space', false)}
        onTouchCancel={() => simulateKey('Space', false)}
      >
        <span className="text-white/70 text-lg font-bold">JUMP</span>
      </div>
    </div>
  );
}

// Helper to simulate keyboard events for the useKeyboard hook
function simulateKey(code: string, pressed: boolean) {
  const event = new KeyboardEvent(pressed ? 'keydown' : 'keyup', {
    code,
    bubbles: true,
  });
  window.dispatchEvent(event);
}
