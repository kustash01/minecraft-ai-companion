import minecraftData from 'minecraft-data';
import pathfinderPkg from 'mineflayer-pathfinder';
import { createLogger } from '../utils/logger.js';

const { goals } = pathfinderPkg;
const logger = createLogger('SURVIVAL_TOOLS');

/**
 * Everyday survival actions a normal player does: sleep through the night,
 * pick up dropped items off the ground.
 */
export function registerSurvivalTools(registry, { bot }) {
  registry.register({
    name: 'sleep',
    description: 'Find a nearby bed and sleep in it (only works at night or during a thunderstorm). Use when it is night and the player wants to skip to morning or set spawn.',
    parameters: {
      type: 'object',
      properties: {
        maxDistance: { type: 'number', description: 'How far to look for a bed (default 16)' }
      }
    },
    handler: async (args) => {
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };
        const mc = minecraftData(bot.version || '1.20.4');
        const bedIds = Object.values(mc.blocksByName)
          .filter(b => b && b.name.endsWith('_bed'))
          .map(b => b.id);

        const bedPos = bot.findBlock ? bot.findBlock({ matching: bedIds, maxDistance: args.maxDistance || 16 }) : null;
        if (!bedPos) return { success: false, error: 'Кровати рядом не нашёл.' };

        const bedBlock = bot.blockAt(bedPos.position || bedPos);
        if (!bedBlock) return { success: false, error: 'Не смог считать кровать.' };

        // Walk up to the bed if pathfinder is available and we are far.
        if (bot.pathfinder && bot.entity.position.distanceTo(bedBlock.position) > 3) {
          const p = bedBlock.position;
          bot.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, 2));
          await new Promise(r => setTimeout(r, 2500));
        }

        try {
          await bot.sleep(bedBlock);
          return { success: true, data: 'Лёг спать, скоро утро.' };
        } catch (err) {
          const msg = err.message || String(err);
          if (/can only sleep at night|thunderstorm|now/i.test(msg)) {
            return { success: false, error: 'Спать можно только ночью или в грозу.' };
          }
          if (/monsters|too far|occupied/i.test(msg)) {
            return { success: false, error: `Не получилось лечь: ${msg}` };
          }
          return { success: false, error: msg };
        }
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'wake_up',
    description: 'Get out of bed.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      try {
        if (typeof bot.wake === 'function') {
          await bot.wake();
          return { success: true, data: 'Встал.' };
        }
        return { success: false, error: 'Не в кровати.' };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'collect_nearby_items',
    description: 'Pick up dropped item entities on the ground nearby (walk over them to collect). Use after mining, killing mobs, or when items are scattered around.',
    parameters: {
      type: 'object',
      properties: {
        maxDistance: { type: 'number', description: 'Radius to collect within (default 16, max 32)' }
      }
    },
    handler: async (args) => {
      try {
        if (!bot.entity?.position) return { success: false, error: 'Бот ещё не заспавнился.' };
        if (!bot.pathfinder) return { success: false, error: 'Pathfinder не инициализирован.' };

        const maxDistance = Math.min(32, Math.max(2, args.maxDistance || 16));
        const isDrop = (e) => e && (e.name === 'item' || e.objectType === 'Item' || e.displayName === 'Item' || e.entityType != null && e.name === 'item');

        const drops = Object.values(bot.entities || {})
          .filter(e => e && e.position && isDrop(e))
          .map(e => ({ e, dist: bot.entity.position.distanceTo(e.position) }))
          .filter(x => x.dist <= maxDistance)
          .sort((a, b) => a.dist - b.dist);

        if (drops.length === 0) return { success: true, data: 'Предметов на земле рядом нет.' };

        let collected = 0;
        const deadline = Date.now() + 15000;
        for (const { e } of drops) {
          if (Date.now() > deadline) break;
          if (!e.isValid || !e.position) { continue; }
          const p = e.position;
          bot.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, 1));
          // Wait until we reach it or it despawns/collected.
          const itemDeadline = Date.now() + 4000;
          while (Date.now() < itemDeadline && e.isValid) {
            await new Promise(r => setTimeout(r, 400));
            if (!e.position || bot.entity.position.distanceTo(p) <= 1.5) break;
          }
          if (!e.isValid) collected++;
        }
        try { bot.pathfinder.setGoal(null); } catch (_) {}

        return { success: true, data: `Подобрал предметы (${collected} из ${drops.length} замеченных).` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });
}
