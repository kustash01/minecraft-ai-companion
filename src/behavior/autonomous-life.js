import { createLogger } from '../utils/logger.js';
import { KinematicsEngine } from './kinematics.js';
import { HumanMotor } from './human-motor.js';
import { CampLifeEngine } from './camp-life.js';
import { HumanErrorEngine } from './human-error-engine.js';
import minecraftData from 'minecraft-data';

const logger = createLogger('AUTONOMOUS_LIFE');
const activityClaims = new Map();

export class AutonomousLifeEngine {
  constructor(agentInstance) {
    this.agent = agentInstance;
    this.lastRoutineTick = 0;
    this.routineIntervalMs = 2500; // Tick every 2.5s
    this.isBusy = false;
    this.basePosition = null; // Established spawn or camp base position
    this.currentSubtask = 'idle_observation';
    this.lastHotbarSort = 0;
    this.lastActivityAt = 0;
    this.lastActivity = null;
    this.activityCooldownMs = 15000;
  }

  /**
   * Main lifecycle loop called on idle state
   */
  async tick() {
    if (this.isBusy) return;
    const now = Date.now();
    if (now - this.lastRoutineTick < this.routineIntervalMs) return;
    this.lastRoutineTick = now;

    const bot = this.agent.mcBot?.bot;
    if (!bot || !bot.entity || !bot.entity.position) return;

    // Set base position if not set
    if (!this.basePosition) {
      this.basePosition = typeof bot.entity.position.clone === 'function' 
        ? bot.entity.position.clone() 
        : { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z };
    }

    this.isBusy = true;
    try {
      await this._executeLifeRoutine(bot);
    } catch (err) {
      logger.warn(`[${this.agent.name}] Ошибка в autonomous life: ${err.message}`);
    } finally {
      this.isBusy = false;
    }
  }

