import { describe, it, expect, beforeEach } from 'vitest';
import { AttentionManager, AttentionLevel } from '../../../src/cognition/attention.js';

describe('AttentionManager', () => {
  let attention;

  beforeEach(() => {
    attention = new AttentionManager();
  });

  it('should compute high salience for close hostile creepers', () => {
    const score = attention.calculateSalience({
      type: 'mob',
      name: 'creeper',
      distance: 3,
      isHostile: true,
      isPlayer: false,
    });
    expect(score).toBeGreaterThanOrEqual(0.85);
  });

  it('should categorize close threats into FOREGROUND tier', () => {
    const worldState = {
      nearbyEntities: [
        { name: 'creeper', type: 'mob', distance: 3 },
        { name: 'sheep', type: 'passive', distance: 12 },
      ],
    };

    const res = attention.updateAttention(worldState);
    expect(res.foreground).not.toBeNull();
    expect(res.foreground.entity.name).toBe('creeper');
    expect(res.foreground.tier).toBe(AttentionLevel.FOREGROUND);
  });

  it('should support locking focus on an object', () => {
    attention.lockFocus({ name: 'chest', type: 'block' }, 1000);
    expect(attention.isFocusLocked()).toBe(true);
    expect(attention.primaryFocus.entity.name).toBe('chest');
  });
});
