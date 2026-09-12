import minecraftData from 'minecraft-data';
import { sceneObserver } from '../perception/scene-observer.js';
import { spatialIntelligence } from '../world/spatial-intelligence.js';
import { frameCapture } from '../perception/frame-capture.js';

export function registerWorldTools(registry, { bot, worldState, aiProvider }) {
  registry.register({
    name: 'get_position',
    description: 'Returns the current coordinates of the bot.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      if (!bot.entity) return { success: false, error: 'Bot not spawned' };
      const pos = bot.entity.position;
      return { success: true, data: { x: pos.x, y: pos.y, z: pos.z } };
    }
  });

  registry.register({
    name: 'get_world_state',
    description: 'Returns a summary of the current world state including health, hunger, time, and position.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      return { success: true, data: worldState.getSummary() };
    }
  });

  registry.register({
    name: 'find_block',
    description: 'Finds the coordinates of a specific block type nearby.',
    parameters: {
      type: 'object',
      properties: {
        blockName: { type: 'string' },
        maxDistance: { type: 'number', default: 64 },
        count: { type: 'number', default: 1 }
      },
      required: ['blockName']
    },
    handler: async (args) => {
      try {
        const mcData = minecraftData(bot.version);
        const blockType = mcData.blocksByName[args.blockName];
        if (!blockType) return { success: false, error: `Unknown block: ${args.blockName}` };

        const blocks = bot.findBlocks({
          matching: blockType.id,
          maxDistance: args.maxDistance || 64,
          count: args.count || 1
        });
        
        if (blocks.length === 0) return { success: true, data: 'No blocks found.' };
        return { success: true, data: blocks };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'find_entity',
    description: 'Finds nearby entities matching a name.',
    parameters: {
      type: 'object',
      properties: {
        entityName: { type: 'string' },
        maxDistance: { type: 'number', default: 32 }
      },
      required: ['entityName']
    },
    handler: async (args) => {
      try {
        const maxDist = args.maxDistance || 32;
        const search = String(args.entityName || '').toLowerCase().trim();
        const entities = [];
        for (const id in bot.entities) {
          const e = bot.entities[id];
          if (!e || !e.position || e === bot.entity) continue;
          const match = (e.name && e.name.toLowerCase() === search) ||
                        (e.username && e.username.toLowerCase() === search) ||
                        (e.displayName && e.displayName.toLowerCase() === search);
          if (match && bot.entity?.position && bot.entity.position.distanceTo(e.position) <= maxDist) {
            entities.push({ id: e.id, name: e.username || e.name, type: e.type, position: e.position });
          }
        }
        return { success: true, data: entities };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'get_time',
    description: 'Returns the current Minecraft time of day.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      try {
        return {
          success: true,
          data: {
            timeOfDay: bot.time?.timeOfDay ?? 0,
            isDay: bot.time?.isDay ?? true,
          }
        };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  // Осмотреться вокруг — что видно, рельеф, стороны света, ближайшие объекты.
  registry.register({
    name: 'look_around',
    description: 'Look around and describe what the bot sees: facing direction, biome, terrain (mountains/water/forest) in each compass direction, and nearby entities with their side and distance. Use this to understand the surroundings before deciding where to go.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };
        const scene = sceneObserver.observe(bot);
        if (!scene) return { success: false, error: 'Не удалось осмотреться.' };
        return { success: true, data: sceneObserver.describe(scene), scene };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  // Что находится в конкретной стороне света (север/юг/восток/запад).
  registry.register({
    name: 'describe_direction',
    description: 'Describe what is in a specific compass direction (north/south/east/west/etc). Answers questions like "what is to the north" or "is there a mountain that way".',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', description: 'Compass direction: N, S, E, W, NE, NW, SE, SW (or Russian: север, юг, восток, запад)' }
      },
      required: ['direction']
    },
    handler: async (args) => {
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };
        const scene = sceneObserver.observe(bot);
        if (!scene) return { success: false, error: 'Не удалось осмотреться.' };

        const raw = String(args.direction || '').toLowerCase().trim();
        const alias = {
          n: 'N', 'север': 'N', s: 'S', 'юг': 'S', e: 'E', 'восток': 'E', w: 'W', 'запад': 'W',
          ne: 'NE', 'северо-восток': 'NE', nw: 'NW', 'северо-запад': 'NW',
          se: 'SE', 'юго-восток': 'SE', sw: 'SW', 'юго-запад': 'SW',
        };
        const code = alias[raw] || raw.toUpperCase();
        const dir = scene.horizon.find(h => h.code === code);
        if (!dir) return { success: false, error: `Неизвестное направление: ${args.direction}. Используй N/S/E/W/NE/NW/SE/SW.` };

        return {
          success: true,
          data: `На ${dir.ru}: ${dir.features.join(', ')}${dir.rise >= 5 ? ` (подъём ~${dir.rise} блоков)` : ''}${dir.drop <= -8 ? ` (спуск ~${Math.abs(dir.drop)} блоков)` : ''}.`,
          direction: dir,
        };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  // Направление и расстояние до заданной точки/координат.
  registry.register({
    name: 'bearing_to',
    description: 'Given target coordinates, tells the compass direction, distance, and whether it is ahead/left/right/behind the bot right now. Use to orient toward a known location (e.g. a village a player mentioned).',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' }
      },
      required: ['x', 'z']
    },
    handler: async (args) => {
      try {
        if (!bot.entity?.position) return { success: false, error: 'Бот ещё не заспавнился.' };
        const p = bot.entity.position;
        const botPos = { x: p.x, y: p.y, z: p.z };
        const target = { x: args.x, y: args.y ?? p.y, z: args.z };
        const phrase = spatialIntelligence.describeTarget(botPos, bot.entity.yaw || 0, target, 'точка');
        return { success: true, data: phrase };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  // Внимательно всмотреться: реальный скриншот кадра + разбор мультимодальной моделью.
  // Дорогой инструмент — только когда символьного зрения мало ("вглядись", "что там вдали").
  registry.register({
    name: 'capture_screenshot',
    description: 'Take a real screenshot of what the bot sees and analyse it with vision AI for a detailed answer (distant structures, subtle details). Heavier than look_around — use only when the symbolic scene is not enough. Falls back to a symbolic description if screenshot rendering is unavailable on this machine.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'What to look for (e.g. "есть ли деревня вдали", "что это за постройка")' }
      }
    },
    handler: async (args) => {
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };
        const question = args.question || 'Что видно на кадре: рельеф, постройки, деревни, мобы, что примечательного вдали?';

        const available = await frameCapture.isAvailable();
        if (!available) {
          // Graceful fallback: use symbolic scene instead of crashing.
          const scene = sceneObserver.observe(bot);
          const symbolic = scene ? sceneObserver.describe(scene) : 'вид недоступен';
          return {
            success: true,
            degraded: true,
            data: `Реальный скриншот недоступен на этом сервере (нужен модуль canvas/node-canvas-webgl). Опишу по символьному зрению: ${symbolic}`,
          };
        }

        const png = await frameCapture.capture(bot);
        if (!png) {
          const scene = sceneObserver.observe(bot);
          const symbolic = scene ? sceneObserver.describe(scene) : 'вид недоступен';
          return { success: true, degraded: true, data: `Кадр не удалось отрисовать. По символьному зрению: ${symbolic}` };
        }

        if (!aiProvider || typeof aiProvider.describeImage !== 'function') {
          return { success: true, degraded: true, data: 'Скриншот сделан, но модель зрения не подключена для его разбора.' };
        }

        const description = await aiProvider.describeImage(png, question, { maxTokens: 300 });
        return { success: true, data: description || 'Не смог разобрать кадр.' };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });
}
