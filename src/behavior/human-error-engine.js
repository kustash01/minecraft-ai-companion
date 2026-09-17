import { createLogger } from '../utils/logger.js';

const logger = createLogger('HUMAN_ERROR_ENGINE');

/**
 * HumanErrorEngine — моделирование психофизиологических погрешностей и человеческих несовершенств.
 *
 * Человек НЕ использует равномерный Math.random() — его ошибки зависят от:
 * 1. Уровня стресса (HP, количество врагов в упор, огонь, тьма).
 * 2. Уровня усталости и голода (шкала сытости, насыщенность, длительность без отдыха).
 * 3. Биомеханического шума рук (нормальное Гауссово распределение, а не плоский рандом).
 * 4. Когнитивной нагрузки (поиск предметов в захламлённом сундуке, реакция на щит).
 */
export class HumanErrorEngine {
  /**
   * Гауссово случайное число (преобразование Бокса-Мюллера)
   * Возвращает биологически естественное колоколообразное распределение.
   */
  static gaussian(mean = 0, stdev = 1) {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdev + mean;
  }

  /**
   * Расчёт психофизиологического состояния тела
   * @param {object} bot - Mineflayer bot
   * @returns {{ stress: number, fatigue: number, focus: number }}
   */
  static getPsychophysiologicalState(bot) {
    if (!bot) return { stress: 0.1, fatigue: 0.1, focus: 0.9 };

    const hp = typeof bot.health === 'number' ? bot.health : 20;
    const food = typeof bot.food === 'number' ? bot.food : 20;
    const saturation = typeof bot.foodSaturation === 'number' ? bot.foodSaturation : 5;

    // 1. Стресс (0.0 .. 1.0)
    let stress = 0.05; // базовый фоновый стресс
    if (hp < 6) {
      stress += 0.45; // паника при смертельном здоровье
    } else if (hp < 12) {
      stress += 0.25; // тревога при среднем здоровье
    }

    // Враги рядом (в радиусе 7 метров)
    if (bot.entities) {
      let hostilesCount = 0;
      const botPos = bot.entity?.position;
      if (botPos) {
        for (const id in bot.entities) {
          const e = bot.entities[id];
          if (!e || !e.position || e === bot.entity) continue;
          const isHostile = ['zombie', 'skeleton', 'creeper', 'spider', 'witch', 'enderman'].some(h =>
            (e.name || '').includes(h)
          );
          if (isHostile && botPos.distanceTo(e.position) <= 7) {
            hostilesCount++;
          }
        }
      }
      stress += Math.min(0.4, hostilesCount * 0.12);
    }

    // Горение / лава / падение
    if (bot.entity?.metadata && (Number(bot.entity.metadata[0]) & 0x01) !== 0) stress += 0.3;
    if (bot.entity?.isInLava) stress += 0.35;
    if (bot.entity?.velocity && bot.entity.velocity.y < -0.6) stress += 0.25;

    // Интеграция AdrenalineController (если подключен к боту)
    if (bot._adrenalineController) {
      stress = Math.max(stress, bot._adrenalineController.adrenaline);
    }

    // 2. Усталость (0.0 .. 1.0)
    let fatigue = 0.05;
    if (food < 6) {
      fatigue += 0.45; // истощение
    } else if (food < 12) {
      fatigue += 0.2;
    }
    if (saturation <= 0) {
      fatigue += 0.15;
    }

    stress = Math.min(1.0, Math.max(0.0, stress));
    fatigue = Math.min(1.0, Math.max(0.0, fatigue));
    const focus = Math.min(1.0, Math.max(0.05, 1.0 - (stress * 0.55 + fatigue * 0.4)));

    return { stress, fatigue, focus };
  }

