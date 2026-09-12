import { createLogger } from '../utils/logger.js';
import { combatAI } from '../combat/combat-ai.js';
import { CaveNavigation } from '../behavior/cave-navigation.js';
import { structureDetector } from '../perception/structure-detector.js';
import { POITypes } from '../memory/poi-manager.js';

const logger = createLogger('INITIATIVE');

export class InitiativeController {
  constructor({ bot, worldState, memoryManager, aiBrain, config, movementController = null, autonomousGoals = null }) {
    this.bot = bot;
    this.worldState = worldState;
    this.memoryManager = memoryManager;
    this.aiBrain = aiBrain;
    this.config = config;
    this.movementController = movementController;
    this.autonomousGoals = autonomousGoals;
    this.level = config?.bot?.initiative || 'balanced';
    this.lastCheck = Date.now();
    this.checkInterval = 4000;
    this.timer = null;
    this.lastGearCheck = 0;
    this.lastIdleActivity = 0;
    this.idleActivityCooldownMs = 20000; // не суетиться: не чаще раза в 20с
    this.caveNav = new CaveNavigation({
      bot: this.bot,
      agentName: config?.minecraft?.username || 'Bot',
    });
  }

  start() {
    if (this.level === 'passive') {
      logger.info('Режим инициативы: PASSIVE (бот действует только по командам)');
      return;
    }

    logger.info(`Режим инициативы: ${this.level.toUpperCase()} (Бесшумное авто-лечение, тактический бой, факелы и следование)`);
    this.stop();
    this.timer = setInterval(() => this.evaluateSituation(), this.checkInterval);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.bot && combatAI.inCombat) {
      combatAI.stopCombat(this.bot);
    }
  }

  async evaluateSituation() {
    if (!this.bot || !this.bot.entity) return;

    try {
      const now = Date.now();
      this.caveNav.bot = this.bot;

      // 1. БЕСШУМНОЕ АВТО-ЛЕЧЕНИЕ И ПИТАНИЕ (Никакого спама в чат!)
      if (this.bot.food < 18 || this.bot.health < 18) {
        if (this.bot.autoEat && typeof this.bot.autoEat.eat === 'function') {
          this.bot.autoEat.eat().catch(() => {});
        } else {
          const food = this.bot.inventory?.items()?.find((i) =>
            i.name.includes('bread') ||
            i.name.includes('cooked') ||
            i.name.includes('apple') ||
            i.name.includes('beef') ||
            i.name.includes('porkchop') ||
            i.name.includes('carrot') ||
            i.name.includes('potato')
          );
          if (food && typeof this.bot.equip === 'function' && typeof this.bot.consume === 'function') {
            try {
              await this.bot.equip(food, 'hand');
              await this.bot.consume();
            } catch (e) {}
          }
        }
      }

      // 2. АВТО-ПОДДЕРЖАНИЕ СНАРЯЖЕНИЯ (Щит во второй руке, лучшая броня)
      if (now - this.lastGearCheck > 12000) {
        this.lastGearCheck = now;
        try {
          await combatAI.equipBestGear(this.bot);
        } catch (_) {}
      }

      // 3. АВТОНОМНЫЙ ТАКТИЧЕСКИЙ БОЙ С ВРАЖДЕБНЫМИ МОБАМИ
      const hostile = combatAI.findHostileTarget(this.bot, 12);
      if (hostile) {
        logger.info(`[${this.bot.username || 'Bot'}] Обнаружен враг [${hostile.name || hostile.type}], вступаю в бой!`);
        await combatAI.equipBestGear(this.bot);
        if (this.bot.pvp && typeof this.bot.pvp.attack === 'function') {
          this.bot.pvp.attack(hostile);
        } else {
          await combatAI.executeCombatTick(this.bot, hostile);
        }
        return;
      } else if (combatAI.inCombat) {
        // Когда враги побеждены или ушли, сбрасываем бой и кнопки
        combatAI.stopCombat(this.bot);
      }

      // 4. ПЕЩЕРЫ И ТЕМНОТА: УСТАНОВКА ФАКЕЛОВ И ОСТОРОЖНОСТЬ
      const env = this.caveNav.checkEnvironment(this.bot);
      if (env.isDark || env.inCave) {
        // Пробуем поставить факел при необходимости
        if (this.caveNav.shouldPlaceTorch(this.bot)) {
          await this.caveNav.placeTorch(this.bot);
        }
        // Включаем человеческую осторожность если темно и нет света
        this.caveNav.handleDarknessCaution(this.bot, this.movementController);
      } else if (this.movementController?.isDarkCaution) {
        this.movementController.setDarkCaution(false);
      }

      // 5. ПОВЕДЕНИЕ КОМПАНЬОНА: ДЕРЖАТЬСЯ РЯДОМ С ХОЗЯИНОМ
      // Если бот находится в режиме ожидания ('waiting') по приказу хозяина — не срываемся с места!
      if (this.movementController && (this.movementController.mode === 'waiting' || this.movementController.isPaused)) {
        return;
      }

      const ownerUsername = this.config?.bot?.owner || 'kustash01';
      const ownerPlayer = this.bot.players?.[ownerUsername]
        || Object.entries(this.bot.players || {}).find(([n]) => n.toLowerCase() === ownerUsername.toLowerCase())?.[1];
      const ownerEntity = ownerPlayer?.entity;
      if (ownerEntity && !this.bot.pathfinder?.isMoving?.()) {
        const dist = this.bot.entity.position.distanceTo(ownerEntity.position);
        if (dist > 12 && dist < 45) {
          logger.debug(`[${this.bot.username}] Хозяин отошёл (${Math.round(dist)}м), подхожу ближе`);
          if (this.movementController) {
            this.movementController.followPlayer(ownerPlayer.username || ownerUsername, 3);
          } else if (this.bot.pathfinder) {
            try {
              const pathfinderPkg = await import('mineflayer-pathfinder');
              const { goals } = pathfinderPkg.default || pathfinderPkg;
              this.bot.pathfinder.setGoal(new goals.GoalFollow(ownerEntity, 3), true);
            } catch (_) {}
          }
        } else if (dist <= 12) {
          // Периодически смотрим на хозяина
          try {
            this.bot.lookAt(ownerEntity.position.offset(0, 1.6, 0), true);
          } catch (_) {}
        }
      }

      // 6. ТИХИЕ ПОЛЕЗНЫЕ ДЕЛА В ПРОСТОЕ (короткие, безопасные — не походы)
      // Только когда всё спокойно: не в бою, не движемся, не темно/пещера,
      // хозяина нет рядом (или он далеко). Максимум одно короткое действие.
      const idleSafe = !combatAI.inCombat
        && !this.bot.pathfinder?.isMoving?.()
        && this.bot.health >= 18
        && !(this.movementController && (this.movementController.mode === 'waiting' || this.movementController.isPaused));
      const ownerClose = ownerEntity && this.bot.entity.position.distanceTo(ownerEntity.position) <= 16;
      if (idleSafe && !ownerClose && (now - this.lastIdleActivity > this.idleActivityCooldownMs)) {
        await this._doIdleActivity(now);
      }

      // 7. ПРОВЕРКА АВТОНОМНЫХ ЦЕЛЕЙ (бот сам решает чем заняться)
      if (this.autonomousGoals && idleSafe && !ownerClose) {
        if (this.autonomousGoals.shouldConsiderNewGoal()) {
          const goal = this.autonomousGoals.selectNewGoal();
          if (goal) {
            logger.info(`[${this.bot.username}] Автономная цель выбрана: ${goal.name}`);
            await this.autonomousGoals.announceGoal(goal);
          }
        }
      }
    } catch (err) {
      logger.debug(`Ошибка при оценке инициативы: ${err.message}`);
    }
  }

  /**
   * One short, safe, non-committal idle activity. Deliberately conservative:
   * pick up loot within reach, or quietly note a village nearby. Never starts a
   * long expedition (that stays owner-commanded via scout_direction).
   */
  async _doIdleActivity(now) {
    this.lastIdleActivity = now;
    try {
      // a) Подобрать выпавший рядом лут (в пределах пары шагов).
      const drop = Object.values(this.bot.entities || {})
        .find(e => e && e.position && e.name === 'item'
          && this.bot.entity.position.distanceTo(e.position) <= 6);
      if (drop && this.bot.pathfinder) {
        const pathfinderPkg = await import('mineflayer-pathfinder');
        const { goals } = pathfinderPkg.default || pathfinderPkg;
        const p = drop.position;
        this.bot.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, 1));
        logger.debug(`[idle] подбираю лут рядом`);
        return;
      }

      // b) Заметить деревню поблизости и тихо запомнить (без похода к ней).
      if (this.memoryManager?.pois?.addPOI) {
        const detection = structureDetector.detectVillage(this.bot, 48);
        if (detection) {
          const known = (this.memoryManager.pois.getPOIs?.(POITypes.VILLAGE) || [])
            .some(v => Math.hypot(v.x - detection.center.x, v.y - detection.center.y, v.z - detection.center.z) < 24);
          if (!known) {
            this.memoryManager.pois.addPOI(
              `Деревня (${detection.direction.ru})`,
              POITypes.VILLAGE,
              detection.center,
              `Заметил в простое: уверенность ${detection.confidence}`,
            );
            logger.debug(`[idle] запомнил деревню на ${detection.direction.ru}`);
          }
        }
      }
    } catch (err) {
      logger.debug(`[idle] активность не удалась: ${err.message}`);
    }
  }
}
