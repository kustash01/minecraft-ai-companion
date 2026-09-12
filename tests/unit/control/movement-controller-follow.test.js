import { describe, expect, it, vi } from 'vitest';
import { MovementController } from '../../../src/control/movement-controller.js';

function createBot({ pathfinder = {}, players = undefined } = {}) {
  const bot = {
    on: vi.fn(),
    removeListener: vi.fn(),
    clearControlStates: vi.fn(),
    setControlState: vi.fn(),
    entity: {
      position: {
        x: 100,
        y: 64,
        z: 200,
        distanceTo: vi.fn(() => 2),
      },
      yaw: 0,
    },
    players: players ?? {
      kustash01: {
        username: 'kustash01',
        entity: {
          position: { x: 102, y: 64, z: 200 },
          yaw: 0,
        },
      },
    },
  };

  if (pathfinder !== null) {
    bot.pathfinder = {
      setGoal: vi.fn(),
      stop: vi.fn(),
      isMoving: vi.fn(() => false),
      ...pathfinder,
    };
  }

  return bot;
}

describe('MovementController followPlayer failure contract', () => {
  it('fails explicitly when the target player is not visible', async () => {
    const bot = createBot({ players: {} });
    const movement = new MovementController({ agentName: 'Sam', bot });

    const result = await movement.followPlayer('kustash01', 3);

    expect(result).toMatchObject({ status: 'failed', code: 'PLAYER_NOT_VISIBLE' });
    expect(movement.mode).toBe('idle');
    expect(movement.targetPlayer).toBeNull();
    expect(bot.pathfinder.setGoal).not.toHaveBeenCalled();
  });

  it('fails explicitly when pathfinder is unavailable', async () => {
    const bot = createBot({ pathfinder: null });
    const movement = new MovementController({ agentName: 'Sam', bot });

    const result = await movement.followPlayer('kustash01', 3);

    expect(result).toMatchObject({ status: 'failed', code: 'PATHFINDER_UNAVAILABLE' });
    expect(movement.mode).toBe('idle');
    expect(movement.targetPlayer).toBeNull();
  });

  it('returns a failed result when pathfinder.setGoal throws', async () => {
    const bot = createBot({
      pathfinder: {
        setGoal: vi.fn(() => {
          throw new Error('pathfinder exploded');
        }),
      },
    });
    const movement = new MovementController({ agentName: 'Sam', bot });

    const result = await movement.followPlayer('kustash01', 3);

    expect(result).toMatchObject({
      status: 'failed',
      code: 'FOLLOW_GOAL_FAILED',
    });
    expect(movement.mode).toBe('idle');
    expect(bot.pathfinder.stop).toHaveBeenCalledOnce();
  });

  it('does not install a delayed goal on a bot attached after the request started', async () => {
    const oldBot = createBot();
    const newBot = createBot();
    const movement = new MovementController({ agentName: 'Sam', bot: oldBot });

    // followPlayer yields while mineflayer-pathfinder is loaded. Reattach before
    // that continuation resumes to model a reconnect racing the old request.
    const pending = movement.followPlayer('kustash01', 3);
    movement.attachBot(newBot);

    const result = await pending;

    expect(result).toMatchObject({ status: 'failed', code: 'FOLLOW_CANCELLED' });
    expect(oldBot.pathfinder.setGoal).not.toHaveBeenCalled();
    expect(newBot.pathfinder.setGoal).not.toHaveBeenCalled();
    expect(movement.bot).toBe(newBot);
  });
});
