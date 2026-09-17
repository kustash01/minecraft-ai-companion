import { createLogger } from '../utils/logger.js';
import { adaptiveCamera } from './adaptive-camera.js';
import { HumanErrorEngine } from './human-error-engine.js';

const logger = createLogger('FIDGET_CONTROLLER');

/**
 * FidgetController — контроллер живого присутствия и микродвижений во время задержек AI (Anti-AFK Latency Fidgeting):
 * Пока Gemini обдумывает ответ или вызывает инструменты (1-2 сек):
 * 1. Живой взгляд на говорящего игрока (если он в поле зрения <8 блоков)
 * 2. Естественные микро-смещения взгляда (±2-3 градуса, дыхание/рука на коврике)
 * 3. Легкий перенос веса тела (одиночный шифт-тап), если ожидание затягивается
 * 4. Моментальная передача управления скрипту при окончании размышления
 */
export class FidgetController {
  constructor(options = {}) {
    this.options = options;
    this.isThinking = false;
    this.interval = null;
    this.thinkingStartTime = 0;
    this.bot = null;
  }

  setBot(bot) {
    this.bot = bot;
  }

  startThinking(bot = null) {
    if (bot) this.bot = bot;
    if (!this.bot || this.isThinking) return;
    this.isThinking = true;
    this.thinkingStartTime = Date.now();

    this.interval = setInterval(() => {
      this._fidgetTick();
    }, 450);
  }

  stopThinking() {
    this.isThinking = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.bot?.setControlState) {
      try { this.bot.setControlState('sneak', false); } catch (_) {}
    }
  }

  async _fidgetTick() {
    if (!this.isThinking || !this.bot?.entity?.position) return;

    try {
      const now = Date.now();
      const elapsed = now - this.thinkingStartTime;

      // 1. Ищем ближайшего живого игрока в радиусе 8 блоков
      let nearestPlayer = null;
      let minDistance = 8.0;

      const myPos = this.bot.entity.position;
      const entities = Object.values(this.bot.entities || {});

      for (const entity of entities) {
        if (!entity || entity === this.bot.entity || entity.type !== 'player' || !entity.position) continue;
        const dist = myPos.distanceTo(entity.position);
        if (dist < minDistance) {
          minDistance = dist;
          nearestPlayer = entity;
        }
      }

      if (nearestPlayer) {
        // Плавно переводим взгляд на голову игрока
        const headPos = nearestPlayer.position.offset(0, nearestPlayer.height || 1.6, 0);
        await adaptiveCamera.calmLookAt(this.bot, headPos);
      } else {
        // Микро-движение взгляда (дыхание / живая рука)
        const currentYaw = this.bot.entity.yaw ?? 0;
        const currentPitch = this.bot.entity.pitch ?? 0;
        const dYaw = HumanErrorEngine.jitter(0.025, this.bot);
        const dPitch = HumanErrorEngine.jitter(0.02, this.bot);
        if (typeof this.bot.look === 'function') {
          await this.bot.look(currentYaw + dYaw, currentPitch + dPitch, true);
        }
      }

      // 2. Если размышление затянулось (>1800ms) — одиночный микро-сдвиг веса (sneak-tap)
      if (elapsed > 1800 && elapsed < 2500 && HumanErrorEngine.chance(0.35, this.bot)) {
        if (typeof this.bot.setControlState === 'function') {
          this.bot.setControlState('sneak', true);
          const tapMs = Math.round(HumanErrorEngine.range(100, 140, this.bot));
          setTimeout(() => {
            if (this.isThinking && typeof this.bot?.setControlState === 'function') {
              this.bot.setControlState('sneak', false);
            }
          }, tapMs);
        }
      }
    } catch (_) {}
  }
}

export const fidgetController = new FidgetController();
