import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FidgetController } from '../../../src/behavior/fidget-controller.js';
import vec3 from 'vec3';

describe('FidgetController (Anti-AFK Latency Fidgeting)', () => {
  let fidget;

  beforeEach(() => {
    fidget = new FidgetController();
  });

  afterEach(() => {
    fidget.stopThinking();
  });

  it('запускает режим размышления и останавливает его', () => {
    const mockBot = {
      entity: { position: vec3(0, 64, 0), yaw: 0, pitch: 0 },
      look: vi.fn().mockResolvedValue(true),
      setControlState: vi.fn(),
    };

    fidget.startThinking(mockBot);
    expect(fidget.isThinking).toBe(true);

    fidget.stopThinking();
    expect(fidget.isThinking).toBe(false);
  });

  it('смотрит в сторону игрока поблизости при размышлении', async () => {
    const mockBot = {
      entity: { position: vec3(0, 64, 0), yaw: 0, pitch: 0 },
      entities: {
        5: {
          type: 'player',
          position: vec3(2, 64, 2),
          height: 1.6,
        },
      },
      look: vi.fn().mockResolvedValue(true),
      setControlState: vi.fn(),
    };

    fidget.startThinking(mockBot);
    await fidget._fidgetTick();

    expect(mockBot.look).toHaveBeenCalled();
  });

  it('делает естественные микроколебания камеры, если игроков рядом нет', async () => {
    const mockBot = {
      entity: { position: vec3(0, 64, 0), yaw: 1.2, pitch: 0.1 },
      entities: {},
      look: vi.fn().mockResolvedValue(true),
      setControlState: vi.fn(),
    };

    fidget.startThinking(mockBot);
    await fidget._fidgetTick();

    expect(mockBot.look).toHaveBeenCalled();
    const [calledYaw, calledPitch] = mockBot.look.mock.calls[0];
    expect(Math.abs(calledYaw - 1.2)).toBeLessThan(0.1);
  });
});
