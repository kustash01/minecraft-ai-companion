import { describe, expect, it, vi } from 'vitest';
import { MovementController } from '../../../src/control/movement-controller.js';

function createBot() {
  const listeners = new Map();
  const bot = {
    on: vi.fn((event, listener) => {
      const current = listeners.get(event) || [];
      listeners.set(event, [...current, listener]);
      return bot;
    }),
    removeListener: vi.fn((event, listener) => {
      listeners.set(event, (listeners.get(event) || []).filter((entry) => entry !== listener));
      return bot;
    }),
    emit: (event, ...args) => {
      for (const listener of listeners.get(event) || []) listener(...args);
    },
    clearControlStates: vi.fn(),
    setControlState: vi.fn(),
    entity: {
      position: { x: 100, y: 64, z: 200, distanceTo: vi.fn(() => 2) },
      yaw: 0,
    },
    players: {
      kustash01: {
        entity: { position: { x: 102, y: 64, z: 200 }, yaw: 0 },
      },
    },
    pathfinder: {
      setGoal: vi.fn(),
      stop: vi.fn(),
      isMoving: vi.fn(() => false),
    },
  };
  return bot;
}

describe('MovementController bot rebind lifecycle', () => {
  it('removes listeners from the old bot before installing listeners on the new bot', () => {
    const oldBot = createBot();
    const newBot = createBot();
    const movement = new MovementController({ agentName: 'Sam', bot: oldBot });
    const oldPhysics = movement.physicsListener;
    const oldGoalReached = movement.goalReachedListener;

    movement.attachBot(newBot);

    expect(oldBot.removeListener).toHaveBeenCalledWith('physicsTick', oldPhysics);
    expect(oldBot.removeListener).toHaveBeenCalledWith('goal_reached', oldGoalReached);
    expect(newBot.removeListener).not.toHaveBeenCalled();
    expect(newBot.on).toHaveBeenCalledWith('physicsTick', movement.physicsListener);
    expect(newBot.on).toHaveBeenCalledWith('goal_reached', movement.goalReachedListener);
    expect(movement.bot).toBe(newBot);
  });

  it('invalidates a delayed follow continuation even when the same bot object is rebound', async () => {
    const bot = createBot();
    const movement = new MovementController({ agentName: 'Sam', bot });

    const pending = movement.followPlayer('kustash01', 3);
    movement.attachBot(bot);

    const result = await pending;

    expect(result).toMatchObject({ status: 'failed', code: 'FOLLOW_CANCELLED' });
    expect(bot.pathfinder.setGoal).not.toHaveBeenCalled();
    expect(movement.bot).toBe(bot);
  });

  it('does not let an older follow failure stop a newer command on the same bot', async () => {
    const bot = createBot();
    bot.players.Alex = { entity: { position: { x: 110, y: 64, z: 205 }, yaw: 0 } };
    const movement = new MovementController({ agentName: 'Sam', bot });

    const oldFollow = movement.followPlayer('kustash01', 3);
    const newFollow = movement.followPlayer('Alex', 3);
    const [oldResult, newResult] = await Promise.all([oldFollow, newFollow]);

    expect(oldResult).toMatchObject({ status: 'failed' });
    expect(newResult).toMatchObject({ status: 'completed' });
    expect(movement.mode).toBe('following');
    expect(movement.targetPlayer).toBe('Alex');
  });

  it('does not let an old goal_reached listener mutate state after rebind', () => {
    const oldBot = createBot();
    const newBot = createBot();
    const movement = new MovementController({ agentName: 'Sam', bot: oldBot });
    movement.mode = 'moving_to';
    movement.destination = { x: 1, y: 2, z: 3 };

    const staleGoalReached = movement.goalReachedListener;
    movement.attachBot(newBot);
    oldBot.emit('goal_reached');
    staleGoalReached();

    expect(movement.mode).toBe('moving_to');
    expect(movement.destination).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('does not install a delayed moveTo replan after a bot rebind', async () => {
    const oldBot = createBot();
    const newBot = createBot();
    const movement = new MovementController({ agentName: 'Sam', bot: oldBot });

    const pending = movement.moveTo(20, 70, 30);
    movement.attachBot(newBot);
    await pending;

    expect(oldBot.pathfinder.setGoal).not.toHaveBeenCalled();
    expect(newBot.pathfinder.setGoal).not.toHaveBeenCalled();
  });
});
