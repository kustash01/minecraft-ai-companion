import { describe, it, expect, beforeEach } from 'vitest';
import { AIBrain } from '../../src/brain/ai-brain.js';
import { ToolRegistry } from '../../src/brain/tool-registry.js';
import { ContextManager } from '../../src/brain/context-manager.js';
import { registerAllTools } from '../../src/tools/index.js';
import { MockAIProvider } from '../mocks/mock-ai.js';

const testConfig = {
  bot: { owner: 'kustash01', language: 'ru' },
  minecraft: { username: 'GeminiBot' },
  ai: { provider: 'mock', model: 'mock', rateLimit: { maxRequests: 1000, windowMs: 1000 } },
};

// A mock bot with a heightmap-defined world (mountain to the north) and a village
// signature so both vision context and detection tools have real data to chew on.
function makeMockBot() {
  const pos = { x: 0, y: 64, z: 0 };
  const distanceTo = (p) => Math.hypot(p.x - pos.x, (p.y ?? 64) - pos.y, p.z - pos.z);
  const villageBlocks = {
    '10,64,-30': 'bell', '11,64,-31': 'composter', '12,64,-32': 'lectern', '13,64,-33': 'white_bed',
  };
  return {
    version: '1.20.4',
    entity: { position: { ...pos, distanceTo }, yaw: 0 }, // facing north
    entities: {},
    inventory: { slots: [], items: () => [] },
    pathfinder: { setGoal: () => {}, isMoving: () => false },
    blockAt: ({ x, y, z }) => {
      const key = `${x},${y},${z}`;
      if (villageBlocks[key]) return { name: villageBlocks[key], biome: { name: 'plains' } };
      const surface = z <= -12 ? 90 : 63; // mountain to the north
      if (y > surface) return { name: 'air', biome: { name: 'plains' } };
      return { name: y === surface ? 'grass_block' : 'stone', biome: { name: 'plains' } };
    },
    findBlocks: ({ matching, maxDistance = 64 }) => {
      const out = [];
      for (const key of Object.keys(villageBlocks)) {
        const [x, y, z] = key.split(',').map(Number);
        if (matching({ name: villageBlocks[key] }) && distanceTo({ x, y, z }) <= maxDistance) out.push({ x, y, z });
      }
      return out;
    },
  };
}

describe('End-to-end: vision context + new tools through the brain', () => {
  let brain, provider, registry, contextManager, bot, memory;

  beforeEach(() => {
    provider = new MockAIProvider();
    registry = new ToolRegistry();
    contextManager = new ContextManager(testConfig);
    bot = makeMockBot();
    memory = { pois: { _s: [], addPOI(n, t, c) { this._s.push({ name: n, type: t, ...c }); }, getPOIs(t) { return t ? this._s.filter(p => p.type === t) : this._s; } } };
    registerAllTools(registry, { bot, worldState: { getInventorySummary: () => 'пусто', getSummary: () => 'Test state' }, mcBot: { bot }, memoryManager: memory, planner: null, aiProvider: null });
    contextManager.setBot(bot); // give the brain "eyes"
    brain = new AIBrain(testConfig, registry, contextManager, provider);
  });

  it('injects a live [ЧТО Я ВИЖУ] scene into the context', () => {
    const ctx = contextManager.buildContext({ getSummary: () => 'Test state' }, null);
    expect(ctx).toContain('[ЧТО Я ВИЖУ]');
    expect(ctx).toMatch(/север/); // facing north
    expect(ctx).toMatch(/гора|холм/); // mountain to the north
  });

  it('runs look_around through the full tool-calling loop', async () => {
    provider.addResponse({ text: '', toolCalls: [{ name: 'look_around', args: {} }], raw: {} });
    provider.addResponse({ text: 'Вокруг вроде спокойно, на севере гора', toolCalls: [], raw: {} });

    const reply = await brain.processMessage('[kustash01]: осмотрись', {
      getSummary: () => 'Test state',
    });
    expect(reply).toContain('север');
    expect(provider.callLog.some(c => c.method === 'sendToolResults')).toBe(true);
  });

  it('finds and remembers a village via scan_for_village through the brain', async () => {
    provider.addResponse({ text: '', toolCalls: [{ name: 'scan_for_village', args: {} }], raw: {} });
    provider.addResponse({ text: 'Ага, вижу деревню на севере!', toolCalls: [], raw: {} });

    const reply = await brain.processMessage('[kustash01]: есть деревня рядом?', {
      getSummary: () => 'Test state',
    });
    expect(reply).toContain('деревню');
    // The tool should have persisted the village to memory.
    expect(memory.pois.getPOIs('village').length).toBe(1);
  });
});
