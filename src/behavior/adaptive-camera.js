import { createLogger } from '../utils/logger.js';
import { HumanErrorEngine } from './human-error-engine.js';

const logger = createLogger('ADAPTIVE_CAMERA');

/**
 * Нормализация разности углов в диапазоне [-PI, PI]
 */
function normalizeAngleDiff(target, current) {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/**
 * Плавная кривая замедления/ускорения (Smoothstep / Cubic)
 */
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

/**
 * AdaptiveCamera — кинематический контроллер камеры человека:
 * 1. Спокойный режим: плавный поворот мыши (150-300 мс) с естественными микро-подергиваниями руки.
 * 2. Экстренный режим (крипер, урон, падение): резкий флик (30-60 мс) с легким овершутом и возвратом.
 */
export class AdaptiveCamera {
  constructor(options = {}) {
    this.defaultSteps = options.defaultSteps || 8;
    this.calmStepDelayMs = options.calmStepDelayMs || 25;
    this.emergencyStepDelayMs = options.emergencyStepDelayMs || 15;
    this.isRotating = false;
  }

  /**
   * Вычислить требуемые yaw и pitch до целевой позиции
   */
  static calculateAngles(bot, targetPos) {
    if (!bot?.entity?.position || !targetPos) return { yaw: 0, pitch: 0 };
    const eyePos = bot.entity.position.offset(0, bot.entity.height || 1.6, 0);
    const dx = targetPos.x - eyePos.x;
    const dy = targetPos.y - eyePos.y;
    const dz = targetPos.z - eyePos.z;

    const yaw = Math.atan2(-dx, -dz);
    const groundDistance = Math.hypot(dx, dz);
    const pitch = Math.atan2(dy, groundDistance);

    return { yaw, pitch };
  }

  /**
   * Адаптивный поворот камеры к целевой позиции
   * @param {Object} bot - Mineflayer bot instance
   * @param {Object} targetPos - Координаты цели {x, y, z}
   * @param {Object} [options]
   * @param {boolean} [options.emergency=false] - Экстренный режим (флик)
   * @param {number} [options.steps] - Количество промежуточных шагов
   * @param {boolean} [options.addJitter=true] - Добавлять естественную микро-погрешность
   */
  async lookAt(bot, targetPos, options = {}) {
    if (!bot?.look || !targetPos) return;
    const { yaw, pitch } = AdaptiveCamera.calculateAngles(bot, targetPos);
    return this.look(bot, yaw, pitch, options);
  }

  /**
   * Адаптивный поворот камеры по заданным углам
   */
  async look(bot, targetYaw, targetPitch, options = {}) {
    if (!bot || typeof bot.look !== 'function') return;

    const emergency = options.emergency ?? false;
    const currentYaw = bot.entity?.yaw ?? 0;
    const currentPitch = bot.entity?.pitch ?? 0;

    const diffYaw = normalizeAngleDiff(targetYaw, currentYaw);
    const diffPitch = targetPitch - currentPitch;

    // Если угол мизерный, поворачиваем сразу
    if (Math.abs(diffYaw) < 0.02 && Math.abs(diffPitch) < 0.02) {
      try {
        await bot.look(targetYaw, targetPitch, true);
      } catch (_) {}
      return;
    }

    this.isRotating = true;

    try {
      if (emergency) {
        // === ЭКСТРЕННЫЙ РЕЖИМ (FLICK SHOT) ===
        // Резкий рывок (флик) за 2-3 быстрых тика с легким перелетом (overshoot 4%)
        const overshootMultiplier = 1.04;
        const overshootYaw = currentYaw + diffYaw * overshootMultiplier;
        const overshootPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, currentPitch + diffPitch * overshootMultiplier));

        // Шаг 1: Стремительный флик к цели с овершутом (30-40 мс)
        await bot.look(overshootYaw, overshootPitch, true);
        await new Promise((r) => setTimeout(r, this.emergencyStepDelayMs * 2));

        // Шаг 2: Моментальная доводка на точный угол
        await bot.look(targetYaw, targetPitch, true);
      } else {
        // === СПОКОЙНЫЙ РЕЖИМ (ЧЕЛОВЕЧЕСКАЯ ИНТЕРПОЛЯЦИЯ) ===
        const steps = options.steps || Math.max(5, Math.min(12, Math.round(Math.abs(diffYaw) * 4) + 4));
        const addJitter = options.addJitter ?? true;

        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const easedT = smoothstep(t);

          // Человеческое легкое дрожание руки (только в середине движения)
          const jitterYaw = addJitter && i < steps ? HumanErrorEngine.jitter(0.0075, bot) : 0;
          const jitterPitch = addJitter && i < steps ? HumanErrorEngine.jitter(0.0075, bot) : 0;

          const stepYaw = currentYaw + diffYaw * easedT + jitterYaw;
          const stepPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, currentPitch + diffPitch * easedT + jitterPitch));

          await bot.look(stepYaw, stepPitch, true);
          await new Promise((r) => setTimeout(r, this.calmStepDelayMs));
        }

        // Финальная фиксация точных углов
        await bot.look(targetYaw, targetPitch, true);
      }
    } catch (err) {
      logger.debug(`Ошибка адаптивного поворота камеры: ${err.message}`);
    } finally {
      this.isRotating = false;
    }
  }

  /**
   * Экстренный резкий разворот на источник опасности (за спиной)
   */
  async emergencyFlickTo(bot, dangerPos) {
    return this.lookAt(bot, dangerPos, { emergency: true });
  }

  /**
   * Алиас для экстренного флика взгляда на цель
   */
  async emergencyFlickLookAt(bot, targetPos) {
    return this.lookAt(bot, targetPos, { emergency: true });
  }

  /**
   * Спокойный естественный взгляд на напарника или объект
   */
  async calmLookAt(bot, targetPos) {
    return this.lookAt(bot, targetPos, { emergency: false });
  }
}

export const adaptiveCamera = new AdaptiveCamera();
