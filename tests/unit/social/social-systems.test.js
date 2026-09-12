import { describe, it, expect, beforeEach } from 'vitest';
import { MinecraftKnowledgeEngine } from '../../../src/world/minecraft-knowledge.js';
import { SignReaderEngine } from '../../../src/world/sign-reader.js';
import { PlayerRolesManager, PlayerRole, PermissionLevel } from '../../../src/social/roles.js';
import { SocialEngine } from '../../../src/social/social-engine.js';
import { DialogueManager, TalkMode } from '../../../src/social/dialogue.js';
import { SessionManager } from '../../../src/session/session-manager.js';

describe('MinecraftKnowledgeEngine', () => {
  let know;
  beforeEach(() => {
    know = new MinecraftKnowledgeEngine();
  });

  it('should provide Golem 3-block pillar clearance rule', () => {
    const topic = know.getTopic('GOLEM_PILLAR_CLEARANCE');
    expect(topic).toBeDefined();
    expect(topic.height).toBe(3);
    expect(topic.rule).toContain('возвышение');
  });

  it('should search knowledge for water blast negation', () => {
    const res = know.searchKnowledge('взрыв');
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].rule).toContain('100%');
  });
});

describe('SignReaderEngine', () => {
  let reader;
  beforeEach(() => {
    reader = new SignReaderEngine();
  });

  it('should store and find signs by query', () => {
    reader.knownSigns.set('10,64,20', {
      position: { x: 10, y: 64, z: 20 },
      lines: ['Склад', 'Железо'],
      text: 'Склад Железо',
    });

    const found = reader.findSignByQuery('железо');
    expect(found).not.toBeNull();
    expect(found.position.x).toBe(10);
  });
});

describe('PlayerRolesManager', () => {
  let roles;
  beforeEach(() => {
    roles = new PlayerRolesManager('kustash01');
  });

  it('should grant owner full critical permissions', () => {
    expect(roles.getPlayerRole('kustash01')).toBe(PlayerRole.OWNER);
    expect(roles.hasPermission('kustash01', PermissionLevel.CRITICAL)).toBe(true);
  });

  it('should restrict unknown players from critical commands', () => {
    expect(roles.hasPermission('stranger', PermissionLevel.CRITICAL)).toBe(false);
  });
});

describe('SocialEngine', () => {
  let social;
  beforeEach(() => {
    social = new SocialEngine();
  });

  it('should handle item reservations', () => {
    social.reserveItem('iron_ingot', 32, 'armor', 'kustash01');
    expect(social.getReservedCount('iron_ingot')).toBe(32);

    social.releaseReservation('iron_ingot', 10);
    expect(social.getReservedCount('iron_ingot')).toBe(22);
  });
});

describe('DialogueManager', () => {
  let dm;
  beforeEach(() => {
    dm = new DialogueManager();
  });

  it('should resolve base references using coordinates', () => {
    const memoryMock = {
      getPOI: (k) => k === 'base' ? { x: 100, y: 64, z: 200 } : null,
    };
    const resolved = dm.resolveReferences('Пойдём на нашу базу', {}, memoryMock);
    expect(resolved).toContain('координаты базы X:100 Y:64 Z:200');
  });
});

describe('SessionManager', () => {
  it('should reconstruct context on startup', () => {
    const sm = new SessionManager();
    const memoryMock = {
      getPOI: () => ({ x: 50, y: 70, z: 150 }),
      episodic: { getRecentEpisodes: () => [{ description: 'Нашли алмазы' }] },
    };
    const ctx = sm.getReconstructedContext(memoryMock);
    expect(ctx).toContain('Мы на базе');
    expect(ctx).toContain('Нашли алмазы');
  });
});
