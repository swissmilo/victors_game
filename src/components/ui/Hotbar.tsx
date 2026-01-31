'use client';

import { useSyncExternalStore } from 'react';
import { useGameStore } from '@/stores';
import { BLOCK_DEFINITIONS, BlockType } from '@/types';

const BLOCK_COLORS: Record<BlockType, string> = {
  [BlockType.AIR]: 'transparent',
  [BlockType.GRASS]: '#4a7c4e',
  [BlockType.DIRT]: '#8b6914',
  [BlockType.STONE]: '#888888',
  [BlockType.WOOD]: '#6b4423',
  [BlockType.LEAVES]: '#d65db1',  // Pink/purple to match texture pack
  [BlockType.SAND]: '#d4c896',
  [BlockType.WATER]: '#3b82f6',
  [BlockType.COBBLESTONE]: '#666666',
  [BlockType.PLANKS]: '#a67c52',
  [BlockType.METAL]: '#2e8b57',  // Green metal
  [BlockType.OBSIDIAN]: '#1a0a2e',  // Dark purple/black
  [BlockType.PORTAL]: '#8b00ff',  // Purple portal
  [BlockType.TELEPORTER]: '#00e5e5',  // Cyan teleporter
};

// Viewport width below this = phone (single block + tap to cycle); >= = tablet (full hotbar)
const TABLET_BREAKPOINT_PX = 640;

function useWindowWidth(): number {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('resize', cb);
      return () => window.removeEventListener('resize', cb);
    },
    () => window.innerWidth,
    () => 1024
  );
}

interface SlotContentProps {
  slot: { blockType: BlockType; count: number };
  index: number;
  showSlotNumber: boolean;
}

function SlotContent({ slot, index, showSlotNumber }: SlotContentProps) {
  const blockDef = BLOCK_DEFINITIONS[slot.blockType];
  const color = BLOCK_COLORS[slot.blockType];
  return (
    <>
      {slot.count > 0 && (
        <div
          className="w-8 h-8 rounded flex-shrink-0"
          style={{ backgroundColor: color }}
          title={blockDef?.name}
        />
      )}
      {slot.count > 1 && (
        <span className="absolute bottom-0 right-1 text-xs text-white font-bold">
          {slot.count}
        </span>
      )}
      {showSlotNumber && (
        <span className="absolute top-0 left-1 text-xs text-gray-400">
          {index + 1}
        </span>
      )}
    </>
  );
}

interface HotbarProps {
  isMobile?: boolean;
}

export function Hotbar({ isMobile = false }: HotbarProps) {
  const inventory = useGameStore((state) => state.inventory);
  const hotbarSelection = useGameStore((state) => state.hotbarSelection);
  const setHotbarSelection = useGameStore((state) => state.setHotbarSelection);
  const windowWidth = useWindowWidth();

  const isPhoneLayout = isMobile && windowWidth < TABLET_BREAKPOINT_PX;
  const isTabletLayout = isMobile && windowWidth >= TABLET_BREAKPOINT_PX;

  const cycleSelection = () => {
    setHotbarSelection((hotbarSelection + 1) % 9);
  };

  const slots = inventory.slice(0, 9);

  // Phone: single block, tap to cycle through 9 slots
  if (isPhoneLayout) {
    const slot = slots[hotbarSelection];
    return (
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <button
          type="button"
          onClick={cycleSelection}
          className={`
            w-14 h-14 flex items-center justify-center relative
            border-2 rounded-lg border-white
            bg-gray-800/90 touch-manipulation
          `}
          aria-label={`Selected slot ${hotbarSelection + 1} of 9. Tap to change.`}
        >
          <SlotContent
            slot={slot}
            index={hotbarSelection}
            showSlotNumber={false}
          />
        </button>
        <p className="text-center text-white/70 text-xs mt-1">Tap to change</p>
      </div>
    );
  }

  // Tablet (mobile): full hotbar with touch to select. Desktop: full hotbar (keys only).
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1">
      {slots.map((slot, index) => {
        const isSelected = index === hotbarSelection;
        const slotClass = `
          w-12 h-12 flex items-center justify-center relative
          border-2 rounded
          ${isSelected ? 'border-white' : 'border-gray-600'}
          bg-gray-800/80
          ${isTabletLayout ? 'cursor-pointer touch-manipulation' : ''}
        `;
        if (isTabletLayout) {
          return (
            <button
              key={index}
              type="button"
              onClick={() => setHotbarSelection(index)}
              className={slotClass}
              aria-label={`Slot ${index + 1}`}
            >
              <SlotContent slot={slot} index={index} showSlotNumber />
            </button>
          );
        }
        return (
          <div key={index} className={slotClass}>
            <SlotContent slot={slot} index={index} showSlotNumber />
          </div>
        );
      })}
    </div>
  );
}
