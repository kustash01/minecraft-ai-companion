import { createLogger } from '../utils/logger.js';
import { combatAI } from '../combat/combat-ai.js';
import { bodyLanguage } from '../behavior/body-language.js';

const logger = createLogger('MOVEMENT_CONTROLLER');

const FORMATION_PROFILES = {
  Sam: { angleOffset: -0.75, baseDist: 3.5, jitterRate: 0.35, role: 'scout_left' },
  Max: { angleOffset: 0.65, baseDist: 3.2, jitterRate: 0.15, role: 'commander_right' },
  Jack: { angleOffset: -1.75, baseDist: 4.8, jitterRate: 0.65, role: 'explorer_wide_left' },
  Ryan: { angleOffset: 1.65, baseDist: 4.2, jitterRate: 0.30, role: 'miner_wide_right' },
  Alex: { angleOffset: Math.PI, baseDist: 4.0, jitterRate: 0.20, role: 'quartermaster_rear' },
  Leo: { angleOffset: 0.0, baseDist: 2.8, jitterRate: 0.50, role: 'vanguard_point' },
};

/**
 * MovementController — естественное индивидуальное перемещение каждого бота,
 * тактические формации вокруг игрока и защита от застреваний и утопления.
 */
export class MovementController {
  /**
   * @param {Object} options
   * @param {string} options.agentName
   * @param {Object} options.bot
   */
  constructor({ agentName, bot = null }) {
    this.agentName = agentName;
    this.bot = bot;
    this.mode = 'idle'; // 'idle' | 'following' | 'moving_to' | 'waiting' | 'combat'
    this.targetPlayer = null;
    this.followDistance = 3;
    this.destination = null;
    this.basePosition = null;
    this.isPaused = false;
    this.lastGoalUpdate = 0;
    this.lastIdleLook = 0;
    this.lastHopTime = 0;
    this.physicsListener = null;
    this.recentGoals = [];
    this.lastPosition = null;
    this.lastProgressAt = Date.now();
    this.stuckSince = 0;
    this.goalReachedListener = null;
    this.lastFormationGoal = null;
    this.isDarkCaution = false;
    // Incremented on every bot binding. Async pathfinder continuations use it
    // in addition to object identity so a reconnect that reuses the same bot
    // instance still invalidates stale replans.
    this.bindingRevision = 0;
    // Separates overlapping movement commands within the same bot binding.
    // A stale async continuation must not cancel or overwrite a newer order.
    this.commandRevision = 0;

    this.formation = FORMATION_PROFILES[agentName] || {
      angleOffset: (Math.random() - 0.5) * Math.PI,
      baseDist: 3.5,
      jitterRate: 0.3,
      role: 'follower',
    };

    if (bot) {
      this.attachBot(bot);
    }
  }

  /**
   * Включение/выключение режима осторожности в темноте
   */
  setDarkCaution(enabled) {
    const next = Boolean(enabled);
    if (this.isDarkCaution !== next) {
      this.isDarkCaution = next;
      if (this.isDarkCaution && this.bot?.setControlState) {
        this.bot.setControlState('sprint', false);
      }
      logger.debug(`[${this.agentName}] Режим осторожности в темноте: ${this.isDarkCaution ? 'ВКЛ' : 'ВЫКЛ'}`);
    }
  }

  attachBot(bot) {
    const oldBot = this.bot;
    const oldPhysicsListener = this.physicsListener;
    const oldGoalReachedListener = this.goalReachedListener;

    // Detach listeners from the bot they were actually registered on. This
    // must happen before replacing `this.bot`; otherwise reconnects leak the
    // old listeners and keep stale physics callbacks alive.
    if (oldBot && oldPhysicsListener) {
      oldBot.removeListener('physicsTick', oldPhysicsListener);
    }
    if (oldBot && oldGoalReachedListener) {
      oldBot.removeListener('goal_reached', oldGoalReachedListener);
    }
    this.physicsListener = null;
    this.goalReachedListener = null;
    this.bindingRevision += 1;
    this.commandRevision += 1;
    this.bot = bot;
    if (!this.bot) return;

    const bindingRevision = this.bindingRevision;
    const boundBot = this.bot;
    this.physicsListener = () => {
      if (this.bot !== boundBot || this.bindingRevision !== bindingRevision) return;
      this._onPhysicsTick();
    };
    this.goalReachedListener = () => {
      if (this.bot !== boundBot || this.bindingRevision !== bindingRevision) return;
      if (this.mode === 'moving_to') {
        this.mode = 'idle';
        this.destination = null;
      }
      this.lastProgressAt = Date.now();
    };
    this.bot.on('physicsTick', this.physicsListener);
    this.bot.on('goal_reached', this.goalReachedListener);

    logger.debug(`[${this.agentName}] MovementController подключен к physicsTick (Formation: ${this.formation.role})`);
  }

