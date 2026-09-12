import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InitiativeController } from '../../../src/personality/initiative.js';

/**
 * Idle-activity behaviour: when everything is calm and the owner is not close,
 * the bot may do ONE short, safe task (grab nearby loot, quietly note a
 * village). It must never do this while busy, in danger, or waiting.
 */
function makeBot(overrides = {}) {
  return {
    username: 'Sam',
    entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 100 } },
    entities: {},
    health: 20,
    food: 20,
    players: {},
    pathfinder: { isMoving: () => false, setGoal: vi.fn() },
    inventory: { items: () => [] },
    ...overrides,
  };
}

function makeMemory() {
  const store = [];
  return {
    pois: {
      addPOI: (name, type, { x, y, z }, notes) => { store.push({ name, type, x, y, z, notes }); },
      getPOIs: (type = null) => type ? store.filter(p => p.type === type) : store.slice(),
    },
    _store: store,
  };
}

describe('InitiativeController idle activity', () => {
  let memory;
  const makeController = (bot) => new InitiativeController({
    bot,
    memoryManager: memory,
    config: { bot: { owner: 'kustash01', initiative: 'balanced' }, minecraft: { username: 'Sam' } },
    movementController: null,
  });

  beforeEach(() => { memory = makeMemory(); });

  it('picks up nearby dropped loot when idle and safe', async () => {
    const bot = makeBot({
      entities: { 1: { name: 'item', position: { x: 2, y: 64, z: 0 }, isValid: true } },
      entity: { position: { x: 0, y: 64, z: 0, distanceTo: (p) => Math.hypot(p.x, p.y - 64, p.z) } },
    });
    const c = makeController(bot);
    await c.evaluateSituation();
    expect(bot.pathfinder.setGoal).toHaveBeenCalled();
  });

  it('quietly remembers a nearby village when idle', async () => {
    // No loot; a village signature within range.
    const bot = makeBot({
      entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 100 } },
      findBlocks: ({ matching, maxDistance = 64 }) => {
        const blocks = [
          { x: 0, y: 64, z: -30, name: 'bell' },
          { x: 1, y: 64, z: -31, name: 'composter' },
          { x: 2, y: 64, z: -32, name: 'lectern' },
          { x: 3, y: 64, z: -33, name: 'white_bed' },
        ];
        return blocks.filter(b => matching({ name: b.name })).map(b => ({ x: b.x, y: b.y, z: b.z }));
      },
      blockAt: ({ x, y, z }) => {
        const map = { '0,64,-30': 'bell', '1,64,-31': 'composter', '2,64,-32': 'lectern', '3,64,-33': 'white_bed' };
        const n = map[`${x},${y},${z}`];
        return n ? { name: n } : null;
      },
      version: '1.20.4',
    });
    const c = makeController(bot);
    await c.evaluateSituation();
    expect(memory._store.some(p => p.type === 'village')).toBe(true);
  });

  it('does NOT do idle activity when owner is close', async () => {
    const bot = makeBot({
      players: { kustash01: { username: 'kustash01', entity: { position: { x: 3, y: 64, z: 0 } } } },
      entity: { position: { x: 0, y: 64, z: 0, distanceTo: (p) => Math.hypot(p.x, (p.y||64) - 64, p.z) } },
      entities: { 1: { name: 'item', position: { x: 2, y: 64, z: 0 }, isValid: true } },
    });
    const c = makeController(bot);
    await c.evaluateSituation();
    // Owner is 3 blocks away -> ownerClose -> no idle loot pickup.
    expect(bot.pathfinder.setGoal).not.toHaveBeenCalled();
  });

  it('respects the idle cooldown (no repeat within cooldown)', async () => {
    const bot = makeBot({
      entities: { 1: { name: 'item', position: { x: 2, y: 64, z: 0 }, isValid: true } },
      entity: { position: { x: 0, y: 64, z: 0, distanceTo: (p) => Math.hypot(p.x, p.y - 64, p.z) } },
    });
    const c = makeController(bot);
    await c.evaluateSituation();
    bot.pathfinder.setGoal.mockClear();
    await c.evaluateSituation(); // immediately again -> cooldown blocks it
    expect(bot.pathfinder.setGoal).not.toHaveBeenCalled();
  });
});
