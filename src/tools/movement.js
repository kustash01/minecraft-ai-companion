import pathfinderPkg from 'mineflayer-pathfinder';
import vec3 from 'vec3';

const { goals } = pathfinderPkg;

/**
 * Регистрирует инструменты движения.
 */
export function registerMovementTools(registry, { bot, worldState, mcBot }) {
  let homePosition = null;

  registry.register({
    name: 'move_to',
    description: 'Move the bot to specific x, y, z coordinates in the world.',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
        z: { type: 'number', description: 'Z coordinate' },
      },
      required: ['x', 'y', 'z'],
    },
    handler: async (args) => {
      try {
        if (!bot.pathfinder) return { success: false, error: 'Pathfinder не инициализирован.' };
        const goal = new goals.GoalNear(Math.floor(args.x), Math.floor(args.y), Math.floor(args.z), 1);
        bot.pathfinder.setGoal(goal);
        return { success: true, data: `Moving to ${args.x}, ${args.y}, ${args.z}` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  });

  registry.register({
    name: 'follow_player',
    description: 'Follow a specific player at a given distance.',
    parameters: {
      type: 'object',
      properties: {
        playerName: { type: 'string', description: 'Name of the player to follow' },
        distance: { type: 'number', description: 'Distance to keep from the player (default 3)' },
      },
      required: ['playerName'],
    },
    handler: async (args) => {
      try {
        if (!bot.pathfinder) return { success: false, error: 'Pathfinder не инициализирован.' };
        const player = bot.players[args.playerName]
          || Object.entries(bot.players || {}).find(([name]) => name.toLowerCase() === args.playerName.toLowerCase())?.[1];
        if (!player || !player.entity) {
          return { success: false, error: `Игрок ${args.playerName} не найден или слишком далеко.` };
        }
        const distance = args.distance || 3;
        const goal = new goals.GoalFollow(player.entity, distance);
        bot.pathfinder.setGoal(goal, true); // true = dynamic (updates as player moves)
        return { success: true, data: `Следую за ${args.playerName} на расстоянии ${distance}` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  });

  registry.register({
    name: 'stop_moving',
    description: 'Stop all current movement and pathfinding.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      try {
        bot.pathfinder?.stop?.();
        bot.clearControlStates?.();
        return { success: true, data: 'Остановился.' };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  });

  registry.register({
    name: 'set_home',
    description: 'Save the current position as home base.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      if (!bot.entity) return { success: false, error: 'Бот не заспавнился' };
      homePosition = {
        x: Math.floor(bot.entity.position.x),
        y: Math.floor(bot.entity.position.y),
        z: Math.floor(bot.entity.position.z),
      };
      return { success: true, data: `Дом установлен: ${homePosition.x}, ${homePosition.y}, ${homePosition.z}` };
    },
  });

  registry.register({
    name: 'go_home',
    description: 'Navigate back to the saved home position.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      if (!homePosition) return { success: false, error: 'Дом не установлен. Сначала используй set_home.' };
      try {
        if (!bot.pathfinder) return { success: false, error: 'Pathfinder не инициализирован.' };
        const goal = new goals.GoalNear(homePosition.x, homePosition.y, homePosition.z, 1);
        bot.pathfinder.setGoal(goal);
        return { success: true, data: `Возвращаюсь домой: ${homePosition.x}, ${homePosition.y}, ${homePosition.z}` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  });

  registry.register({
    name: 'look_at',
    description: 'Smoothly turns the camera to look at specific coordinates or a player.',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
        z: { type: 'number', description: 'Z coordinate' },
        playerName: { type: 'string', description: 'Optional player name to look at' },
      },
    },
    handler: async (args) => {
      try {
        const { adaptiveCamera } = await import('../behavior/adaptive-camera.js');
        if (args.playerName) {
          const player = bot.players[args.playerName]
            || Object.entries(bot.players || {}).find(([name]) => name.toLowerCase() === args.playerName.toLowerCase())?.[1];
          if (player?.entity) {
            await adaptiveCamera.calmLookAt(bot, player.entity.position.offset(0, player.entity.height || 1.6, 0));
            return { success: true, data: `Посмотрел на игрока ${args.playerName}` };
          }
        }
        if (args.x !== undefined && args.y !== undefined && args.z !== undefined) {
          const target = vec3(args.x, args.y, args.z);
          await adaptiveCamera.calmLookAt(bot, target);
          return { success: true, data: `Посмотрел на ${args.x}, ${args.y}, ${args.z}` };
        }
        return { success: false, error: 'Укажи координаты или имя игрока.' };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  });

  registry.register({
    name: 'crouch_salute',
    description: 'Friendly crouch / shift spam (twerk) to say hello, thank a teammate, or celebrate.',
    parameters: {
      type: 'object',
      properties: {
        times: { type: 'number', default: 3, description: 'Number of crouches (2 to 5)' }
      }
    },
    handler: async (args) => {
      try {
        const { KinematicsEngine } = await import('../behavior/kinematics.js');
        await KinematicsEngine.crouchNod(bot, Math.min(5, Math.max(1, args.times || 3)));
        return { success: true, data: 'Поприседал на шифте (приветствие/благодарность).' };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'safe_edge_sneak',
    description: 'Holds shift (sneak) to safely walk along the edge of a cliff, bridge, or ravine without falling.',
    parameters: {
      type: 'object',
      properties: {
        durationMs: { type: 'number', default: 3000, description: 'Duration to hold sneak in ms' }
      }
    },
    handler: async (args) => {
      try {
        const duration = args.durationMs || 3000;
        bot.setControlState('sneak', true);
        setTimeout(() => {
          bot.setControlState('sneak', false);
        }, duration);
        return { success: true, data: `Безопасный шифт включен на ${duration} мс.` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'parkour_jump',
    description: 'Executes a sprint-jump forward to clear 1-2 block gaps or parkour obstacles.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      try {
        const { HumanMotor } = await import('../behavior/human-motor.js');
        HumanMotor.startJumpSprint(bot);
        return { success: true, data: 'Совершен паркурный прыжок со спринтом.' };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'pillar_up',
    description: 'Pillars up by jumping and placing solid blocks directly under feet to climb ledges or escape mob swarms.',
    parameters: {
      type: 'object',
      properties: {
        height: { type: 'number', default: 3, description: 'Number of blocks to pillar up (1 to 5)' },
        blockName: { type: 'string', description: 'Optional block name from inventory (e.g. cobblestone, dirt, planks)' }
      }
    },
    handler: async (args) => {
      try {
        const height = Math.min(5, Math.max(1, args.height || 3));
        const items = bot.inventory?.items() || [];

        // Ищем твердый строительный блок
        let blockItem = null;
        if (args.blockName) {
          blockItem = items.find((i) => i.name.includes(args.blockName));
        }
        if (!blockItem) {
          const solidKeywords = [
            'cobblestone', 'dirt', 'stone', 'planks', 'netherrack', 'deepslate',
            'granite', 'diorite', 'andesite', 'sandstone', 'tuff', 'basalt',
            'terracotta', 'mud', 'blackstone', 'end_stone', 'bricks', 'concrete',
          ];
          blockItem = items.find((i) =>
            solidKeywords.some((type) => i.name.includes(type))
          );
        }

        if (!blockItem) {
          return { success: false, error: 'В инвентаре нет твердых строительных блоков для столба.' };
        }

        await bot.equip(blockItem, 'hand');
        let placed = 0;

        for (let i = 0; i < height; i++) {
          const currentPos = bot.entity.position;
          const blockBelow = bot.blockAt(currentPos.offset(0, -1, 0));
          if (!blockBelow || blockBelow.name === 'air') break;

          // Резкий взгляд строго под ноги
          await bot.look(bot.entity.yaw, -Math.PI / 2, true);

          // Прыжок
          bot.setControlState('jump', true);
          await new Promise((r) => setTimeout(r, 160));

          // Ставим блок под ноги в воздухе
          if (typeof bot.placeBlock === 'function') {
            try {
              const vec3 = (await import('vec3')).default;
              await bot.placeBlock(blockBelow, vec3(0, 1, 0));
              placed++;
            } catch (_) {}
          }

          bot.setControlState('jump', false);
          await new Promise((r) => setTimeout(r, 200));
        }

        return { success: true, data: `Построен столб на ${placed} блоков вверх из ${blockItem.name}.` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });
}