  /**
   * Следовать за игроком в индивидуальной формации
   * @param {string} playerName
   * @param {number} [distance]
   */
  async followPlayer(playerName, distance = null, { signal = null, expectedBot = this.bot } = {}) {
    const commandBot = expectedBot;
    const commandRevision = ++this.commandRevision;
    this.mode = 'following';
    this.targetPlayer = playerName;
    this.followDistance = distance || this.formation.baseDist;
    this.isPaused = false;
    const result = await this._updateFormationGoal({ signal, expectedBot: commandBot, expectedCommandRevision: commandRevision });
    if (!result?.available) {
      if (this.bot === commandBot && this.commandRevision === commandRevision) this.stop();
      return { status: 'failed', code: result?.code || 'FOLLOW_GOAL_UNAVAILABLE' };
    }
    return { status: 'completed', ...result };
  }

  /**
   * Переместиться к конкретным координатам
   */
  async moveTo(x, y, z) {
    const commandBot = this.bot;
    const bindingRevision = this.bindingRevision;
    const commandRevision = ++this.commandRevision;
    this.mode = 'moving_to';
    this.destination = this._chooseNearbyGoal({ x, y, z }, 2.5);
    const destination = this.destination;
    this.isPaused = false;

    if (!commandBot || !commandBot.pathfinder) return;

    try {
      const pathfinderPkg = await import('mineflayer-pathfinder');
      const { goals } = pathfinderPkg.default || pathfinderPkg;
      if (
        this.bot !== commandBot
        || this.bindingRevision !== bindingRevision
        || this.commandRevision !== commandRevision
        || this.mode !== 'moving_to'
        || this.destination !== destination
      ) return;
      commandBot.pathfinder.setGoal(new goals.GoalNear(
        Math.floor(destination.x),
        Math.floor(destination.y),
        Math.floor(destination.z),
        1.2
      ));
      this._rememberGoal(destination);
      logger.info(`[${this.agentName}] Перемещение к [${destination.x.toFixed(1)}, ${destination.y.toFixed(1)}, ${destination.z.toFixed(1)}]`);
    } catch (err) {
      logger.warn(`[${this.agentName}] Ошибка установки GoalNear: ${err.message}`);
    }
  }

  stop() {
    this.commandRevision += 1;
    this.mode = 'idle';
    this.targetPlayer = null;
    this.destination = null;
    this.isPaused = false;
    this.lastFormationGoal = null;

    if (this.bot?.pathfinder) {
      try {
        this.bot.pathfinder.stop();
      } catch (e) {}
    }
    if (this.bot?.clearControlStates) {
      this.bot.clearControlStates();
    }
    logger.info(`[${this.agentName}] Движение полностью остановлено`);
  }

  wait() {
    this.commandRevision += 1;
    this.mode = 'waiting';
    this.isPaused = true;
    if (this.bot?.pathfinder) {
      try {
        this.bot.pathfinder.stop();
      } catch (e) {}
    }
    if (this.bot?.clearControlStates) {
      this.bot.clearControlStates();
    }
    logger.info(`[${this.agentName}] Ожидание на позиции`);
  }

  isMoving() {
    return this.mode === 'following' || this.mode === 'moving_to' || Boolean(this.bot?.pathfinder?.isMoving?.());
  }

  resume() {
    if (this.mode === 'waiting' && this.targetPlayer) {
      this.followPlayer(this.targetPlayer, this.followDistance);
    } else if (this.mode === 'waiting' && this.destination) {
      this.moveTo(this.destination.x, this.destination.y, this.destination.z);
    }
  }

  stayNear(centerPos, maxRadius = 6) {
    if (!this.bot?.entity?.position || !centerPos) return;

    const current = this.bot.entity.position;
    const dist = current.distanceTo(centerPos);

    if (dist > maxRadius && this.mode === 'idle') {
      logger.debug(`[${this.agentName}] Слишком далеко от группы (${dist.toFixed(1)}м > ${maxRadius}м), возвращаюсь.`);
      this.moveTo(centerPos.x, centerPos.y, centerPos.z);
    }
  }

