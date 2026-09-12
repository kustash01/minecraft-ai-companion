import { createLogger } from '../utils/logger.js';

const logger = createLogger('RIDING_TOOLS');

const RIDEABLE = ['horse', 'donkey', 'mule', 'boat', 'minecart', 'pig', 'strider', 'camel', 'skeleton_horse'];

/**
 * Riding vehicles/animals and ranged bow combat — common player actions.
 */
export function registerRidingCombatTools(registry, { bot }) {
  registry.register({
    name: 'mount_entity',
    description: 'Get on a rideable entity nearby (horse, boat, minecart, pig, camel...). Walks to it if needed.',
    parameters: {
      type: 'object',
      properties: {
        entityName: { type: 'string', description: 'What to mount (e.g. horse, boat). If omitted, mounts the nearest rideable.' }
      }
    },
    handler: async (args) => {
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };
        if (bot.vehicle) return { success: false, error: 'Ты уже верхом. Сначала dismount_entity.' };

        const want = args.entityName ? String(args.entityName).toLowerCase() : null;
        const isRideable = (e) => {
          const n = (e.name || '').toLowerCase();
          if (want) return n === want || n.includes(want);
          return RIDEABLE.some(r => n === r || n.includes(r));
        };

        let target = null;
        let best = Infinity;
        for (const id in bot.entities) {
          const e = bot.entities[id];
          if (!e || !e.position || e === bot.entity) continue;
          if (!isRideable(e)) continue;
          const d = bot.entity.position.distanceTo(e.position);
          if (d < best) { best = d; target = e; }
        }
        if (!target) return { success: false, error: want ? `Рядом нет ${want}.` : 'Рядом нет транспорта/животного для езды.' };

        if (bot.pathfinder && best > 3) {
          const pathfinderPkg = await import('mineflayer-pathfinder');
          const { goals } = pathfinderPkg.default || pathfinderPkg;
          const p = target.position;
          bot.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, 1));
          const deadline = Date.now() + 6000;
          while (Date.now() < deadline && bot.entity.position.distanceTo(target.position) > 3) {
            await new Promise(r => setTimeout(r, 400));
          }
          try { bot.pathfinder.setGoal(null); } catch (_) {}
        }

        await bot.mount(target);
        await new Promise(r => setTimeout(r, 300));
        if (bot.vehicle) return { success: true, data: `Сел верхом на ${target.name}.` };
        return { success: false, error: `Не получилось сесть на ${target.name} (возможно, не приручён/занят).` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'dismount_entity',
    description: 'Get off whatever the bot is currently riding.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      try {
        if (!bot.vehicle) return { success: false, error: 'Ты сейчас не верхом.' };
        await bot.dismount();
        return { success: true, data: 'Слез.' };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'shoot_bow',
    description: 'Shoot a bow at the nearest hostile mob (or a named entity): equip bow, aim, charge and release. Requires a bow and arrows.',
    parameters: {
      type: 'object',
      properties: {
        targetName: { type: 'string', description: 'Optional entity to shoot (e.g. skeleton). Default: nearest hostile.' },
        chargeMs: { type: 'number', description: 'How long to draw the bow (default 1100ms for near-full power)' }
      }
    },
    handler: async (args) => {
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };
        const items = bot.inventory?.items() || [];
        const bow = items.find(i => i.name === 'bow');
        if (!bow) return { success: false, error: 'Нет лука.' };
        const hasArrows = items.some(i => i.name.includes('arrow'));
        if (!hasArrows) return { success: false, error: 'Нет стрел.' };

        const HOSTILE = new Set(['zombie','skeleton','creeper','spider','cave_spider','husk','stray','drowned','pillager','witch','phantom','blaze','enderman','vindicator']);
        const want = args.targetName ? String(args.targetName).toLowerCase() : null;
        let target = null, best = Infinity;
        for (const id in bot.entities) {
          const e = bot.entities[id];
          if (!e || !e.position || e === bot.entity) continue;
          const n = (e.name || '').toLowerCase();
          const match = want ? (n === want || n.includes(want)) : HOSTILE.has(n);
          if (!match) continue;
          const d = bot.entity.position.distanceTo(e.position);
          if (d < best) { best = d; target = e; }
        }
        if (!target) return { success: false, error: want ? `Не вижу ${want}.` : 'Врагов для обстрела не вижу.' };

        await bot.equip(bow, 'hand');
        // Aim slightly above the target to arc the arrow.
        await bot.lookAt(target.position.offset(0, (target.height || 1.6) * 0.9, 0), true);

        const charge = Math.min(1600, Math.max(400, args.chargeMs || 1100));
        bot.activateItem();
        await new Promise(r => setTimeout(r, charge));
        // Re-aim in case the target moved, then release.
        try { if (target.isValid && target.position) await bot.lookAt(target.position.offset(0, (target.height || 1.6) * 0.9, 0), true); } catch (_) {}
        bot.deactivateItem();

        return { success: true, data: `Выстрелил из лука по ${target.name} (${Math.round(best)}м).` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });
}
