import { describe, expect, it, vi } from 'vitest';
import { AdaptiveCamera, adaptiveCamera } from '../../../src/behavior/adaptive-camera.js';

describe('AdaptiveCamera', () => {
  it('smoothly turns camera in calm mode using multiple steps', async () => {
    const lookCalls = [];
    const bot = {
      entity: { yaw: 0, pitch: 0, position: { x: 0, y: 10, z: 0, offset: () => ({ x: 0, y: 11.6, z: 0 }) } },
      look: vi.fn(async (yaw, pitch) => {
        lookCalls.push({ yaw, pitch });
      }),
    };

    const camera = new AdaptiveCamera({ defaultSteps: 6, calmStepDelayMs: 2 });
    await camera.look(bot, 1.5, 0.4, { emergency: false, steps: 5, addJitter: false });

    // Should perform multi-step interpolation
    expect(lookCalls.length).toBeGreaterThanOrEqual(5);
    // Final position should match target
    const finalLook = lookCalls[lookCalls.length - 1];
    expect(finalLook.yaw).toBeCloseTo(1.5, 2);
    expect(finalLook.pitch).toBeCloseTo(0.4, 2);
  });

  it('performs rapid flick with overshoot in emergency mode', async () => {
    const lookCalls = [];
    const bot = {
      entity: { yaw: 0, pitch: 0, position: { x: 0, y: 10, z: 0, offset: () => ({ x: 0, y: 11.6, z: 0 }) } },
      look: vi.fn(async (yaw, pitch) => {
        lookCalls.push({ yaw, pitch });
      }),
    };

    const camera = new AdaptiveCamera({ emergencyStepDelayMs: 2 });
    await camera.look(bot, Math.PI, 0, { emergency: true });

    // Emergency mode should do rapid overshoot then settle
    expect(lookCalls.length).toBe(2);
    expect(lookCalls[0].yaw).toBeGreaterThan(Math.PI); // Overshoot > target
    expect(lookCalls[1].yaw).toBeCloseTo(Math.PI, 4); // Exact target
  });

  it('calculates 3D look angles correctly from coordinates', () => {
    const bot = {
      entity: {
        position: { x: 0, y: 0, z: 0, offset: (dx, dy, dz) => ({ x: dx, y: dy, z: dz }) },
        height: 1.6,
      },
    };

    const targetPos = { x: 10, y: 1.6, z: 0 };
    const { yaw, pitch } = AdaptiveCamera.calculateAngles(bot, targetPos);

    expect(yaw).toBeCloseTo(-Math.PI / 2, 2);
    expect(pitch).toBeCloseTo(0, 2);
  });
});
