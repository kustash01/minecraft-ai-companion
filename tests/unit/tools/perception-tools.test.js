import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../../src/brain/tool-registry.js';
import { registerWorldTools } from '../../../src/tools/world.js';

function makeMockBot({ pos = { x: 0, y: 64, z: 0 }, yaw = 0, heightFn, topBlock, entities = {} } = {}) {
  const distanceTo = (p) => Math.hypot(p.x - pos.x, p.y - pos.y, p.z - pos.z);
  return {
    version: '1.20.4',
    entity: { position: { ...pos, distanceTo }, yaw },
    entities,
    blockAt: ({ x, y, z }) => {
      const surface = heightFn ? heightFn(x, z) : 63;
      if (y > surface) return { name: 'air', biome: { name: 'plains' } };
      const name = (y === surface && topBlock) ? topBlock(x, z, y) : (y === surface ? 'grass_block' : 'stone');
      return { name, biome: { name: 'plains' } };
    },
  };
}

describe('Perception world tools', () => {
  let registry;
  const setup = (bot) => {
    registry = new ToolRegistry();
    registerWorldTools(registry, { bot, worldState: {} });
  };

  it('look_around returns a scene description', async () => {
    setup(makeMockBot({ heightFn: (x, z) => (z <= -12 ? 90 : 63) }));
    const res = await registry.execute('look_around', {});
    expect(res.success).toBe(true);
    expect(res.data).toContain('Смотрю на');
    expect(res.scene).toBeTruthy();
  });

  it('describe_direction answers a Russian direction query', async () => {
    setup(makeMockBot({ heightFn: (x, z) => (z <= -12 ? 90 : 63) }));
    const res = await registry.execute('describe_direction', { direction: 'север' });
    expect(res.success).toBe(true);
    expect(res.data).toMatch(/гора|холм/);
  });

  it('describe_direction accepts compass codes', async () => {
    setup(makeMockBot({ heightFn: () => 63 }));
    const res = await registry.execute('describe_direction', { direction: 'E' });
    expect(res.success).toBe(true);
    expect(res.data).toContain('восток');
  });

  it('describe_direction rejects an unknown direction', async () => {
    setup(makeMockBot({ heightFn: () => 63 }));
    const res = await registry.execute('describe_direction', { direction: 'вверх' });
    expect(res.success).toBe(false);
  });

  it('bearing_to reports compass + relative side to a target', async () => {
    setup(makeMockBot({ yaw: 0 })); // facing north
    const res = await registry.execute('bearing_to', { x: 0, y: 64, z: -100 });
    expect(res.success).toBe(true);
    expect(res.data).toContain('север'); // -Z is north
    expect(res.data).toContain('впереди'); // and ahead when facing north
  });

  it('look_around fails gracefully before spawn', async () => {
    setup({ version: '1.20.4' });
    const res = await registry.execute('look_around', {});
    expect(res.success).toBe(false);
  });

  it('capture_screenshot degrades to symbolic vision when render stack is unavailable', async () => {
    // canvas / node-canvas-webgl are not installed in CI, so this exercises the
    // graceful fallback path rather than a real render.
    setup(makeMockBot({ heightFn: (x, z) => (z <= -12 ? 90 : 63) }));
    const res = await registry.execute('capture_screenshot', { question: 'что вдали?' });
    expect(res.success).toBe(true);
    expect(res.degraded).toBe(true);
    expect(res.data).toMatch(/символьному зрению|недоступен/);
  });

  it('capture_screenshot fails gracefully before spawn', async () => {
    setup({ version: '1.20.4' });
    const res = await registry.execute('capture_screenshot', {});
    expect(res.success).toBe(false);
  });
});
