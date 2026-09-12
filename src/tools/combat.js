export function registerCombatTools(registry, { bot }) {
  registry.register({
    name: 'equip_best_gear',
    description: 'Equip the best available armor and weapon from inventory, and a shield in the off-hand if present. Use before a fight or when told to gear up.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };
        const { combatAI } = await import('../combat/combat-ai.js');
        await combatAI.equipBestGear(bot);
        return { success: true, data: 'Надел лучшую броню и оружие.' };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'attack_entity',
    description: 'Attacks the nearest matching entity using pvp plugin.',
    parameters: {
      type: 'object',
      properties: {
        entityName: { type: 'string' }
      },
      required: ['entityName']
    },
    handler: async (args) => {
      try {
        let target = null;
        let minDistance = Infinity;

        const search = String(args.entityName || '').toLowerCase().trim();
        for (const id in bot.entities) {
          const e = bot.entities[id];
          if (!e || !e.position || e === bot.entity) continue;
          const matchName = (e.name && e.name.toLowerCase() === search) ||
                            (e.username && e.username.toLowerCase() === search) ||
                            (e.displayName && e.displayName.toLowerCase() === search);
          if (matchName) {
            const dist = bot.entity.position.distanceTo(e.position);
            if (dist < minDistance) {
              minDistance = dist;
              target = e;
            }
          }
        }

        if (!target) return { success: false, error: `No ${args.entityName} found nearby.` };

        if (bot.pvp && typeof bot.pvp.attack === 'function') {
          bot.pvp.attack(target);
        } else if (typeof bot.attack === 'function') {
          bot.attack(target);
        }
        return { success: true, data: `Attacking ${target.username || target.name || args.entityName}` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  const HOSTILE_MOBS = new Set([
    'zombie', 'skeleton', 'creeper', 'spider', 'cave_spider', 'enderman',
    'witch', 'drowned', 'husk', 'stray', 'phantom', 'pillager', 'vindicator',
    'ravager', 'evoker', 'vex', 'slime', 'magma_cube', 'blaze', 'ghast',
    'wither_skeleton', 'piglin_brute', 'warden', 'zombified_piglin', 'silverfish', 'endermite'
  ]);

  registry.register({
    name: 'defend',
    description: 'Attacks the nearest hostile mob.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      try {
        const target = bot.nearestEntity((entity) =>
          entity && entity.position && (entity.type === 'mob' || entity.type === 'hostile') &&
          HOSTILE_MOBS.has(entity.name?.toLowerCase())
        );
        if (!target) return { success: true, data: 'No hostile mobs nearby.' };
        
        if (bot.pvp && typeof bot.pvp.attack === 'function') {
          bot.pvp.attack(target);
        } else if (typeof bot.attack === 'function') {
          bot.attack(target);
        }
        return { success: true, data: `Defending against ${target.name}` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'stop_attack',
    description: 'Stops combat.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      try {
        if (bot.pvp && typeof bot.pvp.stop === 'function') {
          bot.pvp.stop();
        }
        bot.clearControlStates?.();
        return { success: true, data: 'Stopped attacking.' };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });
}
