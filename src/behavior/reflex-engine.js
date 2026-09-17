import { createLogger } from '../utils/logger.js';
import vec3 from 'vec3';
import { adaptiveCamera } from './adaptive-camera.js';
import { KinematicsEngine } from './kinematics.js';

const logger = createLogger('REFLEX_ENGINE');

/**
 * ReflexEngine — высокочастотный спинной мозг (Tick-Level Reflex Layer):
 * Работает на частоте игровых тиков (20 Hz) без задержек LLM:
 * 1. Экстренная защита щитом от криперов с резким фликом камеры
 * 2. Отражение стрел скелетов
 * 3. MLG Water Bucket Clutch при опасном падении
 * 4. Тушение при попадании в лаву/огонь
 * 5. Спасение от удушья при осыпании песка/гравия
 * 6. Этикет дружественного огня (отскок без атаки в ответ)
 * 7. Ответный шифт-спам при приветствии тиммейта
 */
export class ReflexEngine {
  constructor(bot, options = {}) {
    this.bot = bot;
    this.options = options;
    this.enabled = true;
    this.tickInterval = null;
    this.lastShieldTime = 0;
    this.lastClutchTime = 0;
    this.lastShiftResponseTime = 0;
    this.playerSneakCounts = new Map(); // username -> { count, lastTime }
    this.emergencyHandler = options.emergencyHandler || null;
  }

  setEmergencyHandler(handler) {
    this.emergencyHandler = handler;
  }

  _triggerEmergency(reason) {
    if (typeof this.emergencyHandler === 'function') {
      try {
        this.emergencyHandler(reason);
      } catch (err) {
        logger.warn(`Ошибка emergencyHandler: ${err.message}`);
      }
    }
  }

  /**
   * Запуск спинного мозга
   */
  start() {
    if (!this.bot) return;
    this.enabled = true;

    // Подписываемся на физические тики или интервал 50 мс (20 Hz)
    if (this.bot.on) {
      this.bot.on('physicsTick', this._onTickBound = () => this._onTick());
      this.bot.on('entityHurt', this._onHurtBound = (entity) => this._onHurt(entity));
      // health меняется при любом изменении хп бота — самый надёжный сигнал
      // для предсмертного рефлекса тотема.
      this.bot.on('health', this._onHealthBound = () => this._reflexTotem());
    } else {
      this.interval = setInterval(() => this._onTick(), 50);
    }
    this.isTicking = true;
    logger.info('[REFLEX_ENGINE] Спинной мозг запущен (20 Hz tick loop)');
  }

  /**
   * Остановка
   */
  stop() {
    this.enabled = false;
    if (!this.isTicking) return;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isTicking = false;
    if (this.bot && typeof this.bot.removeListener === 'function') {
      if (this._onTickBound) this.bot.removeListener('physicsTick', this._onTickBound);
      if (this._onHurtBound) this.bot.removeListener('entityHurt', this._onHurtBound);
      if (this._onHealthBound) this.bot.removeListener('health', this._onHealthBound);
    }
  }

  /**
   * Главный цикл физического тика
   * @private
   */
  async _onTick() {
    if (!this.enabled || !this.bot?.entity?.position) return;

    try {
      // 1. Проверка смертельного падения (MLG Water Clutch)
      await this._checkFallClutch();

      // 2. Проверка взрыва крипера поблизости
      await this._checkCreeperDanger();

      // 3. Проверка лавы / возгорания
      await this._checkFireAndLava();

      // 4. Проверка осыпания песка/гравия (удушье)
      await this._checkSuffocation();

      // 5. Проверка дружеского шифт-спама тиммейтов
      await this._checkSocialSneak();
    } catch (_) {}
  }

