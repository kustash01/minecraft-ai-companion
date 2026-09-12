import minecraftData from 'minecraft-data';
import vec3 from 'vec3';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('UTILITY_TOOLS');

/**
 * Misc everyday utility actions: fishing and using buckets (fill/empty).
 */
export function registerUtilityTools(registry, { bot }) {
  const mc = () => minecraftData(bot.version || '1.20.4');

  registry.register({
    name: 'go_fishing',
    description: 'Fish with a fishing rod: equip the rod, cast, and wait for a catch. The bot should be next to water. Repeats up to `catches` times.',
    parameters: {
      type: 'object',
      properties: {
        catches: { type: 'number', description: 'How many fish to try to catch (default 1, max 10)' }
      }
    },
    handler: async (args) => {
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };
        if (typeof bot.fish !== 'function') return { success: false, error: 'Рыбалка не поддерживается этой версией mineflayer.' };

        const rod = bot.inventory?.items()?.find(i => i.name === 'fishing_rod');
        if (!rod) return { success: false, error: 'Нет удочки (fishing_rod) в инвентаре.' };
        await bot.equip(rod, 'hand');

        const target = Math.min(10, Math.max(1, args.catches || 1));
        let caught = 0;
        for (let i = 0; i < target; i++) {
          try {
            // bot.fish() resolves when a fish is reeled in; guard with a timeout.
            await Promise.race([
              bot.fish(),
              new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 45000)),
            ]);
            caught++;
          } catch (err) {
            if (err.message === 'timeout') break;
            // Not next to water / interrupted.
            return { success: caught > 0, data: caught > 0 ? `Поймал ${caught}, потом сорвалось: ${err.message}` : `Не вышло порыбачить: ${err.message}` };
          }
        }
        return { success: true, data: `Порыбачил, поймал ${caught} раз(а).` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'use_bucket',
    description: 'Use a bucket: fill an empty bucket from a water/lava source, or empty a full bucket at coordinates. action = "fill" or "empty".',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['fill', 'empty'], description: 'fill = scoop liquid, empty = place liquid' },
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' }
      },
      required: ['action', 'x', 'y', 'z']
    },
    handler: async (args) => {
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };
        const v = vec3(args.x, args.y, args.z);
        if (bot.entity.position.distanceTo(v) > 5) {
          return { success: false, error: 'Слишком далеко (>5 блоков). Подойди ближе.' };
        }
        const items = bot.inventory?.items() || [];

        if (args.action === 'fill') {
          const emptyBucket = items.find(i => i.name === 'bucket');
          if (!emptyBucket) return { success: false, error: 'Нет пустого ведра.' };
          const block = bot.blockAt(v);
          if (!block || !/water|lava/.test(block.name)) {
            return { success: false, error: 'В этой точке нет воды или лавы.' };
          }
          await bot.equip(emptyBucket, 'hand');
          await bot.lookAt(v, true);
          await bot.activateItem();
          await new Promise(r => setTimeout(r, 400));
          bot.deactivateItem?.();
          return { success: true, data: `Набрал ${block.name.includes('lava') ? 'лаву' : 'воду'} в ведро.` };
        }

        // empty
        const fullBucket = items.find(i => i.name === 'water_bucket' || i.name === 'lava_bucket');
        if (!fullBucket) return { success: false, error: 'Нет полного ведра (water_bucket/lava_bucket).' };
        await bot.equip(fullBucket, 'hand');
        await bot.lookAt(v, true);
        await bot.activateItem();
        await new Promise(r => setTimeout(r, 400));
        bot.deactivateItem?.();
        return { success: true, data: `Вылил ${fullBucket.name.includes('lava') ? 'лаву' : 'воду'} в точке [${args.x}, ${args.y}, ${args.z}].` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'place_boat',
    description: 'Put down a boat from inventory onto water (or ground) next to the bot, to cross a river/lake. Needs a boat item.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };
        if (typeof bot.placeEntity !== 'function') return { success: false, error: 'Размещение лодки не поддерживается этой версией.' };
        const boat = (bot.inventory?.items() || []).find(i => i.name.endsWith('_boat') || i.name === 'boat');
        if (!boat) return { success: false, error: 'Нет лодки в инвентаре.' };

        // Find water/ground within reach to place against.
        const base = bot.entity.position;
        const candidates = [
          base.offset(1, -1, 0), base.offset(-1, -1, 0),
          base.offset(0, -1, 1), base.offset(0, -1, -1),
          base.offset(1, 0, 0), base.offset(-1, 0, 0),
          base.offset(0, 0, 1), base.offset(0, 0, -1),
        ];
        let ref = null;
        for (const pos of candidates) {
          const b = bot.blockAt(pos);
          if (b && b.name !== 'air' && b.name !== 'cave_air') { ref = b; break; }
        }
        if (!ref) return { success: false, error: 'Рядом нет подходящей поверхности/воды для лодки.' };

        await bot.equip(boat, 'hand');
        await bot.placeEntity(ref, vec3(0, 1, 0));
        return { success: true, data: 'Поставил лодку рядом.' };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });
}
