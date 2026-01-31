# CLAUDE.md - Project Context for AI Assistants

## Project Overview

A Minecraft-style browser-based 3D voxel game built with Next.js, Three.js, and React Three Fiber. Players can explore procedurally generated terrain with structures (haunted mansion, war tank, nether portal), mine blocks, build structures, and survive periodic catastrophes (earthquakes, tsunamis, blood rain).

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | Next.js 16+ (App Router) | Uses `'use client'` for 3D components |
| 3D Engine | Three.js via @react-three/fiber | React renderer for Three.js |
| State | Zustand | Single store at `src/stores/gameStore.ts` |
| Styling | Tailwind CSS v4 | For UI overlays only |
| Testing | Vitest + Testing Library | `npm run test` |
| Persistence | localStorage | World saves automatically |

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
│   ├── game/         # 3D components (Game, Scene, Player, World, ChunkMesh, EarthquakeSystem, BlackHoleSystem, TsunamiSystem, BloodRainSystem)
│   └── ui/           # 2D overlay components (Hotbar, Crosshair, WorldMenu, CatastropheTimer, UnderwaterOverlay)
├── hooks/            # Custom React hooks (useKeyboard, usePointerLock)
├── lib/              # Pure utilities (noise, worldGen, meshBuilder, textureAtlas, worldPersistence)
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

- **Chunk Size**: 16x16 blocks horizontally (defined in `CHUNK_SIZE`)
- **Chunk Height**: 64 blocks (defined in `CHUNK_HEIGHT`)
- **Chunk Data**: Flat `Uint8Array` for performance, indexed as `x + z * 16 + y * 256`
- **Chunk Keys**: String format `"x,z"` for Map storage
- **Render Distance**: 8 chunks (~128 blocks)
- **Unload Distance**: 12 chunks (~192 blocks)

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

**Block Types**: AIR, GRASS, DIRT, STONE, WOOD, PLANKS, COBBLESTONE, SAND, LEAVES, METAL, OBSIDIAN, PORTAL, TELEPORTER

### Mesh Generation

The mesh builder (`src/lib/meshBuilder.ts`) uses **face culling**:
- Only renders faces between solid and non-solid blocks
- Each visible face = 4 vertices, 6 indices (2 triangles)
- Outputs: positions, normals, UVs, colors, indices
- Explicit bounding boxes for frustum culling optimization

### Player Physics (Manual Implementation)

- **No Rapier physics** - custom position-based collision
- Ground collision checks block directly below feet
- Horizontal collision checks player bounding box (0.6 wide, 0.9 tall)
- Ceiling collision prevents jumping through blocks
- Eye height: 1.7 blocks above feet
- Below y=0 is always solid (underground)

### Block Interaction

- Uses DDA (Digital Differential Analyzer) raycast algorithm
- Raycast runs every frame to find targeted block
- Left-click: Break block (add to inventory)
- Right-click: Place block from hotbar (remove from inventory)
- White wireframe shows targeted block

### Fly Mode

- Double-tap spacebar to toggle fly mode
- While flying: Space = up, Shift = down
- No gravity when flying
- Blue "Flying" indicator shown in UI

### Catastrophe System

Four catastrophes cycle in order: **Earthquake → Black Hole → Tsunami → Blood Rain**

Each catastrophe has 60-second countdown, then active phases, then transitions to the next.

#### Earthquake (`src/components/game/EarthquakeSystem.tsx`)
- **Phases**: countdown → rumbling (2s) → quake (4s) → settling (2s)
- Destroys 25% of STONE and COBBLESTONE blocks randomly
- Incremental destruction (2 chunks/frame) to avoid frame drops
- Screen shake via CSS animation on canvas wrapper
- Brown/orange vignette effect during active phases

#### Black Hole (`src/components/game/BlackHoleSystem.tsx`)
- **Phases**: countdown → appearing (2s) → pulling (6s) → consuming (1s) → blackout (2s)
- Spawns 30 blocks away from player in random direction
- Visual: black sphere with rotating orange/yellow accretion disk rings
- Player is pulled toward the black hole (stronger when closer)
- Screen fades to black during consume/blackout phases

#### Tsunami (`src/components/game/TsunamiSystem.tsx`)
- **Phases**: countdown → rising → peak → falling
- Water rises from sea level (32) to max height (70)
- Destroys WOOD and PLANKS blocks as water rises
- Water plane has depth-write disabled to prevent z-fighting

#### Blood Rain (`src/components/game/BloodRainSystem.tsx`)
- **Phases**: countdown → starting (3s) → active (15s) → ending (3s)
- Dark red fog color transition
- 5000 red particle rain drops
- Red water plane at ground level

### Underwater Effects

When player is below water level (`src/components/ui/UnderwaterOverlay.tsx`):
- Blue tint overlay with multiply blend mode
- Animated caustic light patterns
- Rising bubble particles
- Depth indicator showing blocks below surface
- Vignette effect

### Portal & Teleporter System

**Nether Portals**: Two linked portals (outside and inside haunted mansion)
- Step into portal block to teleport to the other portal
- 2-second cooldown between teleports
- Sets player facing direction on exit

