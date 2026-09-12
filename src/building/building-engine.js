import logger from '../utils/logger.js';

export const BuildingStyles = {
  SIMPLE: 'simple',
  MEDIEVAL: 'medieval',
  MODERN: 'modern',
  VILLAGE: 'village',
  UNDERGROUND: 'underground',
  FORTRESS: 'fortress',
};

export class BuildingEngine {
  constructor() {
    this.constructedBuildings = [];
  }

  /**
   * Generate a structured procedural blueprint for a building.
   * @param {string} style - One of BuildingStyles
   * @param {object} dimensions - { width, length, height }
   * @param {string} primaryMaterial - e.g. 'oak_planks', 'cobblestone', 'stone_bricks'
   * @returns {object} Blueprint with layers and block coordinates
   */
  generateBlueprint(style = BuildingStyles.SIMPLE, dimensions = { width: 5, length: 5, height: 4 }, primaryMaterial = 'oak_planks') {
    const { width, length, height } = dimensions;
    const blocks = [];

    // Foundation & Floor (y = 0)
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < length; z++) {
        blocks.push({ relX: x, relY: 0, relZ: z, block: 'cobblestone' });
      }
    }

    // Walls (y = 1 to height - 1)
    for (let y = 1; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (let z = 0; z < length; z++) {
          const isPerimeter = (x === 0 || x === width - 1 || z === 0 || z === length - 1);
          if (isPerimeter) {
            // Door cutout at front center
            const isDoor = (z === 0 && x === Math.floor(width / 2) && (y === 1 || y === 2));
            // Window cutout
            const isWindow = (y === 2 && (x === 1 || x === width - 2) && (z === 0 || z === length - 1));

            if (isDoor) {
              // Leave air for door
            } else if (isWindow) {
              blocks.push({ relX: x, relY: y, relZ: z, block: 'glass' });
            } else {
              blocks.push({ relX: x, relY: y, relZ: z, block: primaryMaterial });
            }
          }
        }
      }
    }

    // Roof (y = height)
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < length; z++) {
        blocks.push({ relX: x, relY: height, relZ: z, block: style === BuildingStyles.MEDIEVAL ? 'cobblestone_stairs' : primaryMaterial });
      }
    }

    // Interior torch
    blocks.push({ relX: Math.floor(width / 2), relY: height - 1, relZ: Math.floor(length / 2), block: 'torch' });

    const blueprint = {
      style,
      dimensions,
      primaryMaterial,
      totalBlocks: blocks.length,
      blocks,
    };

    logger.info(`[BUILDING] Generated ${style} blueprint (${width}x${length}x${height}, ${blocks.length} blocks)`);
    return blueprint;
  }

  recordBuilding(name, style, originPos, dimensions) {
    this.constructedBuildings.push({
      name,
      style,
      originPos,
      dimensions,
      completedAt: Date.now(),
    });
  }
}

export const buildingEngine = new BuildingEngine();
