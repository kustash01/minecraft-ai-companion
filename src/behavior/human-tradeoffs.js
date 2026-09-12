import { ToolKnowledge, ThreatKnowledge, FoodKnowledge } from '../perception/game-knowledge.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('HUMAN_TRADEOFFS');

/**
 * HumanTradeoffs — принятие человеческих компромиссных решений на основе контекста и приоритетов:
 * - Свобода и жизнь важнее расходных инструментов (сломает кирку, чтобы спастись).
 * - Ценные вещи с чарами (Починка, Шёлк) зовёт друга помочь выкопать, а не ломает попусту.
 * - При переноске лута дверь держит открытой намеренно.
 * - При угрозе жизни не отвлекается на закрывание дверей и ямы от криперов.
 * - При отравлении ищет молоко/мёд, при ранении друга делится лучшей едой.
 */
export class HumanTradeoffs {
  /**
   * Оценка использования инструмента при износе или застревании
   */
  static evaluateToolUsage({ tool, isTrapped = false, nearbyTeammate = null }) {
    if (!tool) return { action: 'none' };
    const val = ToolKnowledge.getToolValue(tool);

    // 1. БОТ ЗАСТРЯЛ В ЯМЕ / ПЕЩЕРЕ
    if (isTrapped) {
      // Если инструмент драгоценный (Шёлк, Удача, Починка, незерит) и друг рядом — просим помощи!
      if (val.isPrecious && nearbyTeammate) {
        logger.info(`[TRADEOFF] Инструмент ${tool.name} ценный (чары/тир). Зовём ${nearbyTeammate} на помощь вместо поломки.`);
        return {
          action: 'call_teammate_for_help',
          tool,
          teammate: nearbyTeammate,
          reason: 'precious_tool_needs_help',
        };
      }

      // Если инструмент расходный (камень, железо без редких чар) — ломаем ради свободы!
      logger.info(`[TRADEOFF] Бот застрял! Жертвуем ${tool.name} (прочность ${val.durabilityLeft}), чтобы выбраться.`);
      return {
        action: 'sacrifice_to_escape',
        tool,
        reason: 'freedom_over_cheap_tool',
      };
    }

    // 2. ОБЫЧНАЯ РУТИННАЯ ДОБЫЧА
    // Если инструмент почти сломан (<= 5% долговечности)
    if (val.durabilityPercent <= 0.05 && val.durabilityLeft <= 10) {
      if (val.isPrecious) {
        logger.info(`[TRADEOFF] ${tool.name} на исходе (${val.durabilityLeft} ударов). Убираем на починку.`);
        return {
          action: 'save_for_repair',
          tool,
          reason: 'preserve_valuable_tool',
        };
      }
    }

    return { action: 'use_normally', tool };
  }

  /**
   * Оценка необходимости закрывать дверь или калитку
   */
  static evaluateDoorDecision({ isRunningFromThreat = false, isShuttlingItems = false, lastPassTime = 0 }) {
    // 1. Бегство от угрозы — дверь бросаем открытой, жизнь дороже!
    if (isRunningFromThreat) {
      return { closeDoor: false, reason: 'fleeing_for_life' };
    }

    // 2. Курсирование между сундуком и складом (частый проход туда-обратно)
    if (isShuttlingItems || (Date.now() - lastPassTime < 25000 && lastPassTime > 0)) {
      return { closeDoor: false, reason: 'shuttling_between_chests' };
    }

    // 3. Спокойная обстановка / уход на вылазку — закрываем
    return { closeDoor: true, reason: 'secure_base' };
  }

  /**
   * Принятие решения по еде и взаимовыручке
   */
  static evaluateFoodDecision(bot, { inCombat = false, activeEffects = [], nearbyTeammate = null, teammateHealth = 20 }) {
    const myHealth = bot?.health ?? 20;
    const myFood = bot?.food ?? 20;

    // 1. Тиммейт ранен ($HP < 10$) или голодает — делимся едой
    if (nearbyTeammate && teammateHealth < 10) {
      const foodToShare = FoodKnowledge.selectBestFood(bot, { inCombat, health: teammateHealth });
      if (foodToShare) {
        return {
          action: 'share_with_teammate',
          item: foodToShare,
          recipient: nearbyTeammate,
          reason: 'teammate_in_need',
        };
      }
    }

    // 2. Сам отравлен / под иссушением — ищем молоко
    const hasBadEffect = activeEffects.some((eff) => ['poison', 'wither'].includes(eff.name || eff));
    if (hasBadEffect) {
      const cure = bot.inventory?.items()?.find((i) => i.name === 'milk_bucket' || i.name === 'honey_bottle');
      if (cure) {
        return { action: 'drink_cure', item: cure, reason: 'cure_negative_effect' };
      }
    }

    // 3. Сам голоден или ранен в бою
    if (myFood < 18 || (inCombat && myHealth < 14)) {
      const bestFood = FoodKnowledge.selectBestFood(bot, { inCombat, health: myHealth, foodLevel: myFood, activeEffects });
      if (bestFood) {
        return { action: 'eat_food', item: bestFood, reason: 'replenish_health_saturation' };
      }
    }

    return { action: 'none' };
  }

  /**
   * Оценка боевой тактики при сбитом щите, окружении или стрейфе
   */
  static evaluateCombatTactic({ target, hasObstacleBehind = false, shieldDisabled = false, health = 20, isSprinting = false }) {
    // 1. Щит отключен топором
    if (shieldDisabled) {
      if (!hasObstacleBehind) {
        return { tactic: 'retreat_kite_5s', reason: 'space_available_to_kite' };
      }
      // Позади тупик/стена — переходим в агрессивный клинч на опережение
      return { tactic: 'melee_clutch_counter', reason: 'cornered_counter_attack' };
    }

    // 2. W-Tap: только в спринте на дистанции прямого удара
    const wTap = isSprinting;

    // 3. Прыжковый крит: при достаточном здоровье и дистанции
    const jumpCrit = health > 8;

    return { tactic: 'standard_combat', wTap, jumpCrit };
  }

  /**
   * Оценка необходимости и частоты установки факелов (экономия vs безопасность)
   */
  static evaluateTorchDecision({ torchCount = 0, isDark = false, inCave = false, isIntersection = false, timeSinceLastTorch = 0 }) {
    if (torchCount <= 0) {
      return { shouldPlace: false, reason: 'no_torches' };
    }

    // Если факелов мало (<= 3), экономим: ставим ТОЛЬКО на развилках/перекрёстках или при глубокой тьме с большим интервалом
    if (torchCount <= 3) {
      if (isIntersection && timeSinceLastTorch >= 15000) {
        return { shouldPlace: true, reason: 'scarce_torches_save_for_intersection', interval: 15000 };
      }
      if (isDark && timeSinceLastTorch >= 25000) {
        return { shouldPlace: true, reason: 'scarce_torches_emergency_only', interval: 25000 };
      }
      return { shouldPlace: false, reason: 'conserving_scarce_torches' };
    }

    // Обычный режим (факелов достаточно): ставим в темноте при прошествии нормального интервала (8 сек)
    if ((isDark || inCave) && timeSinceLastTorch >= 8000) {
      return { shouldPlace: true, reason: 'normal_cave_lighting', interval: 8000 };
    }

    return { shouldPlace: false, reason: 'sufficient_light_or_cooldown' };
  }
}
