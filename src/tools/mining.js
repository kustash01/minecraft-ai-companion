import minecraftData from 'minecraft-data';
import vec3 from 'vec3';

export function registerMiningTools(registry, { bot }) {
  registry.register({
    name: 'mine_block',
    description: 'Finds and mines a specific block type nearby using collectblock.',
    parameters: {
      type: 'object',
      properties: {
        blockName: { type: 'string' },
        count: { type: 'number', default: 1 }
      },
      required: ['blockName']
    },
    handler: async (args) => {
      try {
        if (!bot.collectBlock || typeof bot.collectBlock.collect !== 'function') {
          return { success: false, error: 'Плагин collectBlock не загружен.' };
        }

        const mcData = minecraftData(bot.version || '1.20.1');
        const rawName = (args.blockName || args.blockType || 'oak_log').toLowerCase();
        let targetIds = [];

        // Умный поиск: если просят дерево/wood/log/tree — ищем любые бревна поблизости
        if (['wood', 'tree', 'log', 'дерево', 'бревно', 'дуб', 'береза', 'сосна'].some((k) => rawName.includes(k))) {
          targetIds = Object.values(mcData.blocksByName)
            .filter((b) => b && (b.name.includes('_log') || b.name.includes('_wood') || b.name.includes('stem')))
            .map((b) => b.id);
        } else if (['stone', 'камень', 'булыжник', 'cobble'].some((k) => rawName.includes(k))) {
          targetIds = Object.values(mcData.blocksByName)
            .filter((b) => b && (b.name === 'stone' || b.name === 'cobblestone' || b.name === 'deepslate'))
            .map((b) => b.id);
        } else if (mcData.blocksByName[rawName]) {
          targetIds = [mcData.blocksByName[rawName].id];
        } else {
          const found = Object.values(mcData.blocksByName).find((b) => b && b.name.includes(rawName));
          if (found) targetIds = [found.id];
        }

        if (targetIds.length === 0) {
          return { success: false, error: `Неизвестный тип блока: ${rawName}` };
        }

        const blocks = bot.findBlocks({
          matching: targetIds,
          maxDistance: 64,
          count: args.count || 3,
        });

        if (blocks.length === 0) {
          return { success: false, error: `Поблизости не найдено блоков типа ${rawName}.` };
        }

        const targets = blocks.map((pos) => bot.blockAt(pos)).filter(Boolean);
        await bot.collectBlock.collect(targets);
        return { success: true, data: `Успешно добыто ${targets.length} блоков (${rawName}).` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'dig_block',
    description: 'Digs a specific block at exact coordinates.',
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
        if (!block || block.name === 'air') return { success: false, error: 'No block there.' };

        if (bot.entity?.position && bot.entity.position.distanceTo(v) > 5) {
          return { success: false, error: 'Too far away (distance > 5 blocks).' };
        }

        if (typeof bot.canDigBlock === 'function' && !bot.canDigBlock(block)) {
          return { success: false, error: `Cannot dig block ${block.name} at coordinates.` };
        }

        if (bot.tool?.equipForBlock) {
          try {
            await bot.tool.equipForBlock(block);
          } catch (_) {}
        }

        await bot.dig(block);
        return { success: true, data: `Dug block at ${args.x}, ${args.y}, ${args.z}` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });
}
