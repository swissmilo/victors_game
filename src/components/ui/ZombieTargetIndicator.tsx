'use client';

import { useGameStore } from '@/stores';

export function ZombieTargetIndicator() {
  const targetedZombieId = useGameStore((state) => state.targetedZombieId);

  if (targetedZombieId === null) return null;

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mt-8 pointer-events-none">
      <div className="px-3 py-1 bg-red-600/90 text-white text-sm font-bold rounded shadow-lg">
        Zombie
      </div>
    </div>
  );
}
