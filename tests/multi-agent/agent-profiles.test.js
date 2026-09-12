import { describe, it, expect } from 'vitest';
import { AGENT_PROFILES, getProfile, getAllProfileNames } from '../../src/agents/agent-profiles.js';

describe('Agent Profiles & Personalities', () => {
  it('should define all 6 agent profiles', () => {
    const names = getAllProfileNames();
    expect(names).toEqual(['Sam', 'Max', 'Jack', 'Ryan', 'Alex', 'Leo']);
    expect(names.length).toBe(6);
  });

  it('should have valid personality traits for all 6 agents', () => {
    const requiredTraits = [
      'initiative', 'caution', 'curiosity', 'exploration_bias',
      'building_bias', 'mining_bias', 'combat_bias', 'humor',
      'talkativeness', 'autonomy', 'risk_attitude', 'patience',
      'sociability', 'competitiveness', 'creativity', 'stubbornness',
      'empathy', 'impulsiveness'
    ];

    for (const name of getAllProfileNames()) {
      const profile = getProfile(name);
      expect(profile.name).toBe(name);
      expect(profile.traits).toBeDefined();

      for (const trait of requiredTraits) {
        expect(profile.traits[trait]).toBeDefined();
        expect(profile.traits[trait]).toBeGreaterThanOrEqual(0.0);
        expect(profile.traits[trait]).toBeLessThanOrEqual(1.0);
      }
    }
  });

  it('should have 14 skill biases for all agents', () => {
    const requiredSkills = [
      'mining', 'navigation', 'combat', 'archery', 'shield',
      'mlg_water', 'parkour', 'building', 'crafting', 'farming',
      'redstone', 'speed_bridging', 'resource_management', 'exploration'
    ];

    for (const name of getAllProfileNames()) {
      const profile = getProfile(name);
      expect(profile.skillBiases).toBeDefined();

      for (const skill of requiredSkills) {
        expect(profile.skillBiases[skill]).toBeDefined();
        expect(profile.skillBiases[skill]).toBeGreaterThanOrEqual(0.1);
        expect(profile.skillBiases[skill]).toBeLessThanOrEqual(1.0);
      }
    }
  });

  it('should have unique speech styles with slang, humor and phrases', () => {
    for (const name of getAllProfileNames()) {
      const profile = getProfile(name);
      const style = profile.speechStyle;

      expect(style).toBeDefined();
      expect(['short', 'medium', 'long']).toContain(style.messageLength);
      expect(style.slangFrequency).toBeGreaterThanOrEqual(0.0);
      expect(style.favoriteExpressions.length).toBeGreaterThan(0);
      expect(style.thinkingPhrases.length).toBeGreaterThan(0);
      expect(style.agreementPhrases.length).toBeGreaterThan(0);
      expect(style.disagreementPhrases.length).toBeGreaterThan(0);
    }
  });

  it('should have realistic AFK behavior configs', () => {
    for (const name of getAllProfileNames()) {
      const profile = getProfile(name);
      const afk = profile.afkBehavior;

      expect(afk).toBeDefined();
      expect(afk.frequency).toBeGreaterThanOrEqual(20);
      expect(afk.duration[0]).toBeGreaterThan(0);
      expect(afk.duration[1]).toBeGreaterThanOrEqual(afk.duration[0]);
      expect(afk.reasons.length).toBeGreaterThan(0);
    }
  });
});
