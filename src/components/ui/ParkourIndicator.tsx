'use client';

import { useGameStore } from '@/stores';

export function ParkourIndicator() {
  const isInParkour = useGameStore((state) => state.isInBlackHoleParkour);
  const parkourLevel = useGameStore((state) => state.parkourLevel);

  if (!isInParkour) return null;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none">
      <div className="px-4 py-2 bg-purple-900/90 text-white rounded-lg shadow-lg border-2 border-purple-500">
        <div className="text-center">
          <div className="text-sm font-bold">BLACK HOLE PARKOUR</div>
          <div className="text-2xl font-bold">LEVEL {parkourLevel}</div>
        </div>
      </div>
    </div>
  );
}
