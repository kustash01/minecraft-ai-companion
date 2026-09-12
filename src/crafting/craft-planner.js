import logger from '../utils/logger.js';

export const BasicRecipes = {
  oak_planks: { produces: 4, requires: { oak_log: 1 } },
  stick: { produces: 4, requires: { oak_planks: 2 } },
  crafting_table: { produces: 1, requires: { oak_planks: 4 } },
  wooden_pickaxe: { produces: 1, requires: { oak_planks: 3, stick: 2 } },
  stone_pickaxe: { produces: 1, requires: { cobblestone: 3, stick: 2 } },
  iron_pickaxe: { produces: 1, requires: { iron_ingot: 3, stick: 2 } },
  torch: { produces: 4, requires: { coal: 1, stick: 1 } },
  bed: { produces: 1, requires: { oak_planks: 3, white_wool: 3 } },
  chest: { produces: 1, requires: { oak_planks: 8 } },
  furnace: { produces: 1, requires: { cobblestone: 8 } },
};

export class CraftPlanner {
  constructor(recipes = BasicRecipes) {
    this.recipes = recipes;
  }

  /**
   * Recursively resolve all raw materials and crafting sequence for target item.
   * @param {string} targetItem - e.g. 'stone_pickaxe'
   * @param {number} targetCount
   * @param {object} availableInventory - { itemName: count }
   * @returns {object} { rawRequired, craftingSteps }
   */
  resolveCraftTree(targetItem, targetCount = 1, availableInventory = {}) {
    const rawRequired = {};
    const craftingSteps = [];
    const currentInv = { ...availableInventory };

    const solve = (item, count) => {
      const have = currentInv[item] || 0;
      if (have >= count) {
        currentInv[item] -= count;
        return;
      }

      const needed = count - have;
      currentInv[item] = 0;

      const recipe = this.recipes[item];
      if (!recipe) {
        // It's a raw resource
        rawRequired[item] = (rawRequired[item] || 0) + needed;
        return;
      }

      const craftsCount = Math.ceil(needed / recipe.produces);
      for (const [subItem, reqQty] of Object.entries(recipe.requires)) {
        solve(subItem, reqQty * craftsCount);
      }

      craftingSteps.push({
        action: 'craft',
        item,
        count: craftsCount * recipe.produces,
        requires: recipe.requires,
      });
    };

    solve(targetItem, targetCount);

    logger.debug(`[CRAFT-PLANNER] Resolved tree for ${targetCount}x ${targetItem}: ${craftingSteps.length} steps`);
    return {
      targetItem,
      targetCount,
      rawRequired,
      craftingSteps,
    };
  }
}

export const craftPlanner = new CraftPlanner();
