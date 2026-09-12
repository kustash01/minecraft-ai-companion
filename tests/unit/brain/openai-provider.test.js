import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIProvider } from '../../../src/brain/openai-provider.js';
import { createAIProvider } from '../../../src/brain/provider-factory.js';

describe('OpenAIProvider & GPT-5.6 / Luna Support', () => {
  const mockConfig = {
    ai: {
      provider: 'openai',
      model: 'gpt-5.6-luna',
      openaiApiKey: 'test-openai-key',
      openaiBaseUrl: 'https://api.openai.com/v1',
    },
  };

  it('should be created via createAIProvider factory', () => {
    const provider = createAIProvider(mockConfig);
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider.name).toContain('gpt-5.6-luna');
  });

  it('should format tools and maintain chat session messages', async () => {
    const provider = new OpenAIProvider(mockConfig);

    const tools = [
      {
        name: 'mine_block',
        description: 'Mines a block',
        parameters: { type: 'object', properties: { blockName: { type: 'string' } } },
      },
    ];

    const session = await provider.createChat({
      systemPrompt: 'You are a companion.',
      tools,
    });

    expect(session.model).toBe('gpt-5.6-luna');
    expect(session.messages.length).toBe(1);
    expect(session.messages[0].role).toBe('system');
    expect(session.tools.length).toBe(1);
    expect(session.tools[0].type).toBe('function');
    expect(session.tools[0].function.name).toBe('mine_block');
  });

  it('should handle tool calling flow and return formatted response', async () => {
    const provider = new OpenAIProvider(mockConfig);

    const session = await provider.createChat({
      systemPrompt: 'System',
      tools: [],
    });

    // Mock global fetch
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Сейчас добуду дерево!',
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'mine_block',
                    arguments: '{"blockName":"oak_log"}',
                  },
                },
              ],
            },
          },
        ],
      }),
    });

    const response = await provider.sendMessage(session, 'Добудь дерево');
    expect(response.text).toBe('Сейчас добуду дерево!');
    expect(response.toolCalls.length).toBe(1);
    expect(response.toolCalls[0].name).toBe('mine_block');
    expect(response.toolCalls[0].args).toEqual({ blockName: 'oak_log' });

    // Mock second fetch for tool results
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Дерево успешно добыто!',
            },
          },
        ],
      }),
    });

    const toolResult = await provider.sendToolResults(session, [
      { name: 'mine_block', result: { success: true } },
    ]);

    expect(toolResult.text).toBe('Дерево успешно добыто!');
  });
});
