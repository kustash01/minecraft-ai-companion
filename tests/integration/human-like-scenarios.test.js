import { describe, it, expect } from 'vitest';
import { ProjectManager, LongTermProjectManager } from '../../src/economy/project-manager.js';
import { TacticalCombatAI } from '../../src/combat/combat-ai.js';
import { MinecraftKnowledgeEngine } from '../../src/world/minecraft-knowledge.js';
import { DialogueManager } from '../../src/social/dialogue.js';
import { SessionManager } from '../../src/session/session-manager.js';
import { OfflineFallbackEngine } from '../../src/cognition/offline-fallback.js';
import { SkillSystem, SkillNames } from '../../src/behavior/player-simulation/skill-system.js';

describe('End-to-End Human-Like Scenarios A through H', () => {
  it('Scenario A: Collaborative building & missing material calculation', () => {
    const pm = new LongTermProjectManager();
    pm.createProject('cozy_base', 'Уютная база', 'medieval', { oak_planks: 64, cobblestone: 32 });

    const currentInventory = [{ name: 'oak_planks', count: 20 }, { name: 'cobblestone', count: 32 }];
    const missing = pm.calculateMissingMaterials('cozy_base', currentInventory);

    expect(missing.oak_planks).toBe(44);
    expect(missing.cobblestone).toBeUndefined();
  });

  it('Scenario B: Combat, Golem clearance & water blast negation verification', () => {
    const combat = new TacticalCombatAI();
    const know = new MinecraftKnowledgeEngine();

    const world = { nearbyBlocks: [{ x: 1, y: 65, z: 0 }] };
    const pillarCheck = combat.verifyPillarSafety({ x: 0, y: 64, z: 0 }, world);
    expect(pillarCheck.isSafe).toBe(false);

    const blastRule = know.getTopic('WATER_BLAST_NEGATION');
    expect(blastRule.rule).toContain('100%');
  });

  it('Scenario D: Contextual reference resolution for base and player position', () => {
    const dm = new DialogueManager();
    const mockMemory = { getPOI: () => ({ x: 100, y: 64, z: 200 }) };
    const resolved = dm.resolveReferences('Пойдём домой на нашу базу', {}, mockMemory);
    expect(resolved).toContain('координаты базы X:100 Y:64 Z:200');
  });

  it('Scenario F: Session restart and context reconstruction', () => {
    const sm = new SessionManager();
    const mockMemory = {
      getPOI: () => ({ x: 100, y: 64, z: 200 }),
      episodic: { getRecentEpisodes: () => [{ description: 'Построили склад' }] },
    };
    const ctx = sm.getReconstructedContext(mockMemory);
    expect(ctx).toContain('Мы на базе');
    expect(ctx).toContain('Построили склад');
  });

  it('Scenario G & H: Offline fallback transition and recovery', () => {
    const offline = new OfflineFallbackEngine();
    offline.setOfflineMode(true);

    const fallbackDecision = offline.getFallbackAction({ health: 8, timeOfDay: 6000 });
    expect(fallbackDecision.action).toBe('eat_food');

    offline.setOfflineMode(false);
    expect(offline.isOfflineMode).toBe(false);
  });
});
