import { describe, it, expect, beforeEach } from 'vitest';
import vec3 from 'vec3';
import { AuditoryEngine } from '../../../src/behavior/auditory-engine.js';
import { AdrenalineController } from '../../../src/behavior/adrenaline-controller.js';

describe('AuditoryEngine — 3D слух, когнитивная глухота и стартл-рефлекс', () => {
  let bot;
  let adrenaline;
  let auditory;

  beforeEach(() => {
    bot = {
      entity: {
        position: vec3(0, 64, 0),
        yaw: 0,
        pitch: 0,
      }
    };
    adrenaline = new AdrenalineController();
    auditory = new AuditoryEngine(bot, adrenaline);
  });

  it('регистрирует звуки и локализует 3D направление с человеческим разбросом', () => {
    const soundPos = vec3(5, 64, 5);
    const res = auditory.processSound('block.chest.open', soundPos, 1.0);

    expect(res.heard).toBe(true);
    expect(res.sound).toBeDefined();
    expect(res.sound.distance).toBeCloseTo(7.07, 1);
    expect(typeof res.sound.perceivedYaw).toBe('number');
    expect(typeof res.sound.perceivedPitch).toBe('number');
  });

  it('моделирует когнитивную глухоту (Inattentional Deafness) при высокой нагрузке', () => {
    auditory.setTaskFocus('mining_obsidian', 0.95);
    const distantPos = vec3(18, 64, 18);

    // Тихий далекий звук зомби должен быть проигнорирован
    const res = auditory.processSound('entity.zombie.ambient', distantPos, 0.4);
    expect(res.heard).toBe(false);
    expect(res.reason).toBe('inattentional_deafness');
  });

  it('критическое шипение крипера в упор пробивает когнитивную глухоту', () => {
    auditory.setTaskFocus('crafting_diamonds', 0.95);
    const closeCreeper = vec3(1, 64, 1);

    const res = auditory.processSound('entity.creeper.primed', closeCreeper, 1.0);
    expect(res.heard).toBe(true);
    expect(res.reaction).toBeDefined();
    expect(['snap_shield', 'panic_fumble', 'freeze_hesitate']).toContain(res.reaction.action);
    expect(res.reaction.delayMs).toBeGreaterThan(30);
  });

  it('сохраняет историю недавних звуков', () => {
    auditory.processSound('block.lava.pop', vec3(3, 64, 0), 0.8);
    auditory.processSound('entity.skeleton.shoot', vec3(10, 64, 0), 1.0);

    const recent = auditory.getRecentSounds(5000);
    expect(recent.length).toBe(2);
    expect(recent[0].name).toBe('entity.skeleton.shoot');
  });
});
