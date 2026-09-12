import minecraftData from 'minecraft-data';
import pathfinderPkg from 'mineflayer-pathfinder';
import { createLogger } from '../utils/logger.js';

const { goals } = pathfinderPkg;
const logger = createLogger('SMELT_TRADE_TOOLS');

// Common fuels the bot will use, best-first (avoids burning valuables).
const FUEL_PRIORITY = ['coal', 'charcoal', 'coal_block', 'oak_planks', 'stick', 'oak_log', 'birch_planks', 'dried_kelp_block', 'bamboo'];

/**
 * Smelting (furnace) and villager trading — everyday player actions.
 */
export function registerSmeltTradeTools(registry, { bot }) {
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

  registry.register({
    name: 'smelt_item',
    description: 'Smelt/cook items in a nearby furnace (e.g. iron_ore->iron_ingot, raw beef->cooked). Finds a furnace, adds fuel if needed, waits, and takes the result.',
    parameters: {
      type: 'object',
      properties: {
        itemName: { type: 'string', description: 'Item to smelt (e.g. iron_ore, raw_beef, sand)' },
        count: { type: 'number', description: 'How many to smelt (default all of that item)' },
        fuelName: { type: 'string', description: 'Optional fuel item to use (e.g. coal)' }
      },
      required: ['itemName']
    },
    handler: async (args) => {
      let furnace = null;
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };
        const data = mc();
        const inputType = data.itemsByName[args.itemName];
        if (!inputType) return { success: false, error: `Неизвестный предмет: ${args.itemName}` };

        const inputItem = bot.inventory?.items()?.find(i => i.type === inputType.id);
        if (!inputItem) return { success: false, error: `Нечего плавить: нет ${args.itemName} в инвентаре.` };

        const furnaceIds = [data.blocksByName?.furnace?.id, data.blocksByName?.blast_furnace?.id, data.blocksByName?.smoker?.id].filter(v => v != null);
        const furnaceBlock = bot.findBlock ? bot.findBlock({ matching: furnaceIds, maxDistance: 24 }) : null;
        if (!furnaceBlock) return { success: false, error: 'Печи рядом не нашёл.' };

        await walkTo(furnaceBlock.position);
        furnace = await bot.openFurnace(furnaceBlock);

        // Ensure fuel present.
        if (!furnace.fuelItem()) {
          let fuelItem = null;
          if (args.fuelName) fuelItem = bot.inventory.items().find(i => i.name === args.fuelName);
          if (!fuelItem) {
            for (const f of FUEL_PRIORITY) {
              fuelItem = bot.inventory.items().find(i => i.name === f);
              if (fuelItem) break;
            }
          }
          if (!fuelItem) return { success: false, error: 'Нет топлива (уголь/доски/палки).' };
          await furnace.putFuel(fuelItem.type, null, Math.min(fuelItem.count, 8));
        }

        const count = args.count ? Math.min(args.count, inputItem.count) : inputItem.count;
        await furnace.putInput(inputType.id, null, count);

        // Wait for smelting to produce output (bounded).
        const deadline = Date.now() + Math.min(30000, count * 11000);
        let took = 0;
        while (Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 1500));
          if (furnace.outputItem()) {
            try { await furnace.takeOutput(); took++; } catch (_) {}
          }
          if (!furnace.inputItem() && !furnace.outputItem()) break;
        }
        // Grab any final output.
        try { if (furnace.outputItem()) { await furnace.takeOutput(); took++; } } catch (_) {}

        return { success: true, data: `Переплавил ${args.itemName} (получил партий: ${took}). Забери результат из инвентаря.` };
      } catch (err) {
        return { success: false, error: err.message };
      } finally {
        try { furnace?.close?.(); } catch (_) {}
      }
    }
  });

  registry.register({
    name: 'list_trades',
    description: 'Walk to the nearest villager and read what trades it offers (what it wants and gives).',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      let villager = null;
      try {
        const target = bot.nearestEntity ? bot.nearestEntity(e => e && e.name === 'villager') : null;
        if (!target) return { success: false, error: 'Жителей рядом нет.' };
        await walkTo(target.position);
        villager = await bot.openVillager(target);
        const trades = (villager.trades || []).map((t, idx) => {
          const inputs = [t.inputItem1, t.inputItem2].filter(Boolean).map(i => `${i.count}x ${i.name || i.type}`);
          const out = t.outputItem ? `${t.outputItem.count}x ${t.outputItem.name || t.outputItem.type}` : '?';
          return `#${idx}: ${inputs.join(' + ')} -> ${out}${t.tradeDisabled ? ' (недоступно)' : ''}`;
        });
        return { success: true, data: trades.length ? trades.join('; ') : 'У жителя нет сделок.', trades: villager.trades };
      } catch (err) {
        return { success: false, error: err.message };
      } finally {
        try { villager?.close?.(); } catch (_) {}
      }
    }
  });

  registry.register({
    name: 'trade_with_villager',
    description: 'Trade with the nearest villager by trade index (use list_trades first to see indices). Repeats the trade `count` times if resources allow.',
    parameters: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Trade index from list_trades' },
        count: { type: 'number', description: 'How many times to trade (default 1)' }
      },
      required: ['index']
    },
    handler: async (args) => {
      let villager = null;
      try {
        const target = bot.nearestEntity ? bot.nearestEntity(e => e && e.name === 'villager') : null;
        if (!target) return { success: false, error: 'Жителей рядом нет.' };
        await walkTo(target.position);
        villager = await bot.openVillager(target);

        const trades = villager.trades || [];
        const idx = args.index;
        if (idx == null || !trades[idx]) return { success: false, error: `Нет сделки с номером ${idx}. Сначала list_trades.` };
        if (trades[idx].tradeDisabled) return { success: false, error: `Сделка #${idx} сейчас недоступна.` };

        const count = Math.max(1, Math.min(args.count || 1, 12));
        await bot.trade(villager, idx, count);
        return { success: true, data: `Сторговал по сделке #${idx} (x${count}).` };
      } catch (err) {
        return { success: false, error: err.message };
      } finally {
        try { villager?.close?.(); } catch (_) {}
      }
    }
  });
}
