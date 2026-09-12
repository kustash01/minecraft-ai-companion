import minecraftData from 'minecraft-data';
import pathfinderPkg from 'mineflayer-pathfinder';
import { createLogger } from '../utils/logger.js';

const { goals } = pathfinderPkg;
const logger = createLogger('BREWING_TOOLS');

/**
 * Brewing via the generic window API (mineflayer has no dedicated brewing
 * plugin in this version). Brewing-stand window layout:
 *   slot 0..2 = bottles, slot 3 = ingredient, slot 4 = fuel (blaze powder),
 *   slot 5.. = player inventory.
 * We shift-click items from inventory into the stand and wait for the brew.
 */
export function registerBrewingTools(registry, { bot }) {
  const mc = () => minecraftData(bot.version || '1.20.4');

  async function walkTo(pos) {
    if (bot.pathfinder && bot.entity?.position && bot.entity.position.distanceTo(pos) > 3.5) {
      bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, 2));
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 400));
        if (bot.entity.position.distanceTo(pos) <= 3.5) break;
      }
      try { bot.pathfinder.setGoal(null); } catch (_) {}
    }
  }

  // Shift-click every stack of `itemName` from the player section into the stand.
  async function shiftIn(win, itemName, limit = 64) {
    const start = win.inventoryStart;
    const end = win.inventoryEnd;
    let moved = 0;
    for (let slot = start; slot < end && moved < limit; slot++) {
      const item = win.slots[slot];
      if (item && item.name === itemName) {
        await bot.clickWindow(slot, 0, 1); // shift-click moves it to the stand section
        moved += item.count;
        await new Promise(r => setTimeout(r, 120));
      }
    }
    return moved;
  }

  registry.register({
    name: 'brew_potion',
    description: 'Brew potions at a nearby brewing stand: loads water/awkward bottles, an ingredient (e.g. nether_wart, glistering_melon_slice, spider_eye), and blaze_powder fuel, then waits. Needs the bottles, the ingredient and blaze powder in inventory.',
    parameters: {
      type: 'object',
      properties: {
        ingredientName: { type: 'string', description: 'Brewing ingredient (e.g. nether_wart, glistering_melon_slice, redstone, glowstone_dust, fermented_spider_eye)' },
        bottleName: { type: 'string', description: 'Bottle item to use (default: water_bottle or potion)' }
      },
      required: ['ingredientName']
    },
    handler: async (args) => {
      let win = null;
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };
        const data = mc();
        const standId = data.blocksByName?.brewing_stand?.id;
        if (standId == null) return { success: false, error: 'Эта версия не знает варочную стойку.' };

        const items = () => bot.inventory?.items() || [];
        const bottleName = args.bottleName || 'water_bottle';
        const hasIngredient = items().some(i => i.name === args.ingredientName);
        if (!hasIngredient) return { success: false, error: `Нет ингредиента ${args.ingredientName}.` };
        const hasBottles = items().some(i => i.name === bottleName || i.name === 'potion' || i.name === 'water_bottle');
        if (!hasBottles) return { success: false, error: `Нет бутылок (${bottleName}).` };
        const hasFuel = items().some(i => i.name === 'blaze_powder');
        if (!hasFuel) return { success: false, error: 'Нет топлива — нужен blaze_powder.' };

        const standBlock = bot.findBlock ? bot.findBlock({ matching: standId, maxDistance: 16 }) : null;
        if (!standBlock) return { success: false, error: 'Варочной стойки рядом не нашёл.' };

        await walkTo(standBlock.position);
        win = await bot.openBlock(standBlock);
        if (!win) return { success: false, error: 'Не смог открыть варочную стойку.' };

        // Load fuel, bottles, then ingredient (order helps the stand start).
        await shiftIn(win, 'blaze_powder', 1);
        const bottlesMoved = (await shiftIn(win, bottleName, 3)) || (await shiftIn(win, 'water_bottle', 3)) || (await shiftIn(win, 'potion', 3));
        await shiftIn(win, args.ingredientName, 1);

        if (!bottlesMoved) {
          return { success: false, error: 'Не удалось поставить бутылки в стойку.' };
        }

        // Brewing takes ~20s; poll bounded.
        const deadline = Date.now() + 24000;
        while (Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 2000));
          // Slot 3 (ingredient) empties when brewing completes.
          if (!win.slots[3]) break;
        }

        // Retrieve resulting potions from bottle slots.
        for (const s of [0, 1, 2]) {
          if (win.slots[s]) {
            try { await bot.clickWindow(s, 0, 1); await new Promise(r => setTimeout(r, 120)); } catch (_) {}
          }
        }

        return { success: true, data: `Сварил зелья с ${args.ingredientName} (забрал из стойки).` };
      } catch (err) {
        return { success: false, error: err.message };
      } finally {
        try { win?.close?.(); } catch (_) {}
      }
    }
  });
}
