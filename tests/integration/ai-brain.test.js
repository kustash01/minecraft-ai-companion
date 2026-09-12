import { describe, it, expect, beforeEach } from 'vitest';
import { AIBrain } from '../../src/brain/ai-brain.js';
import { ToolRegistry } from '../../src/brain/tool-registry.js';
import { ContextManager } from '../../src/brain/context-manager.js';
import { MockAIProvider } from '../mocks/mock-ai.js';

const testConfig = {
  bot: { owner: 'kustash01', language: 'ru' },
  minecraft: { username: 'GeminiBot' },
  ai: { provider: 'mock', model: 'mock', rateLimit: { maxRequests: 1000, windowMs: 1000 } },
};

const mockWorldState = {
  position: { x: 100, y: 64, z: 200 },
  health: 20,
  food: 20,
  getSummary() { return 'Test world state'; },
};

describe('AIBrain Integration', () => {
  let brain;
  let provider;
  let registry;

  beforeEach(() => {
    provider = new MockAIProvider();
    registry = new ToolRegistry();
    const contextManager = new ContextManager(testConfig);
    brain = new AIBrain(testConfig, registry, contextManager, provider);
  });

  it('should process simple text message', async () => {
    provider.addResponse({ text: 'Привет, kustash01!', toolCalls: [], raw: {} });
    const result = await brain.processMessage('Привет', mockWorldState);
    expect(result).toBe('Привет, kustash01!');
  });

  it('should execute tool calls', async () => {
    // First response: tool call
    provider.addResponse({
      text: '',
      toolCalls: [{ name: 'get_position', args: {} }],
      raw: {},
    });
    // Second response: text after tool result
    provider.addResponse({
      text: 'Ты на координатах 100, 64, 200',
      toolCalls: [],
      raw: {},
    });

    registry.register({
      name: 'get_position',
      description: 'Get bot position',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({ success: true, data: { x: 100, y: 64, z: 200 } }),
    });

    const result = await brain.processMessage('Где ты?', mockWorldState);
    expect(result).toBe('Ты на координатах 100, 64, 200');
    // Verify tool results were sent back
    expect(provider.callLog.some(c => c.method === 'sendToolResults')).toBe(true);
  });

  it('should handle tool execution error gracefully', async () => {
    provider.addResponse({
      text: '',
      toolCalls: [{ name: 'broken_tool', args: {} }],
      raw: {},
    });
    provider.addResponse({
      text: 'Инструмент не сработал, попробую по-другому',
      toolCalls: [],
      raw: {},
    });

    registry.register({
      name: 'broken_tool',
      description: 'A broken tool',
      parameters: { type: 'object', properties: {} },
      handler: async () => { throw new Error('Tool is broken'); },
    });

    const result = await brain.processMessage('test', mockWorldState);
    expect(result).toContain('по-другому');
  });

  it('should prevent concurrent processing', async () => {
    provider.addResponse({ text: 'OK', toolCalls: [], raw: {} });

    // Start processing
    const p1 = brain.processMessage('msg1', mockWorldState);
    // Try to process another message while first is running
    const p2 = brain.processMessage('msg2', mockWorldState);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r2.toLowerCase()).toContain('подожд');
  });

  it('should stop processing after max iterations', async () => {
    // Keep returning tool calls
    for (let i = 0; i < 15; i++) {
      provider.addResponse({
        text: '',
        toolCalls: [{ name: 'test', args: {} }],
        raw: {},
      });
    }

    registry.register({
      name: 'test',
      description: 'Test',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({ success: true }),
    });

    const result = await brain.processMessage('loop', mockWorldState);
    expect(result).toContain('слишком много');
  });

  it('should execute tool calls from AI and return text reply', async () => {
    let mined = false;
    registry.register({
      name: 'mine_block',
      description: 'Mines block',
      parameters: { type: 'object', properties: { blockName: { type: 'string' } } },
      handler: async (args) => {
        mined = true;
        return { success: true };
      },
    });

    // AI decides to call mine_block via function calling
    provider.addResponse({
      text: '',
      toolCalls: [{ name: 'mine_block', args: { blockName: 'oak_log', count: 3 } }],
      raw: {},
    });
    // AI responds after tool result
    provider.addResponse({
      text: 'Рублю дуб, сейчас будет!',
      toolCalls: [],
      raw: {},
    });

    const result = await brain.processMessage('[kustash01]: добудь дерево', mockWorldState);
    expect(mined).toBe(true);
    expect(result).toBe('Рублю дуб, сейчас будет!');
  });

  it('should pass through text reply without filtering when no tool calls', async () => {
    provider.addResponse({
      text: 'Привет! Как дела в шахте?',
      toolCalls: [],
      raw: {},
    });

    const result = await brain.processMessage('[kustash01]: привет', mockWorldState);
    expect(result).toBe('Привет! Как дела в шахте?');
  });

  it('returns empty string (silence) when AI returns empty text — no template filler', async () => {
    provider.addResponse({
      text: '',
      toolCalls: [],
      raw: {},
    });

    const result = await brain.processMessage('[kustash01]: иди за мной', mockWorldState);
    // Empty AI output is no longer masked by a hardcoded 'Понял!'. Silence is
    // more human than a canned acknowledgement; the caller decides what to do.
    expect(result).toBe('');
  });
});
