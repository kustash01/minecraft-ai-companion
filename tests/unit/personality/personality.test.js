import { describe, it, expect, beforeEach } from 'vitest';
import { FriendshipSystem } from '../../../src/personality/friendship.js';
import { MemoryManager } from '../../../src/memory/memory-manager.js';
import { EmotionalStateEngine } from '../../../src/personality/emotional-state.js';

describe('Personality & Friendship System', () => {
  let friendship;
  let memoryManager;

  beforeEach(() => {
    memoryManager = new MemoryManager(':memory:');
    friendship = new FriendshipSystem(memoryManager, 'kustash01');
  });

  it('should initialize with default trust level', () => {
    expect(friendship.trustLevel).toBe(50);
  });

  it('should increase trust and track activities', () => {
    friendship.recordActivity('mining');
    friendship.recordActivity('mining');
    friendship.recordActivity('building');

    expect(friendship.trustLevel).toBe(53);
    expect(friendship.activityCounts.mining).toBe(2);
    expect(friendship.activityCounts.building).toBe(1);
    expect(friendship.getFavoriteActivity()).toBe('mining');
  });

  it('should persist and restore friendship data in memory', () => {
    friendship.recordActivity('combat');
    friendship.recordActivity('combat');

    // Create a new friendship instance sharing same memory
    const newFriendship = new FriendshipSystem(memoryManager, 'kustash01');
    newFriendship.load();

    expect(newFriendship.trustLevel).toBe(52);
    expect(newFriendship.activityCounts.combat).toBe(2);
  });
});

describe('Emotional social dynamics', () => {
  it('responds to support and conflict, then drifts back toward baseline', () => {
    const state = new EmotionalStateEngine();
    const baseline = state.getMood();
    state.onSocialInteraction('support', 1);
    expect(state.getMood().trust).toBeGreaterThan(baseline.trust);
    state.onSocialInteraction('conflict', 1);
    expect(state.getMood().frustration).toBeGreaterThan(0);
    for (let i = 0; i < 80; i++) state.tickDecay();
    expect(state.getMood().frustration).toBeLessThan(0.1);
    expect(state.getMood().trust).toBeCloseTo(baseline.trust, 1);
  });
});