  /**
   * Обновление цели следования с учётом угла и дистанции формации
   * @private
   */
  async _updateFormationGoal({ signal = null, expectedBot = this.bot, expectedCommandRevision = this.commandRevision } = {}) {
    const bot = expectedBot;
    const bindingRevision = this.bindingRevision;
    if (!bot || this.bot !== bot || this.commandRevision !== expectedCommandRevision || !this.targetPlayer || signal?.aborted) return { available: false, code: 'FOLLOW_TARGET_UNAVAILABLE' };
    const playerEntry = bot.players?.[this.targetPlayer]
      || Object.entries(bot.players || {}).find(([name]) => name.toLowerCase() === String(this.targetPlayer).toLowerCase())?.[1];
    const player = playerEntry?.entity;
    if (!player || !player.position) return { available: false, code: 'PLAYER_NOT_VISIBLE' };
    if (!bot.pathfinder) return { available: false, code: 'PATHFINDER_UNAVAILABLE' };

    try {
      const pathfinderPkg = await import('mineflayer-pathfinder');
      const { goals } = pathfinderPkg.default || pathfinderPkg;
      if (
        signal?.aborted
        || this.bot !== bot
        || this.bindingRevision !== bindingRevision
        || this.commandRevision !== expectedCommandRevision
        || !this.targetPlayer
      ) return { available: false, code: 'FOLLOW_CANCELLED' };

      const playerYaw = player.yaw || 0;
      // Keep each companion's slot stable. Randomizing it on every update makes
      // pathfinder continuously cancel and rebuild routes, causing stutter.
      const angle = playerYaw + this.formation.angleOffset;
      const dist = this.followDistance;

      // Вычисляем смещённую точку формации вокруг игрока
      const targetX = player.position.x - Math.sin(angle) * dist;
      const targetZ = player.position.z + Math.cos(angle) * dist;
      const targetY = player.position.y;

      const myDistToTarget = bot.entity.position.distanceTo({ x: targetX, y: targetY, z: targetZ });

      const goalMoved = !this.lastFormationGoal || Math.hypot(
        targetX - this.lastFormationGoal.x,
        targetZ - this.lastFormationGoal.z
      ) > 1.25;

      // Replan only when the owner has actually moved the formation forward.
      if (myDistToTarget > 1.5 && goalMoved) {
        bot.pathfinder.setGoal(new goals.GoalNear(Math.floor(targetX), Math.floor(targetY), Math.floor(targetZ), 1.2));
        this.lastFormationGoal = { x: targetX, y: targetY, z: targetZ };
        this._rememberGoal({ x: targetX, y: targetY, z: targetZ });
        return { available: true, goalInstalled: true, nearTarget: false };
      }
      return { available: true, goalInstalled: Boolean(this.lastFormationGoal), nearTarget: myDistToTarget <= 1.5 };
    } catch (err) {
      logger.debug(`[${this.agentName}] Formation update error: ${err.message}`);
      return { available: false, code: 'FOLLOW_GOAL_FAILED', error: err.message };
    }
  }

