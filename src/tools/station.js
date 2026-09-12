import minecraftData from 'minecraft-data';
import pathfinderPkg from 'mineflayer-pathfinder';
import { createLogger } from '../utils/logger.js';

const { goals } = pathfinderPkg;
const logger = createLogger('STATION_TOOLS');

/**
 * Enchanting table and anvil operations — gear upgrade actions a player does.
 */
export function registerStationTools(registry, { bot }) {
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
    name: 'enchant_item',
    description: 'Enchant an item at a nearby enchanting table. Needs lapis lazuli and enough XP levels. Picks the requested enchant slot (0=cheapest ... 2=best) — default best affordable.',
    parameters: {
      type: 'object',
      properties: {
        itemName: { type: 'string', description: 'Item to enchant (e.g. diamond_sword, diamond_pickaxe, book)' },
        slot: { type: 'number', description: 'Enchant option 0..2 (0 cheapest, 2 strongest). Default: highest affordable.' }
      },
      required: ['itemName']
    },
    handler: async (args) => {
      let table = null;
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };
        const data = mc();
        const itemType = data.itemsByName[args.itemName];
        if (!itemType) return { success: false, error: `Неизвестный предмет: ${args.itemName}` };

        const item = bot.inventory?.items()?.find(i => i.type === itemType.id);
        if (!item) return { success: false, error: `Нет предмета ${args.itemName} в инвентаре.` };

        const hasLapis = (bot.inventory?.items() || []).some(i => i.name === 'lapis_lazuli');
        if (!hasLapis) return { success: false, error: 'Нужен лазурит (lapis_lazuli) для зачарования.' };

        const tableId = data.blocksByName?.enchanting_table?.id;
        const tableBlock = (tableId != null && bot.findBlock) ? bot.findBlock({ matching: tableId, maxDistance: 16 }) : null;
        if (!tableBlock) return { success: false, error: 'Стол зачарований рядом не нашёл.' };

        await walkTo(tableBlock.position);
        table = await bot.openEnchantmentTable(tableBlock);

        await table.putTargetItem(item);
        const lapis = bot.inventory.items().find(i => i.name === 'lapis_lazuli');
        if (lapis) await table.putLapis(lapis);

        // Wait for enchant options to populate.
        const deadline = Date.now() + 4000;
        while (Date.now() < deadline && (!table.enchantments || table.enchantments.every(e => !e || e.level <= 0))) {
          await new Promise(r => setTimeout(r, 300));
        }
        const options = table.enchantments || [];
        const affordable = options
          .map((e, i) => ({ i, level: e?.level ?? 0 }))
          .filter(o => o.level > 0 && o.level <= (bot.experience?.level ?? 0));
        if (affordable.length === 0) return { success: false, error: 'Не хватает уровней опыта для доступных зачарований.' };

        let choice = args.slot;
        if (choice == null || !affordable.some(o => o.i === choice)) {
          choice = affordable[affordable.length - 1].i; // highest affordable
        }
        await table.enchant(choice);
        try { if (table.targetItem()) await table.takeTargetItem(); } catch (_) {}
        return { success: true, data: `Зачаровал ${args.itemName} (вариант #${choice}).` };
      } catch (err) {
        return { success: false, error: err.message };
      } finally {
        try { table?.close?.(); } catch (_) {}
      }
    }
  });

  registry.register({
    name: 'anvil_combine',
    description: 'Use a nearby anvil to combine two items (e.g. repair a tool with another of the same, or apply an enchanted book), with an optional new name.',
    parameters: {
      type: 'object',
      properties: {
        itemName: { type: 'string', description: 'First / target item (e.g. diamond_sword)' },
        secondItemName: { type: 'string', description: 'Second item (material, same tool, or enchanted_book)' },
        newName: { type: 'string', description: 'Optional new name for the result' }
      },
      required: ['itemName', 'secondItemName']
    },
    handler: async (args) => {
      let anvil = null;
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };
        const data = mc();
        const t1 = data.itemsByName[args.itemName];
        const t2 = data.itemsByName[args.secondItemName];
        if (!t1) return { success: false, error: `Неизвестный предмет: ${args.itemName}` };
        if (!t2) return { success: false, error: `Неизвестный предмет: ${args.secondItemName}` };

        const items = bot.inventory?.items() || [];
        const item1 = items.find(i => i.type === t1.id);
        const item2 = items.find(i => i.type === t2.id);
        if (!item1) return { success: false, error: `Нет ${args.itemName}.` };
        if (!item2) return { success: false, error: `Нет ${args.secondItemName}.` };

        const anvilIds = [data.blocksByName?.anvil?.id, data.blocksByName?.chipped_anvil?.id, data.blocksByName?.damaged_anvil?.id].filter(v => v != null);
        const anvilBlock = bot.findBlock ? bot.findBlock({ matching: anvilIds, maxDistance: 16 }) : null;
        if (!anvilBlock) return { success: false, error: 'Наковальни рядом не нашёл.' };

        await walkTo(anvilBlock.position);
        anvil = await bot.openAnvil(anvilBlock);
        await anvil.combine(item1, item2, args.newName);
        return { success: true, data: `Скомбинировал на наковальне: ${args.itemName} + ${args.secondItemName}${args.newName ? ` -> "${args.newName}"` : ''}.` };
      } catch (err) {
        return { success: false, error: err.message };
      } finally {
        try { anvil?.close?.(); } catch (_) {}
      }
    }
  });

  registry.register({
    name: 'anvil_rename',
    description: 'Rename an item using a nearby anvil (costs XP).',
    parameters: {
      type: 'object',
      properties: {
        itemName: { type: 'string' },
        newName: { type: 'string' }
      },
      required: ['itemName', 'newName']
    },
    handler: async (args) => {
      let anvil = null;
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };
        const data = mc();
        const t1 = data.itemsByName[args.itemName];
        if (!t1) return { success: false, error: `Неизвестный предмет: ${args.itemName}` };
        const item = (bot.inventory?.items() || []).find(i => i.type === t1.id);
        if (!item) return { success: false, error: `Нет ${args.itemName}.` };

        const anvilIds = [data.blocksByName?.anvil?.id, data.blocksByName?.chipped_anvil?.id, data.blocksByName?.damaged_anvil?.id].filter(v => v != null);
        const anvilBlock = bot.findBlock ? bot.findBlock({ matching: anvilIds, maxDistance: 16 }) : null;
        if (!anvilBlock) return { success: false, error: 'Наковальни рядом не нашёл.' };

        await walkTo(anvilBlock.position);
        anvil = await bot.openAnvil(anvilBlock);
        await anvil.rename(item, args.newName);
        return { success: true, data: `Переименовал ${args.itemName} -> "${args.newName}".` };
      } catch (err) {
        return { success: false, error: err.message };
      } finally {
        try { anvil?.close?.(); } catch (_) {}
      }
    }
  });
}
