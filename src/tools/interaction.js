import minecraftData from 'minecraft-data';
import vec3 from 'vec3';

export function registerInteractionTools(registry, { bot }) {
  registry.register({
    name: 'open_container',
    description: 'Opens a chest or container at the given coordinates.',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' }
      },
      required: ['x', 'y', 'z']
    },
    handler: async (args) => {
      let chest = null;
      try {
        const v = vec3(args.x, args.y, args.z);
        const block = bot.blockAt(v);
        if (!block) return { success: false, error: 'No block at coordinates.' };

        if (bot.entity?.position && bot.entity.position.distanceTo(v) > 4.5) {
          return { success: false, error: 'Контейнер слишком далеко (расстояние > 4.5 блоков). Подойди ближе.' };
        }

        chest = await bot.openContainer(block);
        const items = chest.containerItems ? chest.containerItems() : [];
        return { success: true, data: items.map(i => `${i.count}x ${i.name}`).join(', ') || 'Empty' };
      } catch (err) {
        return { success: false, error: err.message };
      } finally {
        if (chest && typeof chest.close === 'function') {
          try { chest.close(); } catch (_) {}
        }
      }
    }
  });

  registry.register({
    name: 'list_chest_contents',
    description: 'Open a chest/barrel at coordinates and read what is inside, without taking anything. Use to check storage before deciding what to withdraw.',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' }
      },
      required: ['x', 'y', 'z']
    },
    handler: async (args) => {
      let chest = null;
      try {
        const v = vec3(args.x, args.y, args.z);
        const block = bot.blockAt(v);
        if (!block) return { success: false, error: 'No block at coordinates.' };
        if (bot.entity?.position && bot.entity.position.distanceTo(v) > 4.5) {
          return { success: false, error: 'Контейнер слишком далеко (>4.5 блоков). Подойди ближе.' };
        }
        chest = await bot.openContainer(block);
        const items = chest.containerItems ? chest.containerItems() : [];
        const summary = items.length
          ? items.map(i => `${i.count}x ${i.name}`).join(', ')
          : 'пусто';
        return { success: true, data: summary, items: items.map(i => ({ name: i.name, count: i.count })) };
      } catch (err) {
        return { success: false, error: err.message };
      } finally {
        if (chest && typeof chest.close === 'function') {
          try { chest.close(); } catch (_) {}
        }
      }
    }
  });

  registry.register({
    name: 'deposit_items',
    description: 'Puts items in a container.',
    parameters: {
      type: 'object',
      properties: {
        itemName: { type: 'string' },
        count: { type: 'number' },
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' }
      },
      required: ['itemName', 'x', 'y', 'z']
    },
    handler: async (args) => {
      let chest = null;
      try {
        const v = vec3(args.x, args.y, args.z);
        const block = bot.blockAt(v);
        if (!block) return { success: false, error: 'No block at coordinates.' };

        if (bot.entity?.position && bot.entity.position.distanceTo(v) > 4.5) {
          return { success: false, error: 'Контейнер слишком далеко (расстояние > 4.5 блоков). Подойди ближе.' };
        }

        const mcData = minecraftData(bot.version || '1.20.1');
        const itemType = mcData.itemsByName[args.itemName];
        if (!itemType) return { success: false, error: `Unknown item: ${args.itemName}` };

        chest = await bot.openContainer(block);
        const item = bot.inventory?.items()?.find(i => i.type === itemType.id);
        if (!item) {
          return { success: false, error: `Do not have item: ${args.itemName}` };
        }

        const amount = args.count ? Math.min(args.count, item.count) : item.count;
        await chest.deposit(itemType.id, null, amount);
        return { success: true, data: `Deposited ${amount} ${args.itemName}` };
      } catch (err) {
        return { success: false, error: err.message };
      } finally {
        if (chest && typeof chest.close === 'function') {
          try { chest.close(); } catch (_) {}
        }
      }
    }
  });

  registry.register({
    name: 'withdraw_items',
    description: 'Takes items from a container.',
    parameters: {
      type: 'object',
      properties: {
        itemName: { type: 'string' },
        count: { type: 'number' },
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' }
      },
      required: ['itemName', 'x', 'y', 'z']
    },
    handler: async (args) => {
      let chest = null;
      try {
        const v = vec3(args.x, args.y, args.z);
        const block = bot.blockAt(v);
        if (!block) return { success: false, error: 'No block at coordinates.' };

        if (bot.entity?.position && bot.entity.position.distanceTo(v) > 4.5) {
          return { success: false, error: 'Контейнер слишком далеко (расстояние > 4.5 блоков). Подойди ближе.' };
        }

        const mcData = minecraftData(bot.version || '1.20.1');
        const itemType = mcData.itemsByName[args.itemName];
        if (!itemType) return { success: false, error: `Unknown item: ${args.itemName}` };

        chest = await bot.openContainer(block);
        const item = chest.containerItems?.()?.find(i => i.type === itemType.id);
        if (!item) {
          return { success: false, error: `Container does not have item: ${args.itemName}` };
        }

        const amount = args.count ? Math.min(args.count, item.count) : item.count;
        await chest.withdraw(itemType.id, null, amount);
        return { success: true, data: `Withdrew ${amount} ${args.itemName}` };
      } catch (err) {
        return { success: false, error: err.message };
      } finally {
        if (chest && typeof chest.close === 'function') {
          try { chest.close(); } catch (_) {}
        }
      }
    }
  });

  registry.register({
    name: 'place_block',
    description: 'Places a block.',
    parameters: {
      type: 'object',
      properties: {
        blockName: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' }
      },
      required: ['blockName', 'x', 'y', 'z']
    },
    handler: async (args) => {
      try {
        // Requires more complex logic for face vector etc. Simplified version:
        const mcData = minecraftData(bot.version);
        const itemType = mcData.itemsByName[args.blockName];
        if (!itemType) return { success: false, error: `Unknown block item: ${args.blockName}` };
        
        const item = bot.inventory.items().find(i => i.type === itemType.id);
        if (!item) return { success: false, error: `Do not have item: ${args.blockName}` };

        await bot.equip(item, 'hand');
        
        const v = vec3(args.x, args.y, args.z);
        const targetBlock = bot.blockAt(v);

        let referenceBlock = null;
        let faceVector = null;

        if (!targetBlock || targetBlock.name === 'air' || targetBlock.name.includes('water') || targetBlock.name.includes('lava')) {
          const neighbors = [
            { pos: v.offset(0, -1, 0), face: vec3(0, 1, 0) },
            { pos: v.offset(0, 1, 0), face: vec3(0, -1, 0) },
            { pos: v.offset(-1, 0, 0), face: vec3(1, 0, 0) },
            { pos: v.offset(1, 0, 0), face: vec3(-1, 0, 0) },
            { pos: v.offset(0, 0, -1), face: vec3(0, 0, 1) },
            { pos: v.offset(0, 0, 1), face: vec3(0, 0, -1) },
          ];
          for (const n of neighbors) {
            const b = bot.blockAt(n.pos);
            if (b && b.name !== 'air' && !b.name.includes('water') && !b.name.includes('lava')) {
              referenceBlock = b;
              faceVector = n.face;
              break;
            }
          }
        } else {
          referenceBlock = targetBlock;
          faceVector = vec3(0, 1, 0);
        }

        if (!referenceBlock) {
          return { success: false, error: 'No solid block nearby to place against.' };
        }

        await bot.placeBlock(referenceBlock, faceVector);
        return { success: true, data: `Placed ${args.blockName} at ${args.x}, ${args.y}, ${args.z}` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'activate_block',
    description: 'Right-clicks a block (doors, buttons, etc).',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' }
      },
      required: ['x', 'y', 'z']
    },
    handler: async (args) => {
      try {
        const v = vec3(args.x, args.y, args.z);
        const block = bot.blockAt(v);
        if (!block) return { success: false, error: 'No block there.' };

        await bot.activateBlock(block);
        return { success: true, data: `Activated block at ${args.x}, ${args.y}, ${args.z}` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'smart_repair_crater',
    description: 'Intelligently repairs an explosion crater (from creepers or TNT) or hole using the authentic surrounding materials (dirt/grass for landscape, wood planks for wooden houses, stone for mines).',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' },
        radius: { type: 'number', default: 3 }
      },
      required: ['x', 'y', 'z']
    },
    handler: async (args) => {
      try {
        const { SmartCraterRepair } = await import('../behavior/smart-repair.js');
        const centerPos = vec3(args.x, args.y, args.z);
        const result = await SmartCraterRepair.repairCrater(bot, centerPos, { radius: args.radius || 3 });
        return {
          success: true,
          data: `Кратер восстановлен аутентичными материалами (${result.repaired} блоков): ${result.blocksPlaced.join(', ') || 'нет подходящих блоков'}`,
        };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'dump_clutter_to_chest',
    description: 'Dumps excess inventory clutter (extra dirt, cobble, mob drops, seeds) into a nearby base chest while preserving weapons, armor, tools, and food.',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' }
      }
    },
    handler: async (args) => {
      let chest = null;
      try {
        let chestBlock = null;
        if (args.x !== undefined && args.y !== undefined && args.z !== undefined) {
          chestBlock = bot.blockAt(vec3(args.x, args.y, args.z));
        } else if (bot.findBlock) {
          const mcData = (await import('minecraft-data')).default(bot.version || '1.20.1');
          const chestIds = [mcData.blocksByName?.chest?.id, mcData.blocksByName?.barrel?.id].filter(Boolean);
          chestBlock = bot.findBlock({ matching: chestIds, maxDistance: 10 });
        }

        if (!chestBlock) {
          return { success: false, error: 'Поблизости не найден сундук или бочка для сброса хлама.' };
        }

        chest = await bot.openContainer(chestBlock);
        const items = bot.inventory?.items() || [];

        // Категории хлама, которые безопасно сбросить в сундук-помойку
        const clutterTypes = [
          'dirt', 'cobblestone', 'gravel', 'sand', 'diorite', 'andesite', 'granite',
          'rotten_flesh', 'bone', 'spider_eye', 'string', 'wheat_seeds', 'beetroot_seeds',
          'poisonous_potato', 'egg', 'feather', 'flint'
        ];

        let depositedCount = 0;
        const depositedNames = [];

        // Сохраняем 1 стак строительных блоков для себя
        let keptBuildingStack = false;

        for (const item of items) {
          const isClutter = clutterTypes.some((c) => item.name.includes(c));
          if (!isClutter) continue;

          // Сохраняем первый стак булыжника или земли
          if (!keptBuildingStack && (item.name.includes('cobblestone') || item.name.includes('dirt'))) {
            keptBuildingStack = true;
            continue;
          }

          try {
            await chest.deposit(item.type, null, item.count);
            depositedCount += item.count;
            depositedNames.push(item.name);
          } catch (_) {}
        }

        return {
          success: true,
          data: `Сброшено ${depositedCount} предметов в сундук-помойку: ${depositedNames.slice(0, 5).join(', ')}${depositedNames.length > 5 ? '...' : ''}`,
        };
      } catch (err) {
        return { success: false, error: err.message };
      } finally {
        if (chest?.close) {
          try { chest.close(); } catch (_) {}
        }
      }
    }
  });
}


