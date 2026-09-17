import { createLogger } from '../utils/logger.js';
import { HumanErrorEngine } from './human-error-engine.js';
import { adaptiveCamera } from './adaptive-camera.js';

const logger = createLogger('NATURAL_GAZE');

/**
 * NaturalGazeEngine — многофакторный движок естественных движений головы,
 * саккад, периферийного зрения и человеческого зрительного внимания.
 *
 * Человек НЕ держит голову зафиксированной по вектору движения:
 * 1. runningSaccades: беглые оглядывания по сторонам (30-65°) и назад (140-180°) на бегу.
 * 2. peripheralVision: реакция на движение в боковом секторе (30°..110°) с любопытным фликом.
 * 3. groundFootingGlance: взгляд под ноги (-25°..-40° pitch) на обрывах, ямах и при прыжках.
 * 4. skyWeatherCheck: взгляд на небо (+30°..+55° pitch) при закате, грозе или выходе из пещеры.
 * 5. curiosityAudioTurn: поворот головы на резкий звук (взрыв, шаги моба сбоку).
 * 6. mutualGazeAndBreak: зрительный контакт с тиммейтом (1.2-2.0с) с последующим естественным отводом глаз.
 * 7. taskFocusLock: подавление саккад при точной работе (копание обсидиана, натяжение лука).
 * 8. handItemInspect: короткий взгляд на руки при смене предмета в хотбаре.
 * 9. idleGazeWander: живое «дыхание» взгляда в покое (±3-5° Гауссова дрейфа).
 */
export class NaturalGazeEngine {
  constructor(options = {}) {
    this.options = options;
    this.bot = options.bot || null;
    this.isRunning = false;
    this.isTaskFocused = false;
    this.timer = null;
    this.lastSaccadeTime = 0;
    this.lastMutualGazeTime = 0;
    this.mutualGazeTarget = null;
    this.mutualGazeEndTime = 0;
    this.saccadeActive = false;
    this.lastHeadingYaw = 0;
  }

  setBot(bot) {
    this.bot = bot;
  }

  /**
   * Блокировка/разблокировка саккад при выполнении точных задач (копание, лук)
   */
  setTaskFocus(focused = true) {
    this.isTaskFocused = focused;
  }

