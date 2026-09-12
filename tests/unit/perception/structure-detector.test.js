import { describe, it, expect } from 'vitest';
import { StructureDetector } from '../../../src/perception/structure-detector.js';

/**
 * Mock bot whose findBlocks returns a fixed set of signature blocks.
 * blocks: array of { x,y,z, name }. entities: villager-like list.
 */
function makeMockBot({ pos = { x: 0, y: 64, z: 0 }, blocks = [], entities = {} } = {}) {
  const distanceTo = (p) => Math.hypot(p.x - pos.x, p.y - pos.y, p.z - pos.z);
  const byKey = new Map(blocks.map(b => [`${b.x},${b.y},${b.z}`, b]));
  return {
    version: '1.20.4',
    entity: { position: { ...pos, distanceTo } },
    entities,
    findBlocks: ({ matching, maxDistance = 64 }) => {
      return blocks
        .filter(b => matching({ name: b.name }))
        .filter(b => distanceTo(b) <= maxDistance)
        .map(b => ({ x: b.x, y: b.y, z: b.z }));
    },
    blockAt: ({ x, y, z }) => byKey.get(`${x},${y},${z}`) || null,
  };
}

describe('StructureDetector - village', () => {
  it('detects a village from a bell + workstations cluster', () => {
    const blocks = [
      { x: 20, y: 64, z: 20, name: 'bell' },
      { x: 21, y: 64, z: 20, name: 'composter' },
      { x: 22, y: 64, z: 21, name: 'lectern' },
      { x: 23, y: 64, z: 22, name: 'white_bed' },
      { x: 24, y: 64, z: 22, name: 'hay_block' },
    ];
    const det = new StructureDetector().detectVillage(makeMockBot({ blocks }));
    expect(det).not.toBeNull();
    expect(det.type).toBe('village');
    expect(det.blockCount).toBeGreaterThanOrEqual(4);
    expect(det.confidence).toBeGreaterThan(0.4);
  });

  it('detects a village from villager entities even with few blocks', () => {
    const entities = {
      1: { name: 'villager', position: { x: 30, y: 64, z: 0 } },
      2: { name: 'villager', position: { x: 31, y: 64, z: 1 } },
      3: { name: 'iron_golem', position: { x: 29, y: 64, z: 2 } },
    };
    const det = new StructureDetector().detectVillage(makeMockBot({ entities }));
    expect(det).not.toBeNull();
    expect(det.villagerCount).toBeGreaterThanOrEqual(2);
  });

  it('reports compass direction and distance to the village', () => {
    // Village to the north (-Z)
    const blocks = [
      { x: 0, y: 64, z: -40, name: 'bell' },
      { x: 1, y: 64, z: -41, name: 'composter' },
      { x: 2, y: 64, z: -42, name: 'blue_bed' },
    ];
    const det = new StructureDetector().detectVillage(makeMockBot({ blocks }));
    expect(det.direction.ru).toBe('север');
    expect(det.distance).toBeGreaterThan(35);
  });

  it('does NOT flag a lone crafting table / barrel as a village', () => {
    const blocks = [
      { x: 5, y: 64, z: 5, name: 'barrel' },
    ];
    const det = new StructureDetector().detectVillage(makeMockBot({ blocks }));
    expect(det).toBeNull();
  });

  it('does NOT flag a small home base (few beds, no bell/villagers)', () => {
    const blocks = [
      { x: 5, y: 64, z: 5, name: 'white_bed' },
      { x: 6, y: 64, z: 5, name: 'barrel' },
    ];
    const det = new StructureDetector().detectVillage(makeMockBot({ blocks }));
    expect(det).toBeNull();
  });

  it('returns null when nothing is around', () => {
    expect(new StructureDetector().detectVillage(makeMockBot({}))).toBeNull();
  });

  it('describeVillage produces a human phrase', () => {
    const blocks = [
      { x: 0, y: 64, z: -40, name: 'bell' },
      { x: 1, y: 64, z: -41, name: 'composter' },
      { x: 2, y: 64, z: -42, name: 'lectern' },
    ];
    const det = new StructureDetector().detectVillage(makeMockBot({ blocks }));
    const text = new StructureDetector().describeVillage(det);
    expect(text).toContain('деревня');
    expect(text).toContain('север');
  });
});
