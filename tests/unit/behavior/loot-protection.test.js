import { describe, it, expect, vi } from 'vitest';
import vec3 from 'vec3';
import { LootProtectionManager } from '../../../src/behavior/loot-protection.js';

describe('LootProtectionManager (Team loyalty and selfless loot return)', () => {
  it('should record teammate death location', () => {
    const manager = new LootProtectionManager({});
    manager.recordTeammateDeath('kustash01', { x: 100, y: 12, z: -50 });

    expect(manager.deathRecord).not.toBeNull();
    expect(manager.deathRecord.playerUsername).toBe('kustash01');
    expect(manager.deathRecord.pos).toEqual(vec3(100, 12, -50));
  });

  it('should identify and gather dropped items near teammate death location', async () => {
    const mockBot = {
      entity: { position: vec3(100, 12, -50) },
      entities: {
        101: {
          id: 101,
          name: 'item',
          position: vec3(101, 12, -50), // 1 block away
        },
        102: {
          id: 102,
          name: 'item',
          position: vec3(105, 12, -50), // 5 blocks away (in death radius, but bot not close enough to auto-pickup)
        },
        103: {
          id: 103,
          name: 'zombie',
          position: vec3(100, 12, -50),
        },
      },
    };

    const manager = new LootProtectionManager(mockBot);
    manager.recordTeammateDeath('kustash01', { x: 100, y: 12, z: -50 });

    const gathered = await manager.gatherTeammateLoot();
    expect(gathered).toBe(1);
    expect(manager.protectedLootItemIds.has(101)).toBe(true);
  });

  it('should return all collected loot when the respawned teammate returns', async () => {
    const tossed = [];
    const mockBot = {
      quickBarSlot: 0,
      entity: { position: vec3(100, 12, -50) },
      players: {
        kustash01: {
          username: 'kustash01',
          entity: { position: vec3(101, 12, -50) }, // Teammate returned! (1m away)
        },
      },
      inventory: {
        items: () => [
          { name: 'diamond_sword', type: 276, count: 1, slot: 37 },
          { name: 'cooked_beef', type: 364, count: 32, slot: 38 },
          { name: 'shield', type: 442, count: 1, slot: 45 }, // Shield won't be tossed
        ],
      },
      toss: vi.fn(async (type, metadata, count) => {
        tossed.push({ type, count });
      }),
      lookAt: vi.fn(async () => {}),
    };

    const manager = new LootProtectionManager(mockBot);
    manager.recordTeammateDeath('kustash01', { x: 100, y: 12, z: -50 });

    const result = await manager.checkTeammateReturn();
    expect(result).not.toBeNull();
    expect(result.recipient).toBe('kustash01');
    expect(result.tossedCount).toBe(2); // sword + beef, keeping shield
    expect(tossed.length).toBe(2);
    expect(manager.deathRecord).toBeNull(); // Reset after successful return
  });

  it('should do nothing if teammate has not returned yet or is far away', async () => {
    const mockBot = {
      entity: { position: vec3(100, 12, -50) },
      players: {
        kustash01: {
          username: 'kustash01',
          entity: { position: vec3(0, 64, 0) }, // 100+ blocks away at spawn
        },
      },
    };

    const manager = new LootProtectionManager(mockBot);
    manager.recordTeammateDeath('kustash01', { x: 100, y: 12, z: -50 });

    const result = await manager.checkTeammateReturn();
    expect(result).toBeNull();
    expect(manager.deathRecord).not.toBeNull();
  });
});
