'use client';

import { useGameStore } from '@/stores';

export function UnderwaterOverlay() {
  const playerPosition = useGameStore((state) => state.playerPosition);
  const tsunami = useGameStore((state) => state.tsunami);
  
  // Player eye level is approximately playerPosition[1] + 1.6 (player height)
  const playerEyeLevel = playerPosition[1] + 1.6;
  const isUnderwater = playerEyeLevel < tsunami.waterLevel;
  
  if (!isUnderwater) return null;
  
  // Calculate depth for intensity (deeper = more intense effect)
  const depth = tsunami.waterLevel - playerEyeLevel;
  const intensity = Math.min(depth / 10, 1); // Max intensity at 10 blocks deep
  
  return (
    <>
      {/* Blue tint overlay */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundColor: `rgba(0, 50, 120, ${0.3 + intensity * 0.3})`,
          mixBlendMode: 'multiply',
        }}
      />
      
      {/* Underwater caustics/light effect */}
      <div 
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{
          background: `
            radial-gradient(ellipse at 30% 20%, rgba(100, 200, 255, ${0.1 + intensity * 0.1}) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 40%, rgba(80, 180, 255, ${0.08 + intensity * 0.08}) 0%, transparent 40%),
            radial-gradient(ellipse at 50% 80%, rgba(60, 160, 255, ${0.05 + intensity * 0.05}) 0%, transparent 60%)
          `,
          animation: 'underwaterCaustics 3s ease-in-out infinite',
        }}
      />
      
      {/* Bubbles effect */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white/20"
            style={{
              width: `${4 + (i % 3) * 3}px`,
              height: `${4 + (i % 3) * 3}px`,
              left: `${10 + i * 12}%`,
              animation: `bubble ${3 + (i % 2)}s ease-in-out infinite`,
              animationDelay: `${i * 0.4}s`,
            }}
          />
        ))}
      </div>
      
      {/* Underwater indicator */}
      <div className="absolute top-32 left-1/2 -translate-x-1/2 px-4 py-2 bg-blue-900/70 text-blue-200 rounded-lg border border-blue-400/30">
        <div className="text-center">
          <span className="text-lg font-bold">UNDERWATER</span>
          <div className="text-sm opacity-80">Depth: {depth.toFixed(1)}m</div>
        </div>
      </div>
      
      {/* Vignette effect for underwater */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at center, transparent 40%, rgba(0, 30, 80, ${0.4 + intensity * 0.3}) 100%)`,
        }}
      />
      
      {/* CSS animations */}
      <style jsx>{`
        @keyframes underwaterCaustics {
          0%, 100% { transform: scale(1) rotate(0deg); opacity: 1; }
          50% { transform: scale(1.1) rotate(2deg); opacity: 0.8; }
        }
        @keyframes bubble {
          0% { 
            transform: translateY(100vh) scale(0.5);
            opacity: 0;
          }
          10% {
            opacity: 0.6;
          }
          90% {
            opacity: 0.4;
          }
          100% { 
            transform: translateY(-20px) scale(1);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}
