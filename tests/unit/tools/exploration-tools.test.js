import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../../src/brain/tool-registry.js';
import { registerExplorationTools } from '../../../src/tools/exploration.js';
import { POITypes } from '../../../src/memory/poi-manager.js';

function makeMockBot({ pos = { x: 0, y: 64, z: 0 }, blocks = [], entities = {} } = {}) {
  const distanceTo = (p) => Math.hypot(p.x - pos.x, p.y - pos.y, p.z - pos.z);
  const byKey = new Map(blocks.map(b => [`${b.x},${b.y},${b.z}`, b]));
  return {
    version: '1.20.4',
    entity: { position: { ...pos, distanceTo } },
    entities,
    findBlocks: ({ matching, maxDistance = 64 }) =>
      blocks.filter(b => matching({ name: b.name })).filter(b => distanceTo(b) <= maxDistance)
        .map(b => ({ x: b.x, y: b.y, z: b.z })),
    blockAt: ({ x, y, z }) => byKey.get(`${x},${y},${z}`) || null,
  };
}

// Minimal in-memory POI store matching the POIManager interface the tools use.
function makeMockMemory() {
  const store = [];
  return {
    pois: {
      addPOI: (name, type, { x, y, z }, notes = '') => {
        const rec = { name, type, x, y, z, notes };
        store.push(rec);
        return rec;
      },
      getPOIs: (type = null) => type ? store.filter(p => p.type === type) : store.slice(),
    },
    _store: store,
  };
}

describe('Exploration tools', () => {
  const villageBlocks = [
    { x: 0, y: 64, z: -40, name: 'bell' },
    { x: 1, y: 64, z: -41, name: 'composter' },
    { x: 2, y: 64, z: -42, name: 'lectern' },
    { x: 3, y: 64, z: -43, name: 'white_bed' },
  ];

  it('scan_for_village finds and remembers a village', async () => {
    const registry = new ToolRegistry();
    const memoryManager = makeMockMemory();
    registerExplorationTools(registry, { bot: makeMockBot({ blocks: villageBlocks }), memoryManager });

    const res = await registry.execute('scan_for_village', {});
    expect(res.success).toBe(true);
    expect(res.data).toContain('деревня');
    expect(res.data).toContain('запомнил');
    expect(memoryManager._store.filter(p => p.type === POITypes.VILLAGE)).toHaveLength(1);
  });

  it('scan_for_village does not save a duplicate for the same spot', async () => {
    const registry = new ToolRegistry();
    const memoryManager = makeMockMemory();
    const bot = makeMockBot({ blocks: villageBlocks });
    registerExplorationTools(registry, { bot, memoryManager });

    await registry.execute('scan_for_village', {});
    await registry.execute('scan_for_village', {});
    expect(memoryManager._store.filter(p => p.type === POITypes.VILLAGE)).toHaveLength(1);
  });

  it('scan_for_village reports nothing found on empty terrain', async () => {
    const registry = new ToolRegistry();
    registerExplorationTools(registry, { bot: makeMockBot({}), memoryManager: makeMockMemory() });
    const res = await registry.execute('scan_for_village', {});
    expect(res.success).toBe(true);
    expect(res.data).toContain('не вижу');
  });

  it('remember_place saves current position with a name', async () => {
    const registry = new ToolRegistry();
    const memoryManager = makeMockMemory();
    registerExplorationTools(registry, { bot: makeMockBot({ pos: { x: 10, y: 70, z: -5 } }), memoryManager });

    const res = await registry.execute('remember_place', { name: 'дом', type: 'base' });
    expect(res.success).toBe(true);
    expect(memoryManager._store).toHaveLength(1);
    expect(memoryManager._store[0].name).toBe('дом');
    expect(memoryManager._store[0].x).toBe(10);
  });

  it('list_known_places recalls saved villages', async () => {
    const registry = new ToolRegistry();
    const memoryManager = makeMockMemory();
    registerExplorationTools(registry, { bot: makeMockBot({ blocks: villageBlocks }), memoryManager });

    await registry.execute('scan_for_village', {});
    const res = await registry.execute('list_known_places', { type: 'village' });
    expect(res.success).toBe(true);
    expect(res.data).toContain('Деревня');
  });

  it('scout_direction rejects an unknown direction', async () => {
    const registry = new ToolRegistry();
    const bot = makeMockBot({});
    bot.pathfinder = { setGoal: () => {}, isMoving: () => false };
    registerExplorationTools(registry, { bot, memoryManager: makeMockMemory() });
    const res = await registry.execute('scout_direction', { direction: 'вверх' });
    expect(res.success).toBe(false);
  });

  it('scout_direction returns early when a village is already close', async () => {
    const registry = new ToolRegistry();
    const memoryManager = makeMockMemory();
    // Village ~40 blocks north, already within the pre-scan range.
    const blocks = [
      { x: 0, y: 64, z: -40, name: 'bell' },
      { x: 1, y: 64, z: -41, name: 'composter' },
      { x: 2, y: 64, z: -42, name: 'lectern' },
      { x: 3, y: 64, z: -43, name: 'white_bed' },
    ];
    const bot = makeMockBot({ blocks });
    bot.pathfinder = { setGoal: () => {}, isMoving: () => false, goal: null };
    registerExplorationTools(registry, { bot, memoryManager });

    const res = await registry.execute('scout_direction', { direction: 'север' });
    expect(res.success).toBe(true);
    expect(res.data).toContain('деревня');
    expect(memoryManager._store.filter(p => p.type === POITypes.VILLAGE)).toHaveLength(1);
  });

  it('scout_direction fails gracefully without pathfinder', async () => {
    const registry = new ToolRegistry();
    registerExplorationTools(registry, { bot: makeMockBot({}), memoryManager: makeMockMemory() });
    const res = await registry.execute('scout_direction', { direction: 'N' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('Pathfinder');
  });
});