  /**
   * Оценка тайминга прыжкового крита (Jump Crit)
   * В реальной игре человек при стрессе/усталости может ударить чуть раньше на взлёте
   * (обычный удар вместо крита) или запоздать с кликом.
   */
  static evaluateCritTiming(bot) {
    const { stress, fatigue, focus } = this.getPsychophysiologicalState(bot);

    // Смещение тайминга в миллисекундах по Гауссу.
    // При высоком стрессе среднее смещается в минус (поспешный клик на взлете).
    const meanShift = (stress - 0.2) * -60;
    const jitter = (1.0 - focus) * 70 + 15;
    const timingOffsetMs = Math.round(this.gaussian(meanShift, jitter));

    // Идеальное окно крита: падение с вертикальной скоростью < -0.05 м/с.
    // Если timingOffsetMs < -45мс — удар пришёлся на фазу подъема (смазанный крит).
    // Если timingOffsetMs > 65мс — удар пришёлся после приземления на землю.
    const isCrit = timingOffsetMs >= -45 && timingOffsetMs <= 65;

    let reason = 'идеальный тайминг';
    if (!isCrit) {
      if (timingOffsetMs < -45) reason = stress > 0.5 ? 'поспешный удар на взлёте из-за стресса' : 'небольшая спешка';
      else reason = fatigue > 0.5 ? 'запоздалый клик из-за усталости' : 'чуть запоздал с кликом';
    }

    logger.debug(`[HUMAN_ERROR] Крит: ${isCrit ? 'УСПЕХ' : 'СМАЗАН'} (${reason}, оффсет: ${timingOffsetMs}мс, стресс: ${stress.toFixed(2)})`);

    return {
      isCrit,
      timingOffsetMs,
      reason,
      stress,
      fatigue,
    };
  }

  /**
   * Оценка реакции на поднятие щита
   * Время реакции человека: 110-280мс в зависимости от стресса и усталости.
   * @param {object} bot
   * @returns {{ reactionDelayMs: number, earlyDrop: boolean, stress: number }}
   */
  static evaluateShieldReaction(bot) {
    const { stress, fatigue } = this.getPsychophysiologicalState(bot);
    // При стрессе/панике время реакции увеличивается из-за перегрузки внимания
    const baseReaction = 110 + stress * 120 + fatigue * 80;
    const reactionDelayMs = Math.max(40, Math.round(this.gaussian(baseReaction, 30)));

    // Паническое судорожное опускание щита: моделируется через порог Гауссова распределения
    // Наступает только при экстремальном стрессе в хвосте колоколообразной кривой
    const panicExceed = this.gaussian(stress, 0.15);
    const earlyDrop = panicExceed > 0.85;

    return {
      reactionDelayMs,
      earlyDrop,
      stress,
    };
  }

  /**
   * Оценка досягаемости цели и возможный взмах по воздуху (whiff / miss)
   * Реальный игрок в пылу боя иногда кликает на дистанции 3.1–3.4м, переоценивая reach (3.0 блока).
   * @param {object} bot
   * @param {number} distance - Дистанция до хитбокса цели
   * @returns {{ shouldSwing: boolean, isWhiff: boolean, reason: string }}
   */
  static evaluateAttackReach(bot, distance) {
    if (typeof distance !== 'number' || isNaN(distance)) {
      return { shouldSwing: true, isWhiff: false, reason: 'нормальная дистанция' };
    }

    // Внутри гарантированного радиуса атаки Minecraft (<= 3.0м)
    if (distance <= 3.0) {
      return { shouldSwing: true, isWhiff: false, reason: 'в радиусе поражения' };
    }

    // Пограничная зона (3.0 - 3.4м): игрок может нетерпеливо взмахнуть оружием
    if (distance <= 3.4) {
      const { stress, focus } = this.getPsychophysiologicalState(bot);
      // Чем выше стресс и ниже фокус, тем выше вероятность клика на грани досягаемости
      const impatienceScore = this.gaussian(stress * 0.6 + (distance - 3.0) * 1.5, (1 - focus) * 0.3 + 0.1);
      if (impatienceScore > 0.55) {
        return {
          shouldSwing: true,
          isWhiff: true,
          reason: 'поспешный взмах мимо цели (не дотянулся 0.2-0.4м)'
        };
      }
      return { shouldSwing: false, isWhiff: false, reason: 'сокращение дистанции' };
    }

    return { shouldSwing: false, isWhiff: false, reason: 'цель слишком далеко' };
  }

