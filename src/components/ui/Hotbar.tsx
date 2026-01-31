'use client';

import { useGameStore } from '@/stores';
import { BLOCK_DEFINITIONS, BlockType } from '@/types';

const BLOCK_COLORS: Record<BlockType, string> = {
  [BlockType.AIR]: 'transparent',
  [BlockType.GRASS]: '#4a7c4e',
  [BlockType.DIRT]: '#8b6914',
  [BlockType.STONE]: '#888888',
  [BlockType.WOOD]: '#6b4423',
  [BlockType.LEAVES]: '#2d5a27',
  [BlockType.SAND]: '#d4c896',
  [BlockType.WATER]: '#3b82f6',
  [BlockType.COBBLESTONE]: '#666666',
  [BlockType.PLANKS]: '#a67c52',
};

export function Hotbar() {
  const inventory = useGameStore((state) => state.inventory);
  const hotbarSelection = useGameStore((state) => state.hotbarSelection);

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1">
      {inventory.slice(0, 9).map((slot, index) => {
        const isSelected = index === hotbarSelection;
        const blockDef = BLOCK_DEFINITIONS[slot.blockType];
        const color = BLOCK_COLORS[slot.blockType];
        
        return (
          <div
            key={index}
            className={`
              w-12 h-12 flex items-center justify-center relative
              border-2 rounded
              ${isSelected ? 'border-white' : 'border-gray-600'}
              bg-gray-800/80
            `}
          >
            {/* Block icon */}
            {slot.count > 0 && (
              <div
                className="w-8 h-8 rounded"
                style={{ backgroundColor: color }}
                title={blockDef?.name}
              />
            )}
            
            {/* Count */}
            {slot.count > 1 && (
              <span className="absolute bottom-0 right-1 text-xs text-white font-bold">
                {slot.count}
              </span>
            )}
            
            {/* Slot number */}
            <span className="absolute top-0 left-1 text-xs text-gray-400">
              {index + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}
