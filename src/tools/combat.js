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
    description: 'Attack a nearby entity (mob, animal, or player) until it is dead. Walks up to the target, equips the best weapon, and keeps swinging — works on passive mobs (llama, cow) and hostiles alike.',
    parameters: {
      type: 'object',
      properties: {
        entityName: { type: 'string' }
      },
      required: ['entityName']
    },
    handler: async (args) => {
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };

        const search = String(args.entityName || '').toLowerCase().trim();

        // Find the nearest matching entity. Flexible matching so "llama" also
        // matches "trader_llama", "zombie" matches, a player nick matches, etc.
        const findTarget = () => {
          let best = null;
          let bestDist = Infinity;
          for (const id in bot.entities) {
            const e = bot.entities[id];
            if (!e || !e.position || e === bot.entity || e.isValid === false) continue;
            const name = (e.name || '').toLowerCase();
            const uname = (e.username || '').toLowerCase();
            const dname = (e.displayName || '').toLowerCase();
            const match = name === search || uname === search || dname === search ||
                          name.includes(search) || search.includes(name && name.length ? name : '\0');
            if (!match) continue;
            const dist = bot.entity.position.distanceTo(e.position);
            if (dist < bestDist) { bestDist = dist; best = e; }
          }
          return best;
        };

        let target = findTarget();
        if (!target) return { success: false, error: `Рядом нет ${args.entityName}.` };
        const targetId = target.id;
        const label = target.username || target.name || args.entityName;

        // Equip the best weapon/gear first — a real player gears up before a fight.
        try {
          const { combatAI } = await import('../combat/combat-ai.js');
          await combatAI.equipBestGear(bot);
        } catch (_) {}

        // Start the pvp plugin's attack loop if available (it handles swing timing).
        if (bot.pvp && typeof bot.pvp.attack === 'function') {
          try { bot.pvp.attack(target); } catch (_) {}
        }

        // Actively drive the bot to the target and swing until it dies /
        // becomes unreachable / times out. This is the part that was missing:
        // previously the tool returned instantly and the bot just stood there.
        let goals = null;
        try {
          const pathfinderPkg = await import('mineflayer-pathfinder');
          goals = (pathfinderPkg.default || pathfinderPkg).goals;
        } catch (_) {}

        const deadline = Date.now() + 15000; // give it up to 15s to close and kill
        let lastSwing = 0;
        let stuckSince = Date.now();
        let lastPos = bot.entity.position.clone?.() || null;

        while (Date.now() < deadline) {
          const live = bot.entities?.[targetId];
          // Target gone (killed / despawned / out of range) => treat as done.
          if (!live || live.isValid === false || !live.position) {
            break;
          }

          const dist = bot.entity.position.distanceTo(live.position);

          // In melee range: swing directly (works even if the pvp plugin stalls).
          if (dist <= 3.2) {
            await bot.lookAt(live.position.offset(0, (live.height || 1) * 0.5, 0), true);
            if (Date.now() - lastSwing > 550) {
              try { bot.attack(live); } catch (_) {}
              lastSwing = Date.now();
            }
          } else if (goals && bot.pathfinder) {
            // Too far: path toward it (pvp sometimes fails to approach).
            try {
              const g = new goals.GoalFollow(live, 2);
              if (!bot.pathfinder.isMoving?.() || bot.pathfinder.goal == null) {
                bot.pathfinder.setGoal(g, true);
              }
            } catch (_) {}
          }

          // Stuck detection: if we can't get closer for a while and never reach
          // melee, bail out with an honest failure instead of standing forever.
          const now = Date.now();
          if (lastPos) {
            const moved = bot.entity.position.distanceTo(lastPos);
            if (moved > 0.4) { stuckSince = now; lastPos = bot.entity.position.clone?.() || lastPos; }
          }
          if (dist > 3.2 && now - stuckSince > 6000) {
            try { bot.pvp?.stop?.(); bot.pathfinder?.setGoal?.(null); } catch (_) {}
            return { success: false, error: `Не могу подобраться к ${label} — путь перекрыт.` };
          }

          await new Promise(r => setTimeout(r, 200));
        }

        try { bot.pathfinder?.setGoal?.(null); } catch (_) {}

        const stillAlive = bot.entities?.[targetId];
        if (!stillAlive || stillAlive.isValid === false) {
          try { bot.pvp?.stop?.(); } catch (_) {}
          return { success: true, data: `Убил ${label}.` };
        }
        // Still swinging but not dead within the window — keep pvp engaged.
        return { success: true, data: `Дерусь с ${label}, добиваю.` };
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