  /**
   * 1. Спасение ведром воды при падении (MLG Water Clutch)
   * @private
   */
  async _checkFallClutch() {
    const vel = this.bot.entity.velocity;
    if (!vel || vel.y >= -0.65 || this.bot.entity.isInWater) return;
    if (Date.now() - this.lastClutchTime < 2500) return;

    const items = this.bot.inventory?.items() || [];
    const waterBucket = items.find((i) => i.name === 'water_bucket');
    if (!waterBucket) return;

    // Проверяем расстояние до земли
    const pos = this.bot.entity.position;
    let distToGround = 10;
    for (let dy = 1; dy <= 5; dy++) {
      const b = this.bot.blockAt(pos.offset(0, -dy, 0));
      if (b && b.name !== 'air' && b.name !== 'cave_air') {
        distToGround = dy;
        break;
      }
    }

    if (distToGround <= 2.2) {
      this.lastClutchTime = Date.now();
      this._triggerEmergency('Падение с опасной высоты (MLG Water Clutch)');
      logger.info('[REFLEX] Срабатывает MLG Water Clutch!');
      try {
        await this.bot.equip(waterBucket, 'hand');
        // Резкий флик камеры строго под ноги
        await this.bot.look(this.bot.entity.yaw, -Math.PI / 2, true);
        if (typeof this.bot.activateItem === 'function') {
          this.bot.activateItem();
          // Забираем воду назад через 100 мс
          setTimeout(() => {
            try {
              const emptyBucket = this.bot.inventory?.items()?.find((i) => i.name === 'bucket');
              if (emptyBucket && typeof this.bot.equip === 'function') {
                this.bot.equip(emptyBucket, 'hand').then(() => {
                  this.bot.activateItem?.();
                });
              }
            } catch (_) {}
          }, 120);
        }
      } catch (_) {}
    }
  }

  /**
   * 2. Мгновенная защита щитом от криперов
   * @private
   */
  async _checkCreeperDanger() {
    if (Date.now() - this.lastShieldTime < 600) return;

    const nearbyEntities = Object.values(this.bot.entities || {});
    const myPos = this.bot.entity.position;

    const dangerousCreeper = nearbyEntities.find((e) => {
      if (e.name !== 'creeper' || !e.position) return false;
      const dist = myPos.distanceTo(e.position);
      // Если крипер подошел ближе 3.5 блоков или готовится взорваться
      return dist <= 3.5;
    });

    if (dangerousCreeper) {
      this.lastShieldTime = Date.now();
      this._triggerEmergency(`Крипер в опасной близости (${myPos.distanceTo(dangerousCreeper.position).toFixed(1)}m)`);
      logger.info(`[REFLEX] Крипер в опасной близости (${myPos.distanceTo(dangerousCreeper.position).toFixed(1)}м)! Защита щитом.`);

      // Экстренный флик камеры в сторону крипера
      await adaptiveCamera.emergencyFlickTo(this.bot, dangerousCreeper.position.offset(0, 1.2, 0));

      const items = this.bot.inventory?.items() || [];
      const shield = items.find((i) => i.name === 'shield');

      if (shield) {
        if (this.bot.inventory.slots[45]?.name !== 'shield') {
          await this.bot.equip(shield, 'off-hand');
        }
        if (typeof this.bot.activateItem === 'function') {
          this.bot.activateItem(true); // поднимаем щит в оффхенде
          setTimeout(() => {
            try {
              this.bot.deactivateItem?.();
            } catch (_) {}
          }, 2000);
        }
      } else {
        // Щита нет — панический отскок спринт-прыжком назад
        this.bot.setControlState('back', true);
        this.bot.setControlState('sprint', true);
        this.bot.setControlState('jump', true);
        setTimeout(() => {
          this.bot.clearControlStates?.();
        }, 800);
      }
    }
  }

  /**
   * 3. Тушение при попадании в лаву или возгорании
   * @private
   */
  async _checkFireAndLava() {
    if (!this.bot?.entity) return;
    const isBurning = this.bot.entity.isInLava || (this.bot.entity.metadata?.[0] & 0x01) !== 0;
    if (!isBurning) return;

    const items = this.bot.inventory?.items() || [];
    const waterBucket = items.find((i) => i.name === 'water_bucket');
    if (waterBucket && Date.now() - this.lastClutchTime > 3000) {
      this.lastClutchTime = Date.now();
      this._triggerEmergency('Возгорание или попадание в лаву');
      logger.info('[REFLEX] Возгорание! Тушение ведром воды.');
      try {
        await this.bot.equip(waterBucket, 'hand');
        await this.bot.look(this.bot.entity.yaw, -Math.PI / 2, true);
        this.bot.activateItem?.();
      } catch (_) {}
    }
  }

  /**
   * 4. Спасение от удушья при осыпании песка/гравия
   * @private
   */
  async _checkSuffocation() {
    if (!this.bot?.entity?.position || !this.bot.blockAt) return;
    const eyeBlock = this.bot.blockAt(this.bot.entity.position.offset(0, 1.6, 0));
    if (eyeBlock && ['sand', 'gravel', 'concrete_powder'].includes(eyeBlock.name)) {
      this._triggerEmergency(`Осыпался блок ${eyeBlock.name} (удушье)`);
      logger.info(`[REFLEX] Осыпался блок ${eyeBlock.name}! Спасаемся от удушья.`);
      this.bot.setControlState('jump', true);
      setTimeout(() => this.bot.setControlState('jump', false), 250);

      // Копаем блок над головой
      if (typeof this.bot.dig === 'function') {
        try {
          await this.bot.dig(eyeBlock);
        } catch (_) {}
      }
    }
  }

