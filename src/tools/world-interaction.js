import minecraftData from 'minecraft-data';
import vec3 from 'vec3';
import pathfinderPkg from 'mineflayer-pathfinder';
import { createLogger } from '../utils/logger.js';

const { goals } = pathfinderPkg;
const logger = createLogger('WORLD_INTERACTION');

/**
 * Универсальные примитивы взаимодействия с миром.
 *
 * Философия: Minecraft бесконечен, перечислить все механики нельзя. Поэтому
 * вместо десятков узких инструментов даём боту несколько общих «глаголов»,
 * как у живого игрока (ПКМ по блоку, ПКМ предметом, ПКМ по сущности, взаимодействие
 * без предмета). Плюс пара узких инструментов там, где нужна нетривиальная
 * многошаговая логика (приручение, полёт на элитрах).
 *
 * Эти четыре примитива покрывают: костную муку, огниво, покраску, кувшин,
 * компостер, котёл, рамки, таблички, седло/броню коня, поводок, бирку, кормёжку,
 * рычаги/кнопки/двери/люки/плиты, фейерверк для элитр, эндер-жемчуг и многое другое.
 */
export function registerWorldInteractionTools(registry, { bot }) {
  const mc = () => minecraftData(bot.version || '1.20.4');

  async function walkTo(pos, range = 3) {
    if (bot.pathfinder && bot.entity?.position && bot.entity.position.distanceTo(pos) > range) {
      bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, Math.max(1, range - 1)));
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 300));
        if (bot.entity.position.distanceTo(pos) <= range) break;
      }
      try { bot.pathfinder.setGoal(null); } catch (_) {}
    }
  }

  function findItem(name) {
    return (bot.inventory?.items() || []).find((i) => i.name === name || i.name.includes(name));
  }

  // ── Примитив 1: использовать предмет ПО БЛОКУ ──────────────────────────────
  // Держит предмет в руке и делает ПКМ по блоку: костная мука на посевы,
  // огниво по TNT/порталу/костру, кувшин, покраска в котле, мотыга по земле,
  // ложка на компостер, шампур на костёр и т.д.
  registry.register({
    name: 'use_item_on_block',
    description: 'Hold an item and right-click it on a block (a universal action). Examples: bone_meal on crops/saplings to grow them, flint_and_steel on a block/portal/tnt to ignite, a hoe to till dirt, an axe to strip a log, a shovel to make a path, water/lava bucket, put food into a composter, dye/water in a cauldron, shears on a beehive, a music disc, honey bottle, etc. If itemName omitted, uses whatever is in hand.',
    parameters: {
      type: 'object',
      properties: {
        itemName: { type: 'string', description: 'Item to hold before clicking (e.g. bone_meal, flint_and_steel, diamond_hoe). Omit to use current hand item.' },
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' },
      },
      required: ['x', 'y', 'z'],
    },
    handler: async (args) => {
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };
        const v = vec3(args.x, args.y, args.z);
        const block = bot.blockAt(v);
        if (!block) return { success: false, error: 'На этих координатах нет блока.' };

        if (args.itemName) {
          const item = findItem(args.itemName);
          if (!item) return { success: false, error: `Нет предмета ${args.itemName} в инвентаре.` };
          await bot.equip(item, 'hand');
        }

        await walkTo(block.position, 4);
        await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true);
        await bot.activateBlock(block);

        return { success: true, data: `Использовал ${args.itemName || 'предмет в руке'} по блоку ${block.name} на [${args.x}, ${args.y}, ${args.z}].` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  });

  // ── Примитив 2: использовать предмет В РУКУ / в воздух ─────────────────────
  // ПКМ предметом без цели: фейерверк (буст элитр), эндер-жемчуг, splash-зелье,
  // рог, съесть еду, надуть щит (защита), выпить зелье и т.д.
  registry.register({
    name: 'use_item',
    description: 'Right-click with the held item into the air / on self (a universal action). Examples: throw an ender_pearl, launch a firework_rocket (elytra boost), drink/throw a potion, use a goat_horn, raise a shield, use a spyglass, eat. Equips itemName first if given.',
    parameters: {
      type: 'object',
      properties: {
        itemName: { type: 'string', description: 'Item to use (e.g. ender_pearl, firework_rocket, splash_potion). Omit to use current hand item.' },
        hand: { type: 'string', enum: ['hand', 'off-hand'], default: 'hand' },
        holdMs: { type: 'number', description: 'Hold the right-click this long in ms (for charging bows/tridents or keeping a shield up). Default: instant.' },
        lookYaw: { type: 'number', description: 'Optional yaw (radians) to face before using (e.g. aim a pearl/firework).' },
        lookPitch: { type: 'number', description: 'Optional pitch (radians); negative looks up.' },
      },
    },
    handler: async (args) => {
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };
        const hand = args.hand === 'off-hand' ? 'off-hand' : 'hand';

        if (args.itemName) {
          const item = findItem(args.itemName);
          if (!item) return { success: false, error: `Нет предмета ${args.itemName} в инвентаре.` };
          await bot.equip(item, hand);
        }

        if (typeof args.lookYaw === 'number' || typeof args.lookPitch === 'number') {
          await bot.look(args.lookYaw ?? bot.entity.yaw, args.lookPitch ?? bot.entity.pitch, true);
        }

        bot.activateItem(hand === 'off-hand');
        if (args.holdMs && args.holdMs > 0) {
          await new Promise((r) => setTimeout(r, Math.min(5000, args.holdMs)));
        }
        bot.deactivateItem();

        return { success: true, data: `Использовал ${args.itemName || 'предмет в руке'}${hand === 'off-hand' ? ' (левая рука)' : ''}.` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  });

  // ── Примитив 3: использовать предмет ПО СУЩНОСТИ ───────────────────────────
  // ПКМ предметом по мобу/животному: седло/конская броня/сундук, поводок,
  // бирка, ножницы, ведро на корову/аксолотля, кормёжка/приручение, покраска
  // овцы. Один клик, без цикла приручения (для повторяющегося приручения —
  // отдельный tame_animal).
  registry.register({
    name: 'use_item_on_entity',
    description: 'Right-click an item on a nearby entity (a universal action). Examples: saddle/horse_armor/chest on a horse or donkey, a lead to leash, a name_tag to name, shears on a sheep, an empty bucket on a cow/axolotl to fill it, feed an animal (wheat/seeds/bone), a dye on a sheep, a water_bucket on an axolotl. Walks to the entity if needed.',
    parameters: {
      type: 'object',
      properties: {
        entityName: { type: 'string', description: 'Target entity type or player name (e.g. horse, sheep, cow, villager).' },
        itemName: { type: 'string', description: 'Item to use on it (e.g. saddle, lead, name_tag, shears, wheat). Omit to interact bare-handed.' },
      },
      required: ['entityName'],
    },
    handler: async (args) => {
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };
        const want = String(args.entityName).toLowerCase();

        let target = null;
        let best = Infinity;
        for (const id in bot.entities) {
          const e = bot.entities[id];
          if (!e || !e.position || e === bot.entity) continue;
          const n = (e.name || '').toLowerCase();
          const u = (e.username || '').toLowerCase();
          if (n === want || n.includes(want) || u === want) {
            const d = bot.entity.position.distanceTo(e.position);
            if (d < best) { best = d; target = e; }
          }
        }
        if (!target) return { success: false, error: `Рядом нет ${args.entityName}.` };

        if (args.itemName) {
          const item = findItem(args.itemName);
          if (!item) return { success: false, error: `Нет предмета ${args.itemName} в инвентаре.` };
          await bot.equip(item, 'hand');
        }

        await walkTo(target.position, 3);
        await bot.lookAt(target.position.offset(0, (target.height || 1) * 0.6, 0), true);
        await bot.activateEntity(target);

        return { success: true, data: `Использовал ${args.itemName || 'руку'} по ${target.name || args.entityName}.` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  });

  // ── Примитив 4: взаимодействие с блоком БЕЗ предмета ───────────────────────
  // ПКМ по блоку пустой рукой: рычаг, кнопка, дверь, люк, калитка, нажимная
  // плита, нотный блок, кровать, сундук-раздатчик, звонок и т.д.
  registry.register({
    name: 'interact_block',
    description: 'Right-click a block with an empty hand to operate it (a universal action). Examples: flip a lever, press a button, open/close a door/trapdoor/fence_gate, ring a bell, play a note_block, open a barrel, use a lectern. Walks to the block if needed.',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' },
      },
      required: ['x', 'y', 'z'],
    },
    handler: async (args) => {
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };
        const v = vec3(args.x, args.y, args.z);
        const block = bot.blockAt(v);
        if (!block || block.name === 'air') return { success: false, error: 'На этих координатах нет блока.' };

        await walkTo(block.position, 4);
        await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true);
        await bot.activateBlock(block);

        return { success: true, data: `Взаимодействовал с ${block.name} на [${args.x}, ${args.y}, ${args.z}].` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  });

  // ── Узкий инструмент: приручение (многошаговый цикл) ───────────────────────
  registry.register({
    name: 'tame_animal',
    description: 'Tame a nearby animal by repeatedly feeding/interacting until it is tamed. Wolves need bones, cats/ocelots raw fish (cod/salmon), parrots seeds; horses/donkeys/llamas are tamed by repeated mounting. Picks a sensible item from inventory if itemName omitted.',
    parameters: {
      type: 'object',
      properties: {
        entityName: { type: 'string', description: 'Animal to tame (e.g. wolf, cat, horse, donkey, parrot).' },
        itemName: { type: 'string', description: 'Item to tame with (e.g. bone, cod, wheat_seeds). Optional.' },
      },
      required: ['entityName'],
    },
    handler: async (args) => {
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };
        const want = String(args.entityName).toLowerCase();

        const defaultTameItem = {
          wolf: 'bone', cat: 'cod', ocelot: 'cod', parrot: 'wheat_seeds',
        };
        // Лошадиные приручаются повторной посадкой, без предмета.
        const rideTamed = ['horse', 'donkey', 'mule', 'llama', 'camel', 'skeleton_horse', 'trader_llama'];

        let target = null;
        let best = Infinity;
        for (const id in bot.entities) {
          const e = bot.entities[id];
          if (!e || !e.position || e === bot.entity) continue;
          const n = (e.name || '').toLowerCase();
          if (n === want || n.includes(want)) {
            const d = bot.entity.position.distanceTo(e.position);
            if (d < best) { best = d; target = e; }
          }
        }
        if (!target) return { success: false, error: `Рядом нет ${args.entityName}.` };

        const isRideTamed = rideTamed.some((r) => (target.name || '').toLowerCase().includes(r));

        if (isRideTamed) {
          // Цикл: сесть — если сбросило, попробовать снова, до 6 раз.
          for (let attempt = 0; attempt < 6; attempt++) {
            await walkTo(target.position, 3);
            try { await bot.mount(target); } catch (_) {}
            await new Promise((r) => setTimeout(r, 1200));
            if (bot.vehicle) {
              // Успех: приручилось (или уже было). Слезаем, чтобы вернуть управление.
              try { await bot.dismount(); } catch (_) {}
              return { success: true, data: `Приручил ${target.name} (повторной посадкой).` };
            }
          }
          return { success: false, error: `Не удалось приручить ${target.name} за несколько попыток — попробуй ещё раз.` };
        }

        // Кормёжка предметом (волк/кот/попугай).
        const tameItemName = args.itemName || defaultTameItem[want] || defaultTameItem[(target.name || '').toLowerCase()];
        if (!tameItemName) return { success: false, error: `Не знаю чем приручать ${args.entityName}. Укажи itemName.` };
        const item = findItem(tameItemName);
        if (!item) return { success: false, error: `Нет ${tameItemName} для приручения.` };

        await bot.equip(item, 'hand');
        let fed = 0;
        for (let attempt = 0; attempt < 10; attempt++) {
          if (!target.isValid) break;
          await walkTo(target.position, 3);
          await bot.lookAt(target.position.offset(0, (target.height || 1) * 0.6, 0), true);
          try { await bot.activateEntity(target); fed++; } catch (_) {}
          await new Promise((r) => setTimeout(r, 500));
          // Признак приручения: у волка/кота появляется владелец в metadata (17).
          const owner = target.metadata?.[17];
          if (owner) break;
          if (!findItem(tameItemName)) break; // предметы кончились
        }

        return { success: true, data: `Покормил ${target.name} ${fed} раз (${tameItemName}). Если не приручился — покорми ещё.` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  });

  // ── Узкий инструмент: полёт на элитрах (многошаговый) ──────────────────────
  registry.register({
    name: 'elytra_fly',
    description: 'Take off and glide with equipped elytra, optionally boosting with fireworks toward a target position. Needs an elytra worn on the chest; fireworks make it fly far. Use from a high place or after jumping.',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'Optional target X to aim toward.' },
        y: { type: 'number', description: 'Optional target Y.' },
        z: { type: 'number', description: 'Optional target Z.' },
        boosts: { type: 'number', description: 'How many firework rockets to use (default 1).' },
      },
    },
    handler: async (args) => {
      try {
        if (!bot.entity) return { success: false, error: 'Бот ещё не заспавнился.' };
        const chest = bot.inventory?.slots?.[6];
        if (!chest || chest.name !== 'elytra') {
          return { success: false, error: 'Элитры не надеты (нужны в слоте нагрудника). Сначала equip_item(elytra, torso).' };
        }

        // Прицеливание к цели, если задана.
        if (typeof args.x === 'number' && typeof args.z === 'number') {
          const target = vec3(args.x, args.y ?? bot.entity.position.y, args.z);
          await bot.lookAt(target, true);
        } else {
          // По умолчанию смотрим слегка вверх для старта.
          await bot.look(bot.entity.yaw, -0.35, true);
        }

        // Старт: прыжок + активация элитр (двойной jump на лету).
        bot.setControlState('jump', true);
        await new Promise((r) => setTimeout(r, 120));
        bot.setControlState('jump', false);
        if (typeof bot.elytraFly === 'function') {
          try { await bot.elytraFly(); } catch (_) {}
        } else {
          // Фолбэк: повторный jump активирует планирование в воздухе.
          bot.setControlState('jump', true);
          await new Promise((r) => setTimeout(r, 60));
          bot.setControlState('jump', false);
        }

        // Буст фейерверками.
        const boosts = Math.min(8, Math.max(0, args.boosts ?? 1));
        let used = 0;
        for (let i = 0; i < boosts; i++) {
          const fw = findItem('firework_rocket');
          if (!fw) break;
          await bot.equip(fw, 'hand');
          if (typeof args.x === 'number' && typeof args.z === 'number') {
            try { await bot.lookAt(vec3(args.x, args.y ?? bot.entity.position.y, args.z), true); } catch (_) {}
          }
          bot.activateItem();
          bot.deactivateItem();
          used++;
          await new Promise((r) => setTimeout(r, 1200));
        }

        return { success: true, data: `Взлетел на элитрах${used ? `, буст фейерверком ×${used}` : ''}.` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  });
}
