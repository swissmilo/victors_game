# CLAUDE.md - Project Context for AI Assistants

## Project Overview

A Minecraft-style browser-based 3D voxel game built with Next.js, Three.js, and React Three Fiber. Players can explore procedurally generated terrain, mine blocks, and build structures.

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | Next.js 16+ (App Router) | Uses `'use client'` for 3D components |
| 3D Engine | Three.js via @react-three/fiber | React renderer for Three.js |
| Physics | Rapier via @react-three/rapier | Rust-based, runs in WASM |
| State | Zustand | Single store at `src/stores/gameStore.ts` |
| Styling | Tailwind CSS v4 | For UI overlays only |
| Testing | Vitest + Testing Library | `npm run test` |

## Quick Commands

```bash
npm run dev          # Start dev server
npm run check        # Run typecheck + lint + tests (use before commits)
npm run test         # Watch mode tests
npm run test:run     # Single test run
npm run typecheck    # TypeScript only
npm run lint         # ESLint only
```

## Architecture Patterns

### File Structure
```
src/
├── app/              # Next.js App Router (minimal - just entry point)
├── components/
│   ├── game/         # 3D components (Game, Scene, Player, World, ChunkMesh)
│   └── ui/           # 2D overlay components (Hotbar, Crosshair)
├── hooks/            # Custom React hooks (useKeyboard, usePointerLock)
├── lib/              # Pure utilities (noise, worldGen, meshBuilder, textureAtlas)
├── stores/           # Zustand stores
├── types/            # TypeScript types and constants
└── test/             # Test setup
```

### Key Conventions

1. **Client Components**: All 3D/game components must have `'use client'` directive
2. **Dynamic Imports**: The Game component is dynamically imported with `ssr: false` because Three.js requires browser APIs
3. **Type Exports**: Each folder has an `index.ts` that re-exports everything
4. **Tests**: Co-located with source files as `*.test.ts`

### Chunk System

- **Chunk Size**: 16x16x16 blocks (defined in `CHUNK_SIZE`)
- **Chunk Height**: 64 blocks (defined in `CHUNK_HEIGHT`)
- **Chunk Data**: Flat `Uint8Array` for performance, indexed as `x + z * 16 + y * 256`
- **Chunk Keys**: String format `"x,z"` for Map storage

```typescript
// Getting a block from chunk data
const index = x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
const blockType = chunkData[index];
```

### Block System

- Block types are defined in `src/types/blocks.ts` as an enum
- Each block has properties: `solid`, `transparent`, `textureIndex`
- Texture indices can be a single number (all faces) or array of 6 (per-face)
- Face order: `[top, bottom, front, back, left, right]`

### Mesh Generation

The mesh builder (`src/lib/meshBuilder.ts`) uses **face culling**:
- Only renders faces between solid and non-solid blocks
- Each visible face = 4 vertices, 6 indices (2 triangles)
- Outputs: positions, normals, UVs, colors, indices

### Physics (Currently Disabled for Performance)

- Player uses simple position-based movement (no Rapier physics yet)
- Ground is a flat plane at y=35 (temporary)
- Block collision not implemented yet - will need optimized approach
- Per-block colliders were too slow (thousands of components)

### Block Interaction

- Uses DDA (Digital Differential Analyzer) raycast algorithm
- Raycast runs every frame to find targeted block
- Left-click: Break block (add to inventory)
- Right-click: Place block from hotbar (remove from inventory)
- White wireframe shows targeted block
- Green wireframe shows placement position

### State Management

Single Zustand store handles:
- Player position/rotation
- Inventory (9 slots, max 64 per stack)
- Loaded chunks (`Map<string, Chunk>`)
- Game state (isPlaying, isPaused)

```typescript
// Reading state
const position = useGameStore((state) => state.playerPosition);

// Actions
const { setPlayerPosition, addToInventory } = useGameStore.getState();
```

## Important Technical Notes

### Three.js in React

- Never mutate objects returned from hooks directly (use methods like `camera.quaternion.setFromEuler()`)
- Dispose geometries/materials in cleanup to prevent memory leaks
- Use `useMemo` for expensive geometry/material creation

### Texture Atlas

- 256x256 canvas with 16x16 pixel textures
- Generated procedurally at runtime (no image files)
- Uses `NearestFilter` for pixelated Minecraft look
- UV coordinates normalized to 0-1 range

### Performance Considerations

- Chunk meshes should only regenerate when blocks change (`isDirty` flag)
- Physics colliders only added for blocks with exposed faces
- Render distance controls how many chunks are loaded (default: 3)
- Future: Use Web Workers for chunk generation/meshing

## Testing Approach

- **Unit tests** for pure functions (noise, world generation, mesh building)
- **Store tests** for Zustand actions
- **Mock WebGL** context in test setup for Three.js compatibility
- Run `npm run check` before committing

## Common Gotchas

1. **SSR Errors**: Three.js components must be dynamically imported with `ssr: false`
2. **Pointer Lock**: Only works after user interaction (click)
3. **Chunk Boundaries**: Blocks at edges need neighbor chunk data for proper face culling (not yet implemented)
4. **Memory**: Dispose Three.js objects when unmounting components

## Roadmap Reference

### Completed
- [x] Phase 1: Project setup, 3D scene, first-person controls
- [x] Phase 2: Chunk-based voxel world, block textures, terrain generation
- [x] Phase 3: Raycasting for block selection, mining (left-click), placing (right-click)

### Next Up
- [ ] Phase 4: Physics integration (player-block collision)
- [ ] Phase 5: Multi-chunk optimization, persistence, polish

## File Quick Reference

| File | Purpose |
|------|---------|
| `src/types/blocks.ts` | Block enum and definitions |
| `src/types/world.ts` | Chunk types and utility functions |
| `src/lib/meshBuilder.ts` | Converts chunk data to Three.js geometry |
| `src/lib/worldGen.ts` | Procedural terrain generation |
| `src/lib/noise.ts` | Perlin noise implementation |
| `src/stores/gameStore.ts` | Global game state |
| `src/components/game/World.tsx` | Manages chunk loading/rendering |
| `src/components/game/Player.tsx` | First-person controller (no physics yet) |
| `src/components/game/BlockSelector.tsx` | Raycasting and block interaction |
| `src/lib/blockInteraction.ts` | DDA raycast algorithm and block manipulation |