**Teleporter Blocks** (inventory slot 9):
- Place multiple teleporter blocks in the world
- Jump on any teleporter to randomly teleport to another
- Requires at least 2 teleporters placed to function
- 1-second cooldown between uses

### World Persistence

Automatic save/load system (`src/lib/worldPersistence.ts`):
- Saves to localStorage every 30 seconds
- Saves on tab blur and before unload
- Stores: player position/rotation, inventory, all chunk data
- WorldMenu shows "Continue World" if save exists
- "New World" option to start fresh

### State Management

Single Zustand store handles:
- Player position/rotation
- Inventory (9 slots, max 64 per stack)
- Loaded chunks (`Map<string, Chunk>`)
- Game state (isPlaying, isPaused, isFlying)
- Catastrophe state (currentCatastrophe, nextCatastrophe)
- Earthquake state (phase, countdown, intensity, hasDestroyedBlocks)
- Black hole state (phase, countdown, position, intensity, blackoutOpacity)
- Tsunami state (phase, countdown, waterLevel)
- Blood rain state (phase, countdown, intensity)
- Teleporter positions array
- Persistence actions (saveGame, loadGame, resetWorld)

```typescript
// Reading state
const position = useGameStore((state) => state.playerPosition);

// Actions
const { setPlayerPosition, addToInventory, saveGame } = useGameStore.getState();
```

## Procedural Generation

### Terrain

- Uses 2D Perlin noise with fractal brownian motion (FBM)
- Base terrain height: 30-45 blocks
- Layers: grass on top, dirt below, stone deeper

### Structures (Generated in `worldGen.ts`)

1. **Haunted Mansion**: Victorian Gothic style at world origin
   - Multiple towers with pitched roofs
   - Cobblestone, wood, planks materials
   - Gothic arched windows, balconies

2. **War Tank**: Military tank next to mansion
   - Metal hull with treads
   - Rotating turret with cannon

3. **Nether Portal**: Obsidian frame with purple portal blocks

4. **Dead Trees & Graveyard**: Around the mansion

## Performance Optimizations

### Chunk Loading
- **Spiral pattern**: Loads nearest chunks first
- **Incremental generation**: Max 2 chunks per frame
- **Chunk unloading**: Removes chunks beyond unload distance

### Rendering
- **Shared material**: All chunks use single material instance
- **Frustum culling**: Chunks behind camera not rendered
- **Pre-computed bounding boxes**: Faster culling checks
- **Distance-sorted rendering**: Nearest chunks first

### Fog
- Near: 100 blocks, Far: 180 blocks
- Matches render distance for smooth fade

## Important Technical Notes

### Three.js in React

- Never mutate objects returned from hooks directly
- Dispose geometries/materials in cleanup to prevent memory leaks
- Use `useMemo` for expensive geometry/material creation

### Texture Atlas

- 256x256 canvas with 16x16 pixel textures
- Loads from `public/textures/` (falls back to procedural if missing)
- Uses `NearestFilter` for pixelated Minecraft look
- Supports rotation and tinting (for grass tops)
- Programmatic textures for metal, obsidian, portal

## Testing Approach

- **Unit tests** for pure functions (noise, world generation, mesh building)
- **Store tests** for Zustand actions (including tsunami, flying, persistence)
- **Mock WebGL** context in test setup for Three.js compatibility
- **Mock localStorage** for persistence tests
- Run `npm run check` before committing

## Common Gotchas

1. **SSR Errors**: Three.js components must be dynamically imported with `ssr: false`
2. **Pointer Lock**: Only works after user interaction (click)
3. **Chunk Boundaries**: Blocks at edges need neighbor chunk data for proper face culling
4. **Memory**: Dispose Three.js objects when unmounting components
5. **localStorage**: Check `typeof window !== 'undefined'` before access

## File Quick Reference

| File | Purpose |
|------|---------|
| `src/types/blocks.ts` | Block enum and definitions |
| `src/types/world.ts` | Chunk types and utility functions |
| `src/lib/meshBuilder.ts` | Converts chunk data to Three.js geometry |
| `src/lib/worldGen.ts` | Procedural terrain + structures + portals |
| `src/lib/noise.ts` | Perlin noise implementation |
| `src/lib/worldPersistence.ts` | Save/load world to localStorage (RLE compressed) |
| `src/lib/textureAtlas.ts` | Texture loading and atlas generation |
| `src/stores/gameStore.ts` | Global game state + catastrophe management |
| `src/components/game/World.tsx` | Chunk loading/unloading/rendering |
| `src/components/game/Player.tsx` | First-person controller with collision + portal teleport |
| `src/components/game/EarthquakeSystem.tsx` | Earthquake mechanics and block destruction |
| `src/components/game/BlackHoleSystem.tsx` | Black hole visual and player pull mechanics |
| `src/components/game/TsunamiSystem.tsx` | Tsunami mechanics and water rendering |
| `src/components/game/BloodRainSystem.tsx` | Blood rain particles and fog effects |
| `src/components/game/BlockSelector.tsx` | Raycasting and block interaction |
| `src/components/ui/WorldMenu.tsx` | Start screen with load/new world options |
| `src/components/ui/CatastropheTimer.tsx` | Catastrophe countdown and progress display |
| `src/components/ui/UnderwaterOverlay.tsx` | Underwater visual effects |
