import { describe, expect, it } from 'vitest';
import { ConversationRouter } from '../../../src/social/conversation-router.js';

describe('ConversationRouter', () => {
  const router = new ConversationRouter({ agentNames: ['Sam', 'Max', 'Leo'], maxPublicResponders: 2 });

  it('routes explicit group addressing to every participant', () => {
    const result = router.route({ messageId: 'chat:1', sender: 'kustash01', content: 'Ребята, как вам это место?' }, { agentName: 'Sam' });
    expect(result.kind).toBe('group');
    expect(result.recipientIds).toEqual(['Sam', 'Max', 'Leo']);
  });

  it('selects a bounded set of listeners for unaddressed public speech', () => {
    const result = router.route({ messageId: 'chat:2', sender: 'kustash01', content: 'Как вам это место?' }, { agentName: 'Sam' });
    expect(result.kind).toBe('public');
    expect(result.recipientIds.length).toBeLessThanOrEqual(2);
    expect(result.recipientIds.length).toBeGreaterThan(0);
  });

  it('routes a named message directly', () => {
    expect(router.route({ content: 'Макс, ты где?' }, { agentName: 'Max' })).toMatchObject({ kind: 'direct', recipientIds: ['Max'] });
  });

  it('is deterministic for the same message', () => {
    const message = { messageId: 'chat:42', sender: 'player', content: 'Смотрите, там деревня' };
    expect(router.route(message, { agentName: 'Sam' })).toEqual(router.route(message, { agentName: 'Sam' }));
  });
});