  /**
   * Человеческое дрожание и сглаживание мыши (Micro-Tremor & Hand Jitter)
   * Добавляет микро-погрешность в прицеливание (1-3 градуса).
   * @param {object} bot
   * @param {number} targetYaw
   * @param {number} targetPitch
   * @returns {{ yaw: number, pitch: number }}
   */
  static applyMouseJitter(bot, targetYaw, targetPitch) {
    const { stress, fatigue } = this.getPsychophysiologicalState(bot);
    const tremorMult = bot?._adrenalineController?.getTremorMultiplier() ?? 1.0;
    const noiseFactor = (stress * 0.04 + fatigue * 0.02 + 0.008) * tremorMult; // радианы (~0.5 - 2.5 градуса)

    const yawNoise = this.gaussian(0, noiseFactor);
    const pitchNoise = this.gaussian(0, noiseFactor * 0.7);

    return {
      yaw: targetYaw + yawNoise,
      pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetPitch + pitchNoise)),
    };
  }

  /**
   * Человеческая задержка поиска в сундуке (Visual Search Latency)
   * Чем больше разных предметов в сундуке и чем выше стресс — тем дольше глаз ищет предмет.
   * @param {number} itemCount - Количество предметов в контейнере
   * @param {object} bot
   * @returns {{ delayMs: number, overlookedFirstPass: boolean }}
   */
  static evaluateChestSearchDelay(itemCount = 10, bot = null) {
    const { stress, fatigue } = this.getPsychophysiologicalState(bot);
    const basePerItem = 8; // мс на визуальный просмотр ячейки
    const totalBase = 60 + itemCount * basePerItem * (1.0 + stress * 0.8 + fatigue * 0.5);
    const delayMs = Math.max(50, Math.round(this.gaussian(totalBase, 25)));

    // Рассеивание внимания при захламлённом сундуке и высоком стрессе через Гауссов хвост
    const attentionScore = this.gaussian(stress * 0.6 + (itemCount / 30) * 0.4, 0.2);
    const overlookedFirstPass = attentionScore > 0.8;

    return {
      delayMs: overlookedFirstPass ? delayMs + 180 : delayMs,
      overlookedFirstPass,
    };
  }

  /**
   * Человеческая микро-заминка перед копанием блока (Hesitation)
   */
  static evaluateDiggingHesitation(bot, block = null) {
    const { stress, fatigue } = this.getPsychophysiologicalState(bot);
    let base = 50 + fatigue * 100;
    if (stress > 0.6) base += 80;
    return Math.max(25, Math.round(this.gaussian(base, 20)));
  }

  /**
   * Оценка точности столба под себя (Pillar Up)
   * При панике можно поставить блок с лёгкой задержкой в 1-2 тика.
   */
  static evaluatePillarTiming(bot) {
    const { stress } = this.getPsychophysiologicalState(bot);
    const jitterTicks = stress > 0.6 ? Math.round(Math.abs(this.gaussian(1, 0.8))) : 0;
    return {
      extraDelayTicks: jitterTicks,
      stress,
    };
  }

  /**
   * Задержка когнитивного выбора рецепта при крафте
   * Сложные рецепты требуют доли секунды на припоминание сетки крафта.
   * @param {object} bot
   * @param {number} complexity - Сложность рецепта (1..5)
   * @returns {number} Задержка в мс
   */
  static evaluateCraftingHesitation(bot, complexity = 1) {
    const { stress, fatigue } = this.getPsychophysiologicalState(bot);
    const base = 80 + complexity * 60 + fatigue * 120 + stress * 70;
    return Math.max(40, Math.round(this.gaussian(base, 25)));
  }

  /**
   * Тайминг спасения MLG Water Clutch
   * При падении задержка реакции рук на клик ведром.
   * @param {object} bot
   * @returns {number} Задержка в мс
   */
  static evaluateClutchTiming(bot) {
    const { stress } = this.getPsychophysiologicalState(bot);
    const mean = 15 + stress * 25;
    return Math.max(0, Math.round(this.gaussian(mean, 10)));
  }

  /**
   * Естественная человеческая пауза (колоколообразная, а не плоская Math.random)
   * @param {number} min - Минимальная граница
   * @param {number} max - Максимальная граница
   * @param {object} bot
   * @returns {number} Время в мс
   */
  static evaluateGamerPause(min = 200, max = 500, bot = null) {
    const { fatigue } = this.getPsychophysiologicalState(bot);
    const fatigueShift = fatigue * ((max - min) * 0.2);
    const mean = (min + max) / 2 + fatigueShift;
    const stdev = (max - min) / 6; // 99.7% значений попадает в диапазон
    const val = Math.round(this.gaussian(mean, stdev));
    return Math.max(min, Math.min(max, val));
  }

  /**
   * Биологическая проверка шанса (альтернатива наивному Math.random() < p)
   * Учитывает гауссову погрешность и психофизиологическое состояние.
   * @param {number} probability - Базовый шанс (0.0 .. 1.0)
   * @param {object} botOrContext - Бот или контекст со stress/fatigue
   * @returns {boolean}
   */
  static chance(probability = 0.5, botOrContext = null) {
    if (probability <= 0) return false;
    if (probability >= 1) {
      if (process.env.NODE_ENV === 'test') return true;
      // В живом режиме у человека не бывает 100% непогрешимости (микро-моргание, заминка, спазм)
      probability = 0.995;
    }

    const state = typeof botOrContext?.stress === 'number'
      ? botOrContext
      : this.getPsychophysiologicalState(botOrContext);

    // Стресс и усталость слегка сдвигают порог
    const stressMod = (state.stress - 0.2) * 0.15;
    const adjustedProb = Math.min(0.995, Math.max(0.005, probability + stressMod));

    // Сравниваем через Гауссов колокол с порогом 0.5
    const roll = this.gaussian(adjustedProb, 0.14);
    return roll >= 0.5;
  }

  /**
   * Естественное случайное число в диапазоне [min, max] по нормальному распределению
   * @param {number} min
   * @param {number} max
   * @param {object} botOrContext
   * @returns {number}
   */
  static range(min, max, botOrContext = null) {
    if (min >= max) return min;
    const mean = (min + max) / 2;
    const stdev = (max - min) / 6; // 99.7% значений попадает в диапазон
    const val = this.gaussian(mean, stdev);
    return Math.max(min, Math.min(max, val));
  }

  /**
   * Биомеханический шум рук/взгляда вокруг нуля
   * @param {number} amplitude - Максимальная амплитуда
   * @param {object} botOrContext
   * @returns {number}
   */
  static jitter(amplitude = 1.0, botOrContext = null) {
    const tremorMult = botOrContext?._adrenalineController?.getTremorMultiplier?.() ?? 1.0;
    const stdev = (amplitude / 3) * tremorMult;
    const val = this.gaussian(0, stdev);
    return Math.max(-amplitude, Math.min(amplitude, val));
  }

  /**
   * Биологический выбор знака (+1 или -1)
   * @returns {number} 1 или -1
   */
  static coinFlip() {
    return this.gaussian(0, 1) >= 0 ? 1 : -1;
  }

  /**
   * Человеческий выбор элемента из массива (без плоского Math.random)
   * @param {Array} items
   * @returns {*}
   */
  static choice(items) {
    if (!Array.isArray(items) || items.length === 0) return null;
    if (items.length === 1) return items[0];
    const index = Math.floor(this.range(0, items.length - 0.001));
    return items[Math.max(0, Math.min(items.length - 1, index))];
  }

  /**
   * Человеческий взвешенный выбор элемента из массива с Гауссовым шумом весов
   * @param {Array} items
   * @param {Function} [weightFn]
   * @returns {*}
   */
  static weightedChoice(items, weightFn = (item) => item?.weight ?? item?.priority ?? 1) {
    if (!Array.isArray(items) || items.length === 0) return null;
    if (items.length === 1) return items[0];

    const perturbed = items.map(item => {
      const baseWeight = Math.max(0.001, Number(weightFn(item)) || 0.001);
      // Человеческое восприятие субъективной важности колеблется по Гауссу
      const jitterFactor = Math.max(0.1, 1 + this.jitter(0.15));
      return { item, weight: baseWeight * jitterFactor };
    });

    const totalWeight = perturbed.reduce((sum, p) => sum + p.weight, 0);
    let target = this.range(0, totalWeight);

    for (const p of perturbed) {
      target -= p.weight;
      if (target <= 0) return p.item;
    }
    return perturbed[perturbed.length - 1].item;
  }
}
