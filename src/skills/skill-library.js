import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('SKILL_LIBRARY');

/**
 * SkillLibrary — реестр динамических навыков (сохраненных JS-скриптов).
 * Хранит навыки на диске в директории `skills/`, компилирует их и передает в ActionSandbox.
 */
export class SkillLibrary {
  constructor(skillsDir = null) {
    this.skillsDir = skillsDir || path.resolve(process.cwd(), 'skills');
    this.skills = new Map(); // name -> { name, description, code, fn }
    this._ensureDir();
    this._loadSeedSkills();
    this.loadAll();
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(this.skillsDir)) {
        fs.mkdirSync(this.skillsDir, { recursive: true });
      }
    } catch (err) {
      logger.warn(`Не удалось создать директорию skills: ${err.message}`);
    }
  }

  /**
   * Начальные проверенные навыки (семена)
   */
  _loadSeedSkills() {
    const seedSkills = [
      {
        name: 'deposit_clutter',
        description: 'Сложить лишний лут в сундук/бочку (параметры: { keepItems?: string[], chestPos?: {x,y,z} })',
        code: `
const chestPos = params?.chestPos;
const chest = chestPos ? world.getBlock(chestPos) : (world.findNearestStation('chest', 16) || world.findNearestStation('barrel', 16));
if (!chest) throw new Error('Сундук рядом не найден');
await bot.goto(chest.position, 2);
const container = await bot.openContainer(chest);
const items = bot.inventory.items();
const customKeep = Array.isArray(params?.keepItems) ? params.keepItems : [];
let deposited = 0;
for (const item of items) {
  const keep = customKeep.includes(item.name) ||
               /_(sword|pickaxe|axe|shovel|hoe|helmet|chestplate|leggings|boots|shield)$/.test(item.name) ||
               ['bread', 'cooked_beef', 'cooked_porkchop', 'apple', 'torch'].includes(item.name);
  if (!keep) {
    try {
      await container.deposit(item.type, null, item.count);
      deposited++;
    } catch (_) {}
  }
}
container.close();
return \`Сложил \${deposited} типов предметов в сундук\`;
        `.trim(),
      },
      {
        name: 'quick_eat',
        description: 'Быстро найти еду в инвентаре и перекусить (параметры: { preferredFood?: string })',
        code: `
const pref = params?.preferredFood;
const food = (pref ? inventory.find(pref) : null) ||
             inventory.find('bread') || inventory.find('cooked') || inventory.find('apple') || inventory.find('carrot');
if (!food) throw new Error('Нет подходящей еды в инвентаре');
await inventory.equip(food.name, 'hand');
bot.activateItem();
await sleep(1800);
bot.deactivateItem();
return \`Перекусил: \${food.name}\`;
        `.trim(),
      },
      {
        name: 'smelt_items',
        description: 'Переплавить руду или приготовить сырую еду в ближайшей печи (параметры: { item?: string, fuel?: string, count?: number })',
        code: `
const furnaceBlock = world.findNearestStation('furnace', 16) || world.findNearestStation('blast_furnace', 16) || world.findNearestStation('smoker', 16);
if (!furnaceBlock) throw new Error('Печь поблизости не найдена');

const wantInput = params?.item;
const inputItem = (wantInput ? inventory.find(wantInput) : null) ||
                  inventory.find('raw_iron') || inventory.find('raw_gold') || inventory.find('raw_copper') ||
                  inventory.find('cobblestone') || inventory.find('sand') ||
                  inventory.find('beef') || inventory.find('porkchop') || inventory.find('mutton') || inventory.find('chicken') || inventory.find('potato');
if (!inputItem) throw new Error('В инвентаре нет ничего для переплавки или готовки');

const wantFuel = params?.fuel;
const fuelItem = (wantFuel ? inventory.find(wantFuel) : null) ||
                 inventory.find('coal') || inventory.find('charcoal') || inventory.find('blaze_rod') || inventory.find('oak_log') || inventory.find('planks');
if (!fuelItem) throw new Error('Нет топлива (уголь, палки, дерево) в инвентаре');

const count = typeof params?.count === 'number' ? params.count : 16;
await bot.goto(furnaceBlock.position, 2);
const furnace = await bot.openFurnace(furnaceBlock);
await furnace.putFuel(fuelItem.type, null, Math.min(fuelItem.count, 8));
await furnace.putInput(inputItem.type, null, Math.min(inputItem.count, count));
furnace.close();
return \`Поставил плавиться \${inputItem.name} в печь\`;
        `.trim(),
      },
      {
        name: 'enchant_gear',
        description: 'Зачаровать предмет на столе зачарований (параметры: { targetItem?: string, minLevel?: number })',
        code: `
const tableBlock = world.findNearestStation('enchanting_table', 16);
if (!tableBlock) throw new Error('Стол зачарований поблизости не найден');

const lapis = inventory.find('lapis_lazuli');
if (!lapis) throw new Error('Нужен лазурит (lapis_lazuli) для зачарования');

const wantItem = params?.targetItem;
const item = (wantItem ? inventory.find(wantItem) : null) ||
             inventory.find('diamond_sword') || inventory.find('diamond_pickaxe') ||
             inventory.find('iron_sword') || inventory.find('iron_pickaxe') || inventory.find('book');
if (!item) throw new Error('Нет подходящего предмета для зачарования');

await bot.goto(tableBlock.position, 2);
const table = await bot.openEnchantmentTable(tableBlock);
await table.putTargetItem(item);
await table.putLapis(lapis);

const deadline = Date.now() + 3000;
while (Date.now() < deadline && (!table.enchantments || table.enchantments.every(e => !e || e.level <= 0))) {
  await sleep(200);
}

const xp = bot.experience?.level ?? 0;
const minLevel = params?.minLevel ?? 1;
const options = (table.enchantments || [])
  .map((e, i) => ({ i, level: e?.level ?? 0 }))
  .filter(o => o.level >= minLevel && o.level <= xp);

if (options.length === 0) {
  table.close();
  throw new Error(\`Не хватает опыта для зачарования (текущий уровень: \${xp})\`);
}

const best = options[options.length - 1];
await table.enchant(best.i);
if (table.targetItem()) await table.takeTargetItem();
table.close();
return \`Зачаровал \${item.name} на столе зачарований (уровень \${best.level})\`;
        `.trim(),
      },
      {
        name: 'gravel_torch_trick',
        description: 'Сломать блок гравия/песка с мгновенной установкой факела под основание (параметры: { blockPos: {x,y,z} })',
        code: `
const pos = params?.blockPos;
const block = pos ? world.getBlock(pos) : world.findBlock('gravel') || world.findBlock('sand');
if (!block) throw new Error('Блок гравия или песка не найден');
await bot.goto(block.position, 2.5);
const success = await world.gravelTorchBreak(block);
return success ? 'Трюк с факелом выполнен: гравий осыпался в лут' : 'Обычное выкапывание блока завершено';
        `.trim(),
      },
      {
        name: 'vein_mine',
        description: 'Раскопать всю рудную жилу целиком через 3D поиск соседей (параметры: { oreName?: string })',
        code: `
const want = params?.oreName || 'iron_ore';
const block = world.findBlock(want) || world.findBlock('deepslate_' + want) || world.findBlock('coal_ore') || world.findBlock('copper_ore');
if (!block) throw new Error(\`Рудный блок \${want} рядом не найден\`);
await bot.goto(block.position, 2.5);
const mined = await world.excavateOreVein(block, { maxBlocks: 24 });
return \`Раскопал рудную жилу: добыто \${mined} блоков\`;
        `.trim(),
      },
      {
        name: 'water_climb_down',
        description: 'Безопасно спуститься с обрыва или расщелины по водопаду ведром воды',
        code: `
const success = await bot.waterDropClimb();
if (!success) throw new Error('Не удалось запустить водопад для спуска');
return 'Успешный спуск с обрыва по потоку воды';
        `.trim(),
      },
      {
        name: 'buddy_share_food',
        description: 'Поделиться едой с напарником, если он ранен или голоден (параметры: { playerName?: string })',
        code: `
const targetPlayer = params?.playerName;
const helped = await buddy.emergencyHeal(targetPlayer);
return helped ? 'Скинул еду напарнику под ноги' : 'Напарник не нуждается в еде или нет еды в инвентаре';
        `.trim(),
      },
      {
        name: 'right_wall_torch',
        description: 'Поставить факел на правую стену тоннеля по ходу движения для ориентирования в шахте',
        code: `
const placed = await world.placeRightWallTorch();
if (!placed) throw new Error('Не удалось найти правую стену для установки факела');
return 'Факел установлен на правую стену тоннеля';
        `.trim(),
      },
    ];

    for (const s of seedSkills) {
      const filePath = path.join(this.skillsDir, `${s.name}.json`);
      if (!fs.existsSync(filePath)) {
        try {
          fs.writeFileSync(filePath, JSON.stringify(s, null, 2), 'utf-8');
        } catch (_) {}
      }
    }
  }

  /**
   * Загрузить все навыки из директории
   */
  loadAll() {
    try {
      if (!fs.existsSync(this.skillsDir)) return;
      const files = fs.readdirSync(this.skillsDir).filter(f => f.endsWith('.json'));

      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(this.skillsDir, file), 'utf-8');
          const data = JSON.parse(raw);
          if (data && data.name && data.code) {
            this._registerSkill(data);
          }
        } catch (err) {
          logger.warn(`Ошибка загрузки навыка ${file}: ${err.message}`);
        }
      }
      logger.info(`Загружено ${this.skills.size} навыков в SkillLibrary`);
    } catch (err) {
      logger.error(`Ошибка чтения директории skills: ${err.message}`);
    }
  }

  _registerSkill(data) {
    try {
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const fn = new AsyncFunction(
        'bot', 'world', 'inventory', 'crafting', 'pathfinder', 'stations', 'skills',
        'mcData', 'vec3', 'sleep', 'log', 'console', 'params',
        data.code
      );
      this.skills.set(data.name, {
        name: data.name,
        description: data.description || '',
        code: data.code,
        fn,
      });
    } catch (compileErr) {
      logger.warn(`Ошибка компиляции навыка ${data.name}: ${compileErr.message}`);
    }
  }

  /**
   * Сохранить новый навык
   */
  saveSkill(name, code, description = '') {
    if (!name || typeof name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error(`Некорректное имя навыка: ${name}`);
    }
    if (!code || typeof code !== 'string') {
      throw new Error('Код навыка не может быть пустым');
    }

    const data = {
      name,
      description,
      code,
      updatedAt: Date.now(),
    };

    // Проверяем компиляцию
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    new AsyncFunction(
      'bot', 'world', 'inventory', 'crafting', 'pathfinder', 'stations', 'skills',
      'mcData', 'vec3', 'sleep', 'log', 'console', 'params',
      code
    );

    const filePath = path.join(this.skillsDir, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    this._registerSkill(data);
    logger.info(`[SKILL SAVED] Навык "${name}" успешно сохранён`);
    return true;
  }

  getSkill(name) {
    return this.skills.get(name) || null;
  }

  listSkills() {
    return Array.from(this.skills.values()).map(s => ({
      name: s.name,
      description: s.description,
    }));
  }

  /**
   * Возвращает объект с функциями для передачи в песочницу: `skills.<name>()`
   */
  getSkills(context) {
    const out = {};
    for (const [name, s] of this.skills.entries()) {
      out[name] = (params = {}) => {
        return s.fn(
          context.bot,
          context.world,
          context.inventory,
          context.crafting,
          context.pathfinder,
          context.stations,
          context.skills || out,
          context.mcData,
          context.vec3,
          context.sleep,
          context.log,
          context.console,
          params
        );
      };
    }
    return out;
  }
}
