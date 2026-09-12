import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAICompatibleProvider } from '../../../src/brain/openai-compatible-provider.js';
import { createAIProvider } from '../../../src/brain/provider-factory.js';

describe('OpenAICompatibleProvider (Tooken Club & GPT-5.6-Luna)', () => {
  const mockConfig = {
    ai: {
      provider: 'openai_compatible',
      model: 'gpt-5.6-luna',
      openaiCompatibleApiKey: 'test-tooken-key-12345678',
      openaiCompatibleBaseUrl: 'https://tooken.club/v1/',
      maxRetries: 2,
      timeoutMs: 5000,
    },
  };

  it('should be created via createAIProvider factory with proper name and baseUrl', () => {
    const provider = createAIProvider(mockConfig);
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.baseUrl).toBe('https://tooken.club/v1');
    expect(provider.model).toBe('gpt-5.6-luna');
    expect(provider.name).toContain('OpenAI-Compatible');
  });

  it('should support checkHealth / listModels endpoint', async () => {
    const provider = new OpenAICompatibleProvider(mockConfig);

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: 'gpt-5.6-luna' }, { id: 'gpt-4o' }],
      }),
    });

    const res = await provider.listModels();
    expect(res.available).toBe(true);
    expect(res.models).toContain('gpt-5.6-luna');
    expect(res.hasCurrentModel).toBe(true);
  });

  it('should create chat session with system prompt and formatted tools', async () => {
    const provider = new OpenAICompatibleProvider(mockConfig);

    const tools = [
      {
        name: 'dig_block',
        description: 'Digs block at position',
        parameters: { type: 'object', properties: { x: { type: 'number' } } },
      },
    ];

    const session = await provider.createChat({
      systemPrompt: 'You are Sam, an explorer.',
      tools,
    });

    expect(session.model).toBe('gpt-5.6-luna');
    expect(session.messages.length).toBe(1);
    expect(session.messages[0].role).toBe('system');
    expect(session.messages[0].content).toBe('You are Sam, an explorer.');
    expect(session.tools.length).toBe(1);
    expect(session.tools[0].function.name).toBe('dig_block');
  });

  it('uses local Ollama endpoint and enriches Russian social context', async () => {
    const provider = new OpenAICompatibleProvider({ ai: { provider: 'ollama', model: 'qwen2.5:3b' } });
    expect(provider.baseUrl).toBe('http://127.0.0.1:11434/v1');
    const session = await provider.createChat({
      systemPrompt: 'Ты Лена.',
      personality: 'ироничная и заботливая',
      emotionalState: 'слегка устала',
      socialContext: 'друзья обсуждают ночёвку',
    });
    expect(session.messages[0].content).toContain('Говори по-русски естественно');
    expect(session.messages[0].content).toContain('ироничная и заботливая');
    expect(session.messages[0].content).toContain('друзья обсуждают ночёвку');
  });

  it('can return a silent fallback on Ollama timeout when enabled', async () => {
    const provider = new OpenAICompatibleProvider({ ai: { ...mockConfig.ai, fallbackOnTimeout: true, timeoutMs: 10 } });
    const session = await provider.createChat({});
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise((_, reject) => {
      const error = new Error('aborted'); error.name = 'AbortError';
      setTimeout(() => reject(error), 20);
    }));
    const result = await provider.sendMessage(session, 'Привет');
    expect(result).toMatchObject({ text: '', toolCalls: [], fallback: true });
  });

  it('should execute chat completion and parse multiple tool calls with IDs', async () => {
    const provider = new OpenAICompatibleProvider(mockConfig);
    const session = await provider.createChat({ systemPrompt: 'Sys', tools: [] });

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Иду и добываю дерево!',
              tool_calls: [
                {
                  id: 'call_move_001',
                  type: 'function',
                  function: {
                    name: 'move_to',
                    arguments: '{"x":100,"y":64,"z":200}',
                  },
                },
                {
                  id: 'call_mine_002',
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

    const result = await provider.sendMessage(session, 'Иди к (100, 64, 200) и добудь дерево');
    expect(result.text).toBe('Иду и добываю дерево!');
    expect(result.toolCalls.length).toBe(2);
    expect(result.toolCalls[0].name).toBe('move_to');
    expect(result.toolCalls[0].args).toEqual({ x: 100, y: 64, z: 200 });
    expect(result.toolCalls[1].name).toBe('mine_block');
    expect(result.toolCalls[1].args).toEqual({ blockName: 'oak_log' });

    // Now send tool results back
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Успешно пришёл и срубил дерево.',
            },
          },
        ],
      }),
    });

    const finalRes = await provider.sendToolResults(session, [
      { name: 'move_to', result: { success: true } },
      { name: 'mine_block', result: { success: true, count: 4 } },
    ]);

    expect(finalRes.text).toBe('Успешно пришёл и срубил дерево.');
    expect(finalRes.toolCalls.length).toBe(0);

    // Verify messages array has system, user, assistant, tool results, and final assistant message
    expect(session.messages.length).toBe(6);
    expect(session.messages[2].role).toBe('assistant');
    expect(session.messages[3].role).toBe('tool');
    expect(session.messages[3].tool_call_id).toBe('call_move_001');
    expect(session.messages[4].role).toBe('tool');
    expect(session.messages[4].tool_call_id).toBe('call_mine_002');
  });

  it('does not send Ollama-only options to other compatible endpoints', async () => {
    const provider = new OpenAICompatibleProvider(mockConfig);
    const session = await provider.createChat({});
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { role: 'assistant', content: 'ок' } }] }),
    });
    await provider.sendMessage(session, 'Привет');
    const payload = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(payload.options).toBeUndefined();
  });

  it('should fail fast on 429 and enter cooldown without retry load', async () => {
    const provider = new OpenAICompatibleProvider(mockConfig);
    const session = await provider.createChat({ systemPrompt: '', tools: [] });

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      };
    });

    await expect(provider.sendMessage(session, 'Привет')).rejects.toMatchObject({ httpStatus: 429, retryable: false });
    expect(callCount).toBe(1);
    await expect(provider.sendMessage(session, 'Ещё')).rejects.toThrow('cooldown');
    expect(callCount).toBe(1);
  });

  it('should fail fast without retry on 401 Unauthorized', async () => {
    const provider = new OpenAICompatibleProvider(mockConfig);
    const session = await provider.createChat({ systemPrompt: '', tools: [] });

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: false,
        status: 401,
        text: async () => 'Invalid API key',
      };
    });

    await expect(provider.sendMessage(session, 'Тест')).rejects.toThrow('401');
    expect(callCount).toBe(1); // No retries on 401
  });
});
