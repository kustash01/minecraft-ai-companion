import { describe, it, expect, beforeEach } from 'vitest';
import { AdrenalineController } from '../../../src/behavior/adrenaline-controller.js';

describe('AdrenalineController — физиология возбуждения и закон Йеркса-Додсона', () => {
  let adrenaline;

  beforeEach(() => {
    adrenaline = new AdrenalineController({ baseline: 0.1, calmWindowMs: 50, decayRatePerSec: 0.5 });
  });

  it('инициализируется в состоянии покоя/вялости', () => {
    expect(adrenaline.adrenaline).toBeCloseTo(0.1, 2);
    expect(adrenaline.heartRateBpm).toBe(72);
    expect(adrenaline.isSluggish()).toBe(true);
    expect(adrenaline.isPanicking()).toBe(false);
    expect(adrenaline.isFlowState()).toBe(false);
  });

  it('повышает уровень адреналина и пульс при получении урона и опасности', () => {
    adrenaline.triggerDamage(6);
    expect(adrenaline.adrenaline).toBeGreaterThan(0.3);
    adrenaline.update(100);
    expect(adrenaline.heartRateBpm).toBeGreaterThan(75);
  });

  it('всплеск адреналина от шипения крипера зависит от близости', () => {
    adrenaline.triggerCreeperHiss(2.0); // близко
    expect(adrenaline.adrenaline).toBeGreaterThan(0.4);
    expect(adrenaline.isFlowState() || adrenaline.isPanicking()).toBe(true);
  });

  it('реализует закон Йеркса-Додсона с оптимумом в зоне 0.35-0.55', () => {
    // В покое (0.1) эффективность ниже оптимума
    adrenaline.adrenaline = 0.1;
    const effRest = adrenaline.getYerkesDodsonEfficiency();

    // В оптимуме (0.45) максимальная эффективность
    adrenaline.adrenaline = 0.45;
    const effFlow = adrenaline.getYerkesDodsonEfficiency();
    expect(effFlow).toBeCloseTo(1.0, 1);
    expect(effFlow).toBeGreaterThan(effRest);

    // При панике (0.9) эффективность снова падает
    adrenaline.adrenaline = 0.9;
    const effPanic = adrenaline.getYerkesDodsonEfficiency();
    expect(effPanic).toBeLessThan(effFlow);
    expect(adrenaline.isPanicking()).toBe(true);
  });

  it('рассчитывает тремор рук и туннельное зрение при панике', () => {
    adrenaline.adrenaline = 0.45;
    expect(adrenaline.getTremorMultiplier()).toBe(0.75); // в потоке руки точны
    expect(adrenaline.getAttentionTunnelingFactor()).toBe(0.0);

    adrenaline.adrenaline = 0.85;
    expect(adrenaline.getTremorMultiplier()).toBeGreaterThan(1.8); // панический тремор
    expect(adrenaline.getAttentionTunnelingFactor()).toBeGreaterThan(0.4); // туннельное зрение
  });
});
