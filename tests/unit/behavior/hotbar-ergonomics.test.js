import { describe, it, expect, beforeEach } from 'vitest';
import { HotbarErgonomics } from '../../../src/behavior/hotbar-ergonomics.js';
import { AdrenalineController } from '../../../src/behavior/adrenaline-controller.js';

describe('HotbarErgonomics — эргономика хотбара, осечки клавиш 1-9 и прочность', () => {
  let bot;
  let adrenaline;
  let hotbar;

  beforeEach(() => {
    bot = {
      health: 20,
      food: 20,
      inventory: {
        items: () => []
      }
    };
    adrenaline = new AdrenalineController();
    hotbar = new HotbarErgonomics(bot, adrenaline);
  });

  it('содержит семантическую раскладку опытного игрока', () => {
    expect(hotbar.semanticSlots.sword).toBe(0);
    expect(hotbar.semanticSlots.pickaxe).toBe(1);
    expect(hotbar.semanticSlots.food).toBe(7);
    expect(hotbar.semanticSlots.water_bucket).toBe(8);
  });

  it('оценивает переключение слота с возвратом валидного слота в диапазоне 0..8', () => {
    const res = hotbar.evaluateSlotSwitch(1); // кирка (клавиша 2)
    expect(res.slotToEquip).toBeGreaterThanOrEqual(0);
    expect(res.slotToEquip).toBeLessThanOrEqual(8);
    expect(res.intendedSlot).toBe(1);
    if (res.hadKeySlip) {
      expect(res.realizationDelayMs).toBeGreaterThan(50);
    }
  });

  it('защищает инструмент с критически низкой прочностью (паранойя прочности)', () => {
    const freshPickaxe = { name: 'diamond_pickaxe', maxDurability: 1561, durabilityUsed: 100 };
    const safeRes = hotbar.evaluateDurabilitySafety(freshPickaxe);
    expect(safeRes.safe).toBe(true);
    expect(safeRes.shouldPreserve).toBe(false);

    const dyingPickaxe = { name: 'diamond_pickaxe', maxDurability: 1561, durabilityUsed: 1520 }; // ~2.6%
    const criticalRes = hotbar.evaluateDurabilitySafety(dyingPickaxe);
    expect(criticalRes.safe).toBe(false);
    expect(criticalRes.ratio).toBeLessThan(0.15);
    expect(typeof criticalRes.shouldPreserve).toBe('boolean');
  });

  it('рассчитывает человеческий интервал кликов при перемещении предметов в сундуке', () => {
    const delay1 = hotbar.evaluateItemTransferDelay(1);
    const delay7 = hotbar.evaluateItemTransferDelay(7); // строчная микро-пауза

    expect(delay1).toBeGreaterThanOrEqual(30);
    expect(delay7).toBeGreaterThan(delay1);
  });
});
