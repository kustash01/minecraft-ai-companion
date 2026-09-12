import { describe, expect, it, vi } from 'vitest';
import { AIBrain } from '../../../src/brain/ai-brain.js';

describe('AIBrain action admission', () => {
  it('does not execute a valid tool while the agent runtime owns an action', async () => {
    const toolRegistry = {
      getFunctionDeclarations: () => [],
      get: () => ({ name: 'wait', parameters: { type: 'object', properties: {} } }),
      execute: vi.fn(),
    };
    const provider = {
      createChat: vi.fn(async () => ({})),
      sendMessage: vi.fn(async () => ({ toolCalls: [{ id: '1', name: 'wait', args: {} }] })),
      sendToolResults: vi.fn(async (_session, results) => {
        expect(results[0].result.code).toBe('ACTION_UNAVAILABLE_PHASE1');
        return { text: 'I will wait.' };
      }),
    };
    const brain = new AIBrain(
      { ai: {} },
      toolRegistry,
      { buildContext: () => '', addToHistory: () => {} },
      provider,
      null,
      { actionAdmission: () => false }
    );

    await expect(brain.processMessage('wait', {})).resolves.toBe('I will wait.');
    expect(toolRegistry.execute).not.toHaveBeenCalled();
  });
});
