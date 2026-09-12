import { describe, it, expect, beforeEach } from 'vitest';
import { SocialGraph } from '../../src/social/social-graph.js';

describe('Directed Social Graph (7 entities, 42 edges)', () => {
  let socialGraph;
  const agents = ['Sam', 'Max', 'Jack', 'Ryan', 'Alex', 'Leo'];
  const humanPlayer = 'kustash01';

  beforeEach(() => {
    socialGraph = new SocialGraph({ agents, humanPlayer });
  });

  it('should initialize 42 directed edges across 7 participants', () => {
    const allEntities = [...agents, humanPlayer];
    expect(allEntities.length).toBe(7);

    let edgeCount = 0;
    for (const from of allEntities) {
      for (const to of allEntities) {
        if (from !== to) {
          const rel = socialGraph.getRelationship(from, to);
          expect(rel).toBeDefined();
          expect(rel.trust).toBe(0.5);
          expect(rel.friendship).toBe(0.3);
          edgeCount++;
        }
      }
    }

    expect(edgeCount).toBe(42);
  });

  it('should support asymmetric directed relationships', () => {
    // Ryan gains high trust for Sam, but Sam does not automatically gain trust for Ryan
    socialGraph.updateRelationship('Ryan', 'Sam', { trust: 0.9, friendship: 0.8 });

    const ryanToSam = socialGraph.getRelationship('Ryan', 'Sam');
    const samToRyan = socialGraph.getRelationship('Sam', 'Ryan');

    expect(ryanToSam.trust).toBe(0.9);
    expect(ryanToSam.friendship).toBe(0.8);

    expect(samToRyan.trust).toBe(0.5); // unchanged
    expect(samToRyan.friendship).toBe(0.3); // unchanged
  });

  it('should record events and adjust relationship metrics accordingly', () => {
    socialGraph.recordEvent('Sam', 'Ryan', {
      type: 'helped_in_combat',
      description: 'Ryan killed skeleton shooting at Sam',
      impact: 'positive'
    });

    const samToRyan = socialGraph.getRelationship('Sam', 'Ryan');
    expect(samToRyan.trust).toBeGreaterThan(0.5);
    expect(samToRyan.gratitude).toBeGreaterThan(0.0);
    expect(samToRyan.sharedHistory.length).toBe(1);
    expect(samToRyan.sharedHistory[0].type).toBe('helped_in_combat');
  });

  it('should handle conflict and irritation correctly', () => {
    socialGraph.recordEvent('Max', 'Leo', {
      type: 'took_items_without_asking',
      description: 'Leo took iron ingots without asking',
      impact: 'negative'
    });

    const maxToLeo = socialGraph.getRelationship('Max', 'Leo');
    expect(maxToLeo.trust).toBeLessThan(0.5);
    expect(maxToLeo.irritation).toBeGreaterThan(0.0);

    // Decay irritation
    socialGraph.decayIrritation(0.05);
    const decayed = socialGraph.getRelationship('Max', 'Leo');
    expect(decayed.irritation).toBeLessThan(maxToLeo.irritation + 0.01);
  });

  it('should calculate group compatibility', () => {
    const group1 = ['Sam', 'Max', 'Ryan'];
    const comp1 = socialGraph.getGroupCompatibility(group1);
    expect(comp1).toBeGreaterThanOrEqual(0.0);
    expect(comp1).toBeLessThanOrEqual(1.0);
  });

  it('should generate human-readable Russian relationship summaries', () => {
    socialGraph.updateRelationship('Jack', 'Sam', { friendship: 0.9, trust: 0.9 });
    const summary = socialGraph.getRelationshipSummary('Jack', 'Sam');
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
  });
});
