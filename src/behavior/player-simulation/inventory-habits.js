import logger from '../../utils/logger.js';

export const PreferredHotbarLayout = {
  0: 'sword',         // Slot 1: Primary weapon
  1: 'pickaxe',       // Slot 2: Primary tool
  2: 'axe',           // Slot 3: Wood chopping / Shield disabling
  3: 'shovel',        // Slot 4: Digging
  4: 'building_block',// Slot 5: Cobblestone / Dirt for quick pillars
  5: 'torch',         // Slot 6: Torches for light
  6: 'water_bucket',  // Slot 7: MLG Water / Lava cooling
  7: 'food',          // Slot 8: Bread, Steak, Golden Apples
  8: 'bow',           // Slot 9: Ranged / Clock / Compass
};

export class InventoryHabitsManager {
  constructor() {
    this.layout = { ...PreferredHotbarLayout };
  }

  /**
   * Find the ideal slot index for a given item type.
   */
  getIdealSlot(itemName) {
    const name = itemName.toLowerCase();
    if (name.includes('sword')) return 0;
    if (name.includes('pickaxe')) return 1;
    if (name.includes('axe')) return 2;
    if (name.includes('shovel')) return 3;
    if (name.includes('cobblestone') || name.includes('planks') || name.includes('dirt')) return 4;
    if (name.includes('torch')) return 5;
    if (name.includes('water_bucket') || name === 'bucket') return 6;
    if (['bread', 'cooked_beef', 'cooked_porkchop', 'golden_apple', 'apple'].some(f => name.includes(f))) return 7;
    if (name.includes('bow') || name.includes('crossbow')) return 8;
    return -1;
  }

  /**
   * Evaluate if hotbar needs quick rearrangement.
   */
  checkHotbarOrder(botInstance) {
    if (!botInstance?.inventory) return { needsSorting: false, swaps: [] };

    const items = botInstance.inventory.items();
    const swaps = [];

    for (const item of items) {
      const ideal = this.getIdealSlot(item.name);
      if (ideal !== -1 && item.slot !== ideal + 36) { // 36 is hotbar start in Mineflayer window
        swaps.push({ item: item.name, currentSlot: item.slot, targetHotbarSlot: ideal });
      }
    }

    return {
      needsSorting: swaps.length > 0,
      swaps,
    };
  }
}

export const inventoryHabits = new InventoryHabitsManager();