  /**
   * 5. Реакция на дружественный огонь (игрок случайно ударил бота)
   * @private
   */
  _onHurt(entity) {
    if (!entity || entity !== this.bot.entity) return;

    // Рефлекс выживания: если удар оставил на грани смерти — рука сама тянется
    // за тотемом в левую руку. Это НЕ порог "носить тотем при HP<X" (это решает
    // LLM по обстановке), а мгновенный предсмертный рефлекс, как у живого игрока.
    this._reflexTotem();

    // Ищем атакующего игрока поблизости
    const myPos = this.bot.entity.position;
    const nearbyPlayers = Object.values(this.bot.players || {})
      .filter((p) => p.entity && p.entity !== this.bot.entity && myPos.distanceTo(p.entity.position) < 4.0);

    if (nearbyPlayers.length > 0) {
      const attacker = nearbyPlayers[0];
      logger.info(`[REFLEX] Дружественный урон от ${attacker.username}! Отскок без контратаки.`);

      // Отпрыгиваем назад
      this.bot.setControlState('back', true);
      setTimeout(() => {
        this.bot.setControlState('back', false);
        // Приседаем (знак мира)
        KinematicsEngine.crouchNod(this.bot, 2);
      }, 250);
    }
  }

  /**
   * Предсмертный рефлекс: сунуть тотем в оффхенд, когда следующий удар может
   * убить. Срабатывает только на грани смерти и только если тотем есть в
   * инвентаре, но не в руке. Никаких настраиваемых порогов "ношения".
   * @private
   */
  _reflexTotem() {
    try {
      if (!this.bot?.entity) return;
      const hp = this.bot.health;
      if (typeof hp !== 'number') return;

      // "На грани": здоровья мало (<= 6 хп = 3 сердца) — следующий сильный удар
      // добьёт. Это порог СМЕРТЕЛЬНОГО удара, а не тактики.
      if (hp > 6) return;
      this._triggerEmergency(`Критический урон (hp=${hp})`);

      // Тотем уже в оффхенде? Ничего не делаем.
      if (this.bot.inventory?.slots?.[45]?.name === 'totem_of_undying') return;

      const totem = (this.bot.inventory?.items() || []).find((i) => i.name === 'totem_of_undying');
      if (!totem) return;

      logger.info(`[REFLEX] Предсмертный рефлекс: тотем в левую руку (hp=${hp}).`);
      this.bot.equip(totem, 'off-hand').catch(() => {});
    } catch (_) {}
  }

  /**
   * Публичный вызов проверки социального шифта
   */
  async checkSocialSneak() {
    return this._checkSocialSneak();
  }

  async checkSocialCrouch() {
    return this._checkSocialSneak();
  }

  /**
   * 6. Ответный шифт-спам при приветствии тиммейта
   * @private
   */
  async _checkSocialSneak() {
    if (Date.now() - this.lastShiftResponseTime < 4000) return;
    const myPos = this.bot.entity.position;

    const nearbyPlayers = Object.values(this.bot.players || {})
      .filter((p) => p.entity && p.entity !== this.bot.entity && myPos.distanceTo(p.entity.position) < 3.5);

    for (const p of nearbyPlayers) {
      const isSneaking = (p.entity.metadata?.[0] & 0x02) !== 0; // Minecraft sneak bitflag
      if (isSneaking) {
        const record = this.playerSneakCounts.get(p.username) || { count: 0, lastTime: 0 };
        const now = Date.now();
        if (now - record.lastTime < 1200) {
          record.count++;
        } else {
          record.count = 1;
        }
        record.lastTime = now;
        this.playerSneakCounts.set(p.username, record);

        if (record.count >= 2) {
          this.lastShiftResponseTime = now;
          this.playerSneakCounts.delete(p.username);
          logger.info(`[REFLEX] Тиммейт ${p.username} спамит шифт! Ответный дружеский шифт-спам.`);
          // Смотрим на тиммейта плавно
          await adaptiveCamera.calmLookAt(this.bot, p.entity.position.offset(0, p.entity.height || 1.6, 0));
          // Ответные 2-3 приседания
          await KinematicsEngine.crouchNod(this.bot, 3);
        }
      }
    }
  }
}