  start(bot = null) {
    if (bot) this.bot = bot;
    if (!this.bot || this.isRunning) return;
    this.isRunning = true;
    this.lastHeadingYaw = this.bot.entity?.yaw || 0;

    this.timer = setInterval(() => {
      this._tickGaze();
    }, 280);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Периодический цикл анализа визуального внимания
   */
  async _tickGaze() {
    if (!this.isRunning || !this.bot?.entity?.position) return;
    if (this.isTaskFocused || this.saccadeActive) return;

    try {
      const now = Date.now();
      const isMoving = Boolean(
        this.bot.controlState?.forward ||
        this.bot.controlState?.back ||
        this.bot.controlState?.left ||
        this.bot.controlState?.right ||
        (this.bot.entity.velocity && (Math.abs(this.bot.entity.velocity.x) > 0.05 || Math.abs(this.bot.entity.velocity.z) > 0.05))
      );

      // 1. Проверка зрительного контакта с игроком (Mutual Gaze)
      if (this.mutualGazeTarget && now < this.mutualGazeEndTime) {
        const player = this.bot.entities?.[this.mutualGazeTarget];
        if (player?.position) {
          const eye = player.position.offset(0, player.height || 1.6, 0);
          await adaptiveCamera.calmLookAt(this.bot, eye);
          return;
        }
      } else if (this.mutualGazeTarget && now >= this.mutualGazeEndTime) {
        // Естественный разрыв контакта: отводим взгляд в сторону и вниз
        this.mutualGazeTarget = null;
        const currentYaw = this.bot.entity.yaw || 0;
        const breakYaw = currentYaw + HumanErrorEngine.gaussian(0.35, 0.1);
        const breakPitch = HumanErrorEngine.gaussian(-0.25, 0.08);
        if (typeof this.bot.look === 'function') {
          await this.bot.look(breakYaw, breakPitch, true);
        }
        return;
      }

      // 2. Взгляд под ноги при угрозе обрыва или неровной поверхности
      if (isMoving && this._checkLedgeAhead()) {
        await this.performGroundFootingGlance();
        return;
      }

      // 3. Периферическое зрение: реагируем на появление мобов сбоку
      const peripheralTarget = this.detectPeripheralThreat();
      if (peripheralTarget && now - this.lastSaccadeTime > 4000) {
        await this.performPeripheralFlick(peripheralTarget);
        return;
      }

      // 4. Саккады на бегу: периодический взгляд по сторонам / назад каждые 3-7 секунд
      if (isMoving && now - this.lastSaccadeTime > 4500) {
        const shouldSaccade = HumanErrorEngine.gaussian(0, 1) > -0.2;
        if (shouldSaccade) {
          await this.performRunningSaccade();
          return;
        }
      }

      // 5. Взгляд на небо и погоду при смене времени суток
      if (!isMoving && now - this.lastSaccadeTime > 8000) {
        if (this._shouldCheckSky()) {
          await this.performSkyCheck();
          return;
        }
      }

      // 6. Микро-дрейф глаз в покое (Idle Gaze Wander)
      if (!isMoving) {
        this.performIdleWander();
      }
    } catch (_) {}
  }

  /**
   * Детекция сущностей в периферийном зрении (угол 30°..110° от линии взгляда)
   */
  detectPeripheralThreat() {
    if (!this.bot?.entity?.position || !this.bot.entities) return null;
    const botPos = this.bot.entity.position;
    const botYaw = this.bot.entity.yaw || 0;

    for (const id in this.bot.entities) {
      const e = this.bot.entities[id];
      if (!e || !e.position || e === this.bot.entity) continue;
      const dist = botPos.distanceTo(e.position);
      if (dist > 10 || dist < 1.5) continue;

      const isInteresting = e.type === 'mob' || e.type === 'player';
      if (!isInteresting) continue;

      // Вычисляем угол относительно направления взгляда
      const dx = e.position.x - botPos.x;
      const dz = e.position.z - botPos.z;
      const angleToEntity = Math.atan2(-dx, -dz);
      let diff = angleToEntity - botYaw;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;

      const deg = Math.abs((diff * 180) / Math.PI);
      // Периферийное зрение: сектор 30° - 110°
      if (deg >= 30 && deg <= 110) {
        return e;
      }
    }
    return null;
  }

  /**
   * Реакция периферийного зрения: быстрый поворот на объект и возврат
   */
  async performPeripheralFlick(entity) {
    if (!entity?.position || !this.bot?.entity) return;
    this.saccadeActive = true;
    this.lastSaccadeTime = Date.now();

    const originalYaw = this.bot.entity.yaw;
    const originalPitch = this.bot.entity.pitch;

    const targetPos = entity.position.offset(0, entity.height ? entity.height * 0.5 : 0.8, 0);
    await adaptiveCamera.calmLookAt(this.bot, targetPos);
    await new Promise(r => setTimeout(r, 450 + Math.floor(Math.abs(HumanErrorEngine.gaussian(100, 40)))));

    // Возврат взгляда
    if (typeof this.bot.look === 'function') {
      await this.bot.look(originalYaw, originalPitch, true);
    }
    this.saccadeActive = false;
  }

  /**
   * Саккада на бегу: оглядывание по сторонам или быстрая проверка тыла
   */
  async performRunningSaccade() {
    if (!this.bot?.entity) return;
    this.saccadeActive = true;
    this.lastSaccadeTime = Date.now();

    const originalYaw = this.bot.entity.yaw;
    const originalPitch = this.bot.entity.pitch;

    // В 80% случаев оглядываемся на фланг (±40°..±70°), в 20% смотрим назад (150°..180°)
    const lookBack = HumanErrorEngine.gaussian(0, 1) > 0.8;
    const sign = HumanErrorEngine.coinFlip();
    const flankAngle = HumanErrorEngine.range(45, 70, this.bot);
    const rearAngle = HumanErrorEngine.range(150, 175, this.bot);
    const angleOffsetDeg = lookBack ? sign * rearAngle : sign * flankAngle;
    const saccadeYaw = originalYaw + (angleOffsetDeg * Math.PI) / 180;
    const saccadePitch = originalPitch + HumanErrorEngine.gaussian(0, 0.08);

    if (typeof this.bot.look === 'function') {
      await this.bot.look(saccadeYaw, saccadePitch, true);
      const saccadeHoldMs = Math.round(HumanErrorEngine.range(350, 550, this.bot));
      await new Promise(r => setTimeout(r, saccadeHoldMs));
      await this.bot.look(originalYaw, originalPitch, true);
    }
    this.saccadeActive = false;
  }

  /**
   * Взгляд под ноги при опасности падения / обрыве
   */
  async performGroundFootingGlance() {
    if (!this.bot?.entity) return;
    this.saccadeActive = true;
    this.lastSaccadeTime = Date.now();

    const originalYaw = this.bot.entity.yaw;
    const downPitch = -0.55 + HumanErrorEngine.gaussian(0, 0.05); // ~ -32 градуса вниз

    if (typeof this.bot.look === 'function') {
      await this.bot.look(originalYaw, downPitch, true);
      await new Promise(r => setTimeout(r, 380));
      await this.bot.look(originalYaw, 0, true);
    }
    this.saccadeActive = false;
  }

  /**
   * Проверка обрыва или ямы прямо перед ботом
   */
  _checkLedgeAhead() {
    if (!this.bot?.entity?.position || typeof this.bot.blockAt !== 'function') return false;
    const yaw = this.bot.entity.yaw || 0;
    const forwardX = -Math.sin(yaw) * 1.5;
    const forwardZ = -Math.cos(yaw) * 1.5;
    const checkPos = this.bot.entity.position.offset(forwardX, -1, forwardZ);
    const b = this.bot.blockAt(checkPos);
    const b2 = this.bot.blockAt(checkPos.offset(0, -1, 0));
    return (!b || b.name === 'air') && (!b2 || b2.name === 'air');
  }

  /**
   * Проверка необходимости взглянуть на небо
   */
  _shouldCheckSky() {
    if (!this.bot?.time?.timeOfDay) return false;
    const t = this.bot.time.timeOfDay;
    // Время заката (11800 - 13000) или рассвета (22500 - 24000)
    return (t >= 11800 && t <= 13000) || (t >= 22500 && t <= 24000);
  }

  /**
   * Взгляд на небо / солнце
   */
  async performSkyCheck() {
    if (!this.bot?.entity) return;
    this.saccadeActive = true;
    this.lastSaccadeTime = Date.now();

    const originalYaw = this.bot.entity.yaw;
    const skyPitch = 0.65; // ~37 градусов вверх

    if (typeof this.bot.look === 'function') {
      await this.bot.look(originalYaw, skyPitch, true);
      await new Promise(r => setTimeout(r, 600));
      await this.bot.look(originalYaw, 0, true);
    }
    this.saccadeActive = false;
  }

  /**
   * Установка зрительного контакта с напарником (1.2 - 2.0 сек)
   */
  triggerMutualGaze(playerEntityId, durationMs = 1500) {
    this.mutualGazeTarget = playerEntityId;
    this.mutualGazeEndTime = Date.now() + durationMs;
  }

  /**
   * Беглый взгляд на руки / инструмент при смене слота хотбара
   */
  async performHandInspect() {
    if (!this.bot?.entity || this.isTaskFocused) return;
    const originalPitch = this.bot.entity.pitch || 0;
    const inspectPitch = Math.max(-Math.PI / 2, originalPitch - 0.35);

    if (typeof this.bot.look === 'function') {
      await this.bot.look(this.bot.entity.yaw, inspectPitch, true);
      await new Promise(r => setTimeout(r, 220));
      await this.bot.look(this.bot.entity.yaw, originalPitch, true);
    }
  }

  /**
   * Микро-дрейф глаз в покое
   */
  performIdleWander() {
    if (!this.bot?.entity || typeof this.bot.look !== 'function') return;
    const currentYaw = this.bot.entity.yaw ?? 0;
    const currentPitch = this.bot.entity.pitch ?? 0;
    const dYaw = HumanErrorEngine.gaussian(0, 0.025);
    const dPitch = HumanErrorEngine.gaussian(0, 0.018);
    this.bot.look(currentYaw + dYaw, Math.max(-1.4, Math.min(1.4, currentPitch + dPitch)), true);
  }
}

export const naturalGazeEngine = new NaturalGazeEngine();
