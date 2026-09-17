import { createLogger } from '../utils/logger.js';
import { HumanErrorEngine } from './human-error-engine.js';

const logger = createLogger('HOTBAR_ERGONOMICS');

/**
 * HotbarErgonomics ? ???????? ?????? ???????, ???????????? ?????? ?????? 1-9
 * ? ???????-????????? ? ????????? ?????????.
 */
export class HotbarErgonomics {
  constructor(bot, adrenalineController = null) {
    this.bot = bot;
    this.adrenaline = adrenalineController;

    this.semanticSlots = {
      sword: 0,
      pickaxe: 1,
      axe: 2,
      shovel: 2,
      torch: 3,
      blocks: 3,
      food: 7,
      water_bucket: 8,
    };
  }

  evaluateSlotSwitch(targetSlot) {
    if (targetSlot < 0 || targetSlot > 8) targetSlot = 0;

    const state = HumanErrorEngine.getPsychophysiologicalState(this.bot);
    const efficiency = this.adrenaline ? this.adrenaline.getYerkesDodsonEfficiency() : 0.85;

    const slipFactor = (state.stress * 0.35 + state.fatigue * 0.25 + (1.0 - efficiency) * 0.4);
    const slipNoise = HumanErrorEngine.gaussian(slipFactor, 0.12);

    if (slipNoise > 0.42) {
      const direction = HumanErrorEngine.gaussian(0, 1) > 0 ? 1 : -1;
      let slippedSlot = targetSlot + direction;
      if (slippedSlot < 0) slippedSlot = 1;
      if (slippedSlot > 8) slippedSlot = 7;

      const realizationDelayMs = Math.max(100, Math.round(HumanErrorEngine.gaussian(160 + state.fatigue * 70, 25)));

      logger.debug(`[HOTBAR] Осечка пальца! Нажата клавиша слота ${slippedSlot + 1} вместо ${targetSlot + 1} (осознание через ${realizationDelayMs}мс, стресс: ${state.stress.toFixed(2)})`);

      return {
        slotToEquip: slippedSlot,
        intendedSlot: targetSlot,
        hadKeySlip: true,
        realizationDelayMs,
      };
    }

    return {
      slotToEquip: targetSlot,
      intendedSlot: targetSlot,
      hadKeySlip: false,
      realizationDelayMs: 0,
    };
  }

  evaluateDurabilitySafety(item) {
    if (!item || typeof item.maxDurability !== 'number' || item.maxDurability <= 0) {
      return { safe: true, ratio: 1.0, shouldPreserve: false, overlooked: false };
    }

    const currentDamage = item.durabilityUsed ?? 0;
    const remaining = item.maxDurability - currentDamage;
    const ratio = Math.max(0, remaining / item.maxDurability);

    if (ratio >= 0.15) {
      return { safe: true, ratio, shouldPreserve: false, overlooked: false };
    }

    const state = HumanErrorEngine.getPsychophysiologicalState(this.bot);
    const oversightNoise = HumanErrorEngine.gaussian(state.fatigue * 0.45 + state.stress * 0.35, 0.15);
    const overlooked = ratio > 0.04 && oversightNoise > 0.48;

    if (overlooked) {
      logger.debug(`[HOTBAR] Прочность инструмента ${item.name} низкая (${(ratio * 100).toFixed(0)}%), но игрок увлечён и пока не заметил`);
      return { safe: false, ratio, shouldPreserve: false, overlooked: true };
    }

    logger.debug(`[HOTBAR] Паранойя прочности: инструмент ${item.name} спасён на ${(ratio * 100).toFixed(0)}% прочности!`);
    return { safe: false, ratio, shouldPreserve: true, overlooked: false };
  }

  evaluateItemTransferDelay(itemIndex = 0) {
    const state = HumanErrorEngine.getPsychophysiologicalState(this.bot);
    const base = 55 + state.fatigue * 30;
    let delay = Math.max(35, Math.round(HumanErrorEngine.gaussian(base, 12)));

    if (itemIndex > 0 && itemIndex % 7 === 0) {
      delay += Math.max(40, Math.round(HumanErrorEngine.gaussian(110, 20)));
    }

    return delay;
  }
}
