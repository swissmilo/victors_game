'use client';

import dynamic from 'next/dynamic';

// Dynamically import Game component with no SSR (Three.js requires browser APIs)
const Game = dynamic(() => import('@/components/game/Game').then(mod => ({ default: mod.Game })), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen flex items-center justify-center bg-black">
      <div className="text-white text-xl">Loading game...</div>
    </div>
  ),
});

export default function Home() {
  return <Game />;
}
