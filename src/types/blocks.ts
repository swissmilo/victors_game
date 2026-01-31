// Block type definitions

export enum BlockType {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  STONE = 3,
  WOOD = 4,
  LEAVES = 5,
  SAND = 6,
  WATER = 7,
  COBBLESTONE = 8,
  PLANKS = 9,
  METAL = 10,
  OBSIDIAN = 11,
  PORTAL = 12,
  TELEPORTER = 13,
}

export interface BlockDefinition {
  id: BlockType;
  name: string;
  solid: boolean;
  transparent: boolean;
  // Texture indices for each face [top, bottom, front, back, left, right]
  // Using single index means same texture for all faces
  textureIndex: number | [number, number, number, number, number, number];
}

export const BLOCK_DEFINITIONS: Record<BlockType, BlockDefinition> = {
  [BlockType.AIR]: {
    id: BlockType.AIR,
    name: 'Air',
    solid: false,
    transparent: true,
    textureIndex: 0,
  },
  [BlockType.GRASS]: {
    id: BlockType.GRASS,
    name: 'Grass',
    solid: true,
    transparent: false,
    textureIndex: [0, 2, 1, 1, 1, 1], // top=grass, bottom=dirt, sides=grass_side
  },
  [BlockType.DIRT]: {
    id: BlockType.DIRT,
    name: 'Dirt',
    solid: true,
    transparent: false,
    textureIndex: 2,
  },
  [BlockType.STONE]: {
    id: BlockType.STONE,
    name: 'Stone',
    solid: true,
    transparent: false,
    textureIndex: 3,
  },
  [BlockType.WOOD]: {
    id: BlockType.WOOD,
    name: 'Wood',
    solid: true,
    transparent: false,
    textureIndex: [5, 5, 4, 4, 4, 4], // top/bottom=log_top, sides=log_side
  },
  [BlockType.LEAVES]: {
    id: BlockType.LEAVES,
    name: 'Leaves',
    solid: true,
    transparent: true,
    textureIndex: 6,
  },
  [BlockType.SAND]: {
    id: BlockType.SAND,
    name: 'Sand',
    solid: true,
    transparent: false,
    textureIndex: 7,
  },
  [BlockType.WATER]: {
    id: BlockType.WATER,
    name: 'Water',
    solid: false,
    transparent: true,
    textureIndex: 8,
  },
  [BlockType.COBBLESTONE]: {
    id: BlockType.COBBLESTONE,
    name: 'Cobblestone',
    solid: true,
    transparent: false,
    textureIndex: 9,
  },
  [BlockType.PLANKS]: {
    id: BlockType.PLANKS,
    name: 'Planks',
    solid: true,
    transparent: false,
    textureIndex: 10,
  },
  [BlockType.METAL]: {
    id: BlockType.METAL,
    name: 'Metal',
    solid: true,
    transparent: false,
    textureIndex: 11,
  },
  [BlockType.OBSIDIAN]: {
    id: BlockType.OBSIDIAN,
    name: 'Obsidian',
    solid: true,
    transparent: false,
    textureIndex: 12,
  },
  [BlockType.PORTAL]: {
    id: BlockType.PORTAL,
    name: 'Portal',
    solid: false,
    transparent: true,
    textureIndex: 13,
  },
  [BlockType.TELEPORTER]: {
    id: BlockType.TELEPORTER,
    name: 'Teleporter',
    solid: true,
    transparent: false,
    textureIndex: 14,  // Will use end portal frame texture
  },
};