  /**
   * Тик физики реального времени (20 раз в секунду)
   * @private
   */
  _onPhysicsTick() {
    if (!this.bot || !this.bot.entity || this.isPaused) return;

    const now = Date.now();
    this._trackProgress(now);

    // 1. АВТОМАТИЧЕСКОЕ ВСПЛЫТИЕ В ВОДЕ (Защита от утопления)
    const blockAtFeet = typeof this.bot.blockAt === 'function' ? this.bot.blockAt(this.bot.entity.position) : null;
    const inLiquid = this.bot.entity.isInWater || (blockAtFeet && blockAtFeet.name?.includes('water'));
    if (inLiquid && typeof this.bot.setControlState === 'function') {
      this.bot.setControlState('jump', true);
    } else if (this.mode === 'idle' && typeof this.bot.getControlState === 'function' && this.bot.getControlState('jump')) {
      this.bot.setControlState('jump', false);
    }

    // 2. ДИНАМИЧЕСКАЯ ФОРМАЦИЯ ПРИ СЛЕДОВАНИИ
    if (this.mode === 'following' && this.targetPlayer) {
      if (now - this.lastGoalUpdate > 1500) {
        this.lastGoalUpdate = now;
        this._updateFormationGoal();
      }

      // Спринт и jump-sprint если игрок уходит далеко (> 6 блоков) и НЕ включен режим темноты
      const player = this.bot.players?.[this.targetPlayer]?.entity
        || Object.entries(this.bot.players || {}).find(([name]) => name.toLowerCase() === String(this.targetPlayer).toLowerCase())?.[1]?.entity;
      if (!this.isDarkCaution && player && this.bot.entity.position.distanceTo(player.position) > 6) {
        this.bot.setControlState('sprint', true);
        if (this.bot.entity.onGround && Math.random() < 0.35 && now - this.lastHopTime > 1100) {
          this.lastHopTime = now;
          this.bot.setControlState('jump', true);
          setTimeout(() => this.bot?.setControlState?.('jump', false), 200);
        }
      } else {
        this.bot.setControlState('sprint', false);
      }
    }

    // 3. ЖИВОЕ ПОВЕДЕНИЕ (взгляды по сторонам, реакция на приседание игрока)
    if (this.mode === 'idle' && !inLiquid) {
      // Реакция на дружеское приседание игрока рядом (shift-shift приветствие)
      const nearbyPlayer = this.bot.nearestEntity?.((e) => e && e.type === 'player' && e !== this.bot.entity && this.bot.entity.position.distanceTo(e.position) <= 4);
      if (nearbyPlayer) {
        const isSneaking = Boolean(nearbyPlayer.crouching || (nearbyPlayer.metadata && (nearbyPlayer.metadata[0] & 0x02)));
        if (isSneaking && now - (this._lastShiftResponse || 0) > 6000) {
          this._lastShiftResponse = now;
          bodyLanguage.shiftGreeting(this.bot);
        }
      }

      const lookInterval = this.isDarkCaution ? 1800 : 4000;
      if (now - this.lastIdleLook > lookInterval) {
        this.lastIdleLook = now + (this.isDarkCaution ? (Math.random() * 800 - 400) : (Math.random() * 2000 - 1000));
        // В темноте осматриваемся шире и внимательнее
        const jitterRate = this.isDarkCaution ? 0.75 : this.formation.jitterRate;
        if (Math.random() < jitterRate && typeof this.bot.look === 'function') {
          const yawAngle = this.isDarkCaution ? (Math.random() * 1.6 - 0.8) : (Math.random() * 0.8 - 0.4);
          const pitchAngle = this.isDarkCaution ? (-0.3 + (Math.random() * 0.5)) : (Math.random() * 0.4 - 0.2);
          const yaw = this.bot.entity.yaw + yawAngle;
          this.bot.look(yaw, pitchAngle, true).catch(() => {});
        }
      }
    }
  }

  _chooseNearbyGoal(center, radius) {
    const candidates = [{ ...center }];
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 0.8 + Math.random() * radius;
      candidates.push({
        x: center.x + Math.cos(angle) * distance,
        y: center.y,
        z: center.z + Math.sin(angle) * distance,
      });
    }

    return candidates.reduce((best, candidate) => {
      const candidateDistance = this._distanceFromRecentGoals(candidate);
      const bestDistance = this._distanceFromRecentGoals(best);
      return candidateDistance > bestDistance ? candidate : best;
    });
  }

  _distanceFromRecentGoals(candidate) {
    if (this.recentGoals.length === 0) return Infinity;
    return Math.min(...this.recentGoals.map((goal) => Math.hypot(goal.x - candidate.x, goal.z - candidate.z)));
  }

  _rememberGoal(goal) {
    this.recentGoals.push({ x: goal.x, y: goal.y, z: goal.z, at: Date.now() });
    if (this.recentGoals.length > 12) this.recentGoals.shift();
  }

  _trackProgress(now) {
    const position = this.bot.entity.position;
    if (!this.lastPosition || position.distanceTo(this.lastPosition) > 0.35) {
      this.lastPosition = typeof position.clone === 'function' ? position.clone() : { ...position };
      this.lastProgressAt = now;
      this.stuckSince = 0;
      return;
    }

    if ((this.mode !== 'moving_to' && this.mode !== 'following') || now - this.lastProgressAt < 7000) return;
    if (!this.stuckSince) this.stuckSince = now;
    if (now - this.stuckSince < 1500) return;

    logger.warn(`[${this.agentName}] Нет прогресса на маршруте, перестраиваю путь.`);
    this.bot.pathfinder?.stop();
    if (this.mode === 'following') {
      this.lastGoalUpdate = 0;
      this._updateFormationGoal();
    } else if (this.destination) {
      this.moveTo(this.destination.x, this.destination.y, this.destination.z);
    }
    this.lastProgressAt = now;
    this.stuckSince = 0;
  }

  cleanup() {
    if (this.bot && this.physicsListener) {
      this.bot.removeListener('physicsTick', this.physicsListener);
      this.physicsListener = null;
    }
    if (this.bot && this.goalReachedListener) {
      this.bot.removeListener('goal_reached', this.goalReachedListener);
      this.goalReachedListener = null;
    }
    this.stop();
  }
}
