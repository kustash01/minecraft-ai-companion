import { describe, expect, it } from 'vitest';
import { classifySocialMessage } from '../../../src/social/social-message-classifier.js';
import { socialResponsePolicy } from '../../../src/social/social-response-policy.js';
import { PersonalSocialState } from '../../../src/social/personal-social-state.js';
import { SocialGraph } from '../../../src/social/social-graph.js';
import { SocialRelationshipUpdater } from '../../../src/social/social-relationship-updater.js';

describe('Personality and social system contracts', () => {
  it('classifies into finite non-actionable output', () => {
    const result = classifySocialMessage('Привет, как дела?');
    expect(result).toEqual({ speechAct: 'greeting', domain: 'social', risk: 'low' });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('derives a deterministic profile policy without names or providers', () => {
    const input = { profile: { traits: { sociability: 0.9, talkativeness: 0.9 }, speechStyle: { messageLength: 'short' } }, messageClass: { category: 'question' } };
    expect(socialResponsePolicy(input)).toEqual(socialResponsePolicy(input));
    expect(socialResponsePolicy(input).timing).toBe('immediate');
  });

  it('isolates observations by active generation and returns a prompt disposition snapshot', () => {
    let generation = 3;
    const state = new PersonalSocialState({ getActiveGeneration: () => generation });
    state.beginGeneration(3);
    state.markBindingReady(3);
    expect(state.observe({ generation: 2, type: 'chat_seen', participantId: 'Max' })).toBe(false);
    expect(state.observe({ generation: 3, type: 'chat_seen', category: 'thanks', tone: 'warm', participantId: 'kustash01' })).toBe(true);
    expect(state.getPromptSnapshot()).toEqual({ disposition: { warmth: 'warm', irritation: 0, fear: 0, joy: 0.1, seen: 1, sent: 0 } });
    generation = 4;
    state.beginGeneration(4);
    expect(state.getDispositionSnapshot().seen).toBe(0);
  });

  it('accepts bounded provenance once and only mutates the directed edge', () => {
    const graph = new SocialGraph({ agents: ['Sam', 'Max'], humanPlayer: 'kustash01' });
    const updater = new SocialRelationshipUpdater({ socialGraph: graph, entities: ['Sam', 'Max', 'kustash01'] });
    const request = { observerId: 'Sam', senderId: 'Max', messageId: 'chat-1', category: 'thanks', generation: 1, observedAt: 1 };
    expect(updater.observeChat(request)).toBe(true);
    expect(updater.observeChat(request)).toBe(false);
    expect(graph.getRelationship('Sam', 'Max').friendship).toBeGreaterThan(0.3);
    expect(graph.getRelationship('Max', 'Sam').friendship).toBe(0.3);
    expect(graph.applyProvenancedDelta({ from: 'Sam', to: 'Max', changes: { trust: 0.3 }, provenance: { source: 'bad', eventId: 'x' } })).toBe(false);
  });
});