  async _executeLifeRoutine(bot) {
    const agentName = this.agent.name;
    const now = Date.now();

    // 0. ПЕРИОДИЧЕСКАЯ ОРГАНИЗАЦИЯ ХОТБАРА (Как у живого игрока)
    if (now - this.lastHotbarSort > 45000) {
      this.lastHotbarSort = now;
      await HumanMotor.organizeHotbar(bot);
    }

    // 1. SURVIVAL CHECK: Food & Auto-Eating (Бесшумно, без спама в чат!)
    if (bot.food < 17 || bot.health < 17) {
      const foodItem = bot.inventory.items().find(i => 
        ['bread', 'cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'cooked_chicken', 'apple', 'baked_potato', 'carrot'].includes(i.name)
      );
      if (foodItem) {
        if (bot.autoEat && typeof bot.autoEat.eat === 'function') {
          await bot.autoEat.eat().catch(() => {});
        } else {
          try {
            await bot.equip(foodItem, 'hand');
            bot.activateItem();
            await new Promise(r => setTimeout(r, 1600));
            bot.deactivateItem();
          } catch (e) {}
        }
        return;
      }
    }

    // 2. БЫТ В ЛАГЕРЕ: Сон ночью, факелы в темноте и сбор спелого урожая
    const slept = await CampLifeEngine.sleepAtNight(bot);
    if (slept) return;

    await CampLifeEngine.placeTorchIfNeeded(bot);
    await CampLifeEngine.harvestAndReplant(bot);

    // 3. PROGRESSION TREE: Check Inventory & Resources
    const items = bot.inventory.items();
    const countItem = (name) => items.filter(i => i.name.includes(name)).reduce((acc, i) => acc + i.count, 0);

    const logs = countItem('_log');
    const planks = countItem('_planks');
    const sticks = countItem('stick');
    const cobblestone = countItem('cobblestone');
    const coal = countItem('coal');
    const ironRaw = countItem('raw_iron') + countItem('iron_ore');
    const pickaxes = items.filter(i => i.name.includes('pickaxe'));
    const axes = items.filter(i => i.name.includes('axe'));
    const swords = items.filter(i => i.name.includes('sword'));
    const torches = countItem('torch');

    const mcData = minecraftData(bot.version);

    // STEP A: GATHER WOOD IF NO WOOD & NO PLANKS
    if (logs < 4 && planks < 8 && !this.agent.movementController.isMoving()) {
      const logBlocks = bot.findBlocks({
        matching: (block) => block.name.endsWith('_log'),
        maxDistance: 24,
        count: 1,
      });

      if (logBlocks.length > 0) {
        const targetPos = logBlocks[0];
        this.currentSubtask = 'woodcutting';
        logger.info(`[${agentName}] 🪓 Автономно добывает дерево на ${targetPos}`);
        
        await KinematicsEngine.equipBestTool(bot, 'wood');
        const targetBlock = bot.blockAt(targetPos);
        if (targetBlock) {
          try {
            if (bot.collectBlock && typeof bot.collectBlock.collect === 'function') {
              await bot.collectBlock.collect(targetBlock);
            } else {
              await bot.lookAt(targetPos.offset(0.5, 0.5, 0.5));
              await bot.dig(targetBlock);
              KinematicsEngine.swingArm(bot);
            }
            return;
          } catch (e) {}
        }
      }
    }

    // STEP B: CRAFT PLANKS & CRAFTING TABLE
    if (logs >= 1 && planks < 4) {
      const logItem = items.find(i => i.name.endsWith('_log'));
      if (logItem) {
        const plankName = logItem.name.replace('_log', '_planks');
        const plankType = mcData.itemsByName[plankName] || mcData.itemsByName['oak_planks'];
        if (plankType) {
          const recipe = bot.recipesFor(plankType.id, null, 1, null)[0];
          if (recipe) {
            await bot.craft(recipe, 1, null);
            logger.info(`[${agentName}] 🔨 Автономно скрафтил доски (${plankName})`);
            return;
          }
        }
      }
    }

    // STEP C: CRAFT STICKS & WOODEN/STONE PICKAXE
    if (planks >= 2 && sticks < 4) {
      const stickType = mcData.itemsByName['stick'];
      if (stickType) {
        const recipe = bot.recipesFor(stickType.id, null, 1, null)[0];
        if (recipe) {
          await bot.craft(recipe, 1, null);
          logger.info(`[${agentName}] 🪵 Автономно скрафтил палки`);
          return;
        }
      }
    }

    // STEP D: CRAFT WOODEN OR STONE PICKAXE IF WE HAVE NO TOOLS
    if (pickaxes.length === 0 && (planks >= 3 || cobblestone >= 3) && sticks >= 2) {
      const pickName = cobblestone >= 3 ? 'stone_pickaxe' : 'wooden_pickaxe';
      const pickType = mcData.itemsByName[pickName];
      if (pickType) {
        // Find or check crafting table
        const craftingTableBlock = bot.findBlock({
          matching: mcData.blocksByName.crafting_table ? mcData.blocksByName.crafting_table.id : 58,
          maxDistance: 5,
        });

        const recipes = bot.recipesFor(pickType.id, null, 1, craftingTableBlock);
        if (recipes.length > 0) {
          await bot.craft(recipes[0], 1, craftingTableBlock);
          logger.info(`[${agentName}] ⛏️ Автономно скрафтил ${pickName}!`);
            return;
        }
      }
    }

    // 4. ROLE SPECIFIC AUTONOMOUS BEHAVIOR
    await this._runRoleBehavior(bot, countItem);
  }

  async _runRoleBehavior(bot, countItem) {
    if (Date.now() - this.lastActivityAt < this.activityCooldownMs) return;

    // Choose a nearby useful place rather than repeating a role-specific gesture.
    // This gives idle time a purpose while keeping chat silent.
    const interests = bot.findBlocks({
      matching: (block) => ['chest', 'furnace', 'crafting_table', 'farmland'].includes(block.name),
      maxDistance: 28,
      count: 24,
    });
    let nearby = interests.filter((position) => this._isAvailableActivity(position, bot));

    // There may be no base infrastructure after spawning. In that case, pick a
    // walkable patch of terrain to inspect instead of freezing in place.
    if (nearby.length === 0) {
      const ground = bot.findBlocks({
        matching: (block) => ['grass_block', 'dirt', 'stone', 'sand', 'gravel'].includes(block.name),
        maxDistance: 18,
        count: 32,
      });
      nearby = ground
        .filter((position) => this._isAvailableActivity(position, bot))
        .map((position) => position.offset(0, 1, 0));
    }

    if (nearby.length === 0) return;
    const scored = nearby.map((position) => ({
      position,
      score: HumanErrorEngine.range(0, 1) + bot.entity.position.distanceTo(position) / 56,
    })).sort((a, b) => b.score - a.score);
    const target = scored[0].position;
    this.lastActivityAt = Date.now();
    this.lastActivity = target;
    this._claimActivity(target);
    this.currentSubtask = `visit_${bot.blockAt(target)?.name || 'nearby_place'}`;
    await this.agent.movementController.moveTo(target.x, target.y, target.z);
  }

  _isAvailableActivity(position, bot) {
    if (bot.entity.position.distanceTo(position) <= 3) return false;
    if (this.lastActivity && Math.hypot(position.x - this.lastActivity.x, position.z - this.lastActivity.z) <= 4) return false;

    const key = `${Math.floor(position.x)}:${Math.floor(position.y)}:${Math.floor(position.z)}`;
    const claim = activityClaims.get(key);
    return !claim || claim.agentName === this.agent.name || claim.expiresAt <= Date.now();
  }

  _claimActivity(position) {
    const key = `${Math.floor(position.x)}:${Math.floor(position.y)}:${Math.floor(position.z)}`;
    activityClaims.set(key, {
      agentName: this.agent.name,
      expiresAt: Date.now() + this.activityCooldownMs * 2,
    });
  }
}
