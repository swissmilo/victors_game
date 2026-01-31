# Victor's World

A Minecraft-style 3D voxel game built with Next.js, Three.js, and React Three Fiber.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **3D Engine**: Three.js via @react-three/fiber
- **Physics**: Rapier via @react-three/rapier
- **State Management**: Zustand
- **Styling**: Tailwind CSS
- **Language**: TypeScript

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Controls

- **WASD** - Move
- **Mouse** - Look around
- **Space** - Jump
- **1-9** - Select hotbar slot
- **Left Click** - Break block (coming soon)
- **Right Click** - Place block (coming soon)

## Project Structure

```
src/
├── app/                 # Next.js app router
├── components/
│   ├── game/           # 3D game components
│   │   ├── Game.tsx    # Main game canvas
│   │   ├── Scene.tsx   # Three.js scene
│   │   ├── Player.tsx  # First-person player
│   │   └── Ground.tsx  # Terrain mesh
│   └── ui/             # UI components
│       ├── Hotbar.tsx  # Inventory hotbar
│       └── Crosshair.tsx
├── hooks/              # Custom React hooks
│   ├── useKeyboard.ts  # Keyboard input
│   └── usePointerLock.ts # Mouse capture
├── lib/                # Utility functions
│   ├── noise.ts        # Perlin noise generation
│   └── worldGen.ts     # Terrain generation
├── stores/             # Zustand stores
│   └── gameStore.ts    # Global game state
└── types/              # TypeScript types
    ├── blocks.ts       # Block definitions
    └── world.ts        # World/chunk types
```


## License

MIT
