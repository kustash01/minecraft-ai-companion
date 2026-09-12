import { describe, expect, it, vi } from 'vitest';
import { ConversationEngine } from '../../../src/social/conversation-engine.js';
import { GroupConversationWindow } from '../../../src/social/group-conversation-window.js';
import { SocialConversationMemory } from '../../../src/social/social-conversation-memory.js';

const message = { messageId: 'player:1:привет', sender: 'player', content: 'Привет, Sam' };

function setup(overrides = {}) {
  const provider = overrides.provider || {
    createChat: vi.fn(async () => ({ id: 'session' })),
    sendMessage: vi.fn(async () => ({ text: 'Привет! Рад поговорить.', toolCalls: [{ name: 'move', args: {} }] })),
  };
  const sendChat = overrides.sendChat || vi.fn(async () => true);
  const reserve = overrides.reserve || vi.fn(() => true);
  const release = overrides.release || vi.fn();
  const finalize = overrides.finalize || vi.fn();
  const budgetManager = overrides.budgetManager || { requestSlot: vi.fn(async () => true), releaseSlot: vi.fn() };
  const groupWindow = overrides.groupWindow || new GroupConversationWindow();
  const conversationMemory = overrides.conversationMemory || new SocialConversationMemory({ getActiveGeneration: () => 1 });
  return {
    engine: new ConversationEngine({
      agentName: 'Sam',
      profile: { traits: { talkativeness: 1, sociability: 1, curiosity: 1 }, speechStyle: { messageLength: 'short' } },
      provider, sendChat, budgetManager, groupWindow, groupParticipants: ['Sam', 'Max', 'Jack'], conversationMemory,
    }),
    provider, sendChat, reserve, release, finalize, budgetManager, groupWindow, conversationMemory,
  };
}

describe('ConversationEngine', () => {
  it('fences an invalidated generation and releases its group claim without scheduling a retry', async () => {
    let resolveResponse;
    const provider = {
      createChat: vi.fn(async () => ({})),
      sendMessage: vi.fn(() => new Promise((resolve) => { resolveResponse = resolve; })),
    };
    const { engine, groupWindow, sendChat } = setup({ provider });
    engine.bindGeneration(7);
    const pending = engine.handle({ ...message, messageId: 'group:sent' }, { kind: 'group', generation: 7 });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    engine.invalidateGeneration(7);
    resolveResponse({ text: 'Старый ответ', toolCalls: [] });
    await expect(pending).resolves.toBe(false);
    expect(sendChat).not.toHaveBeenCalled();
    expect(engine.pendingDelayed.size).toBe(0);
    expect(groupWindow.get('group:sent')?.attempts.get('immediate:Sam')?.status).toBe('released');
  });

  it('uses a fresh tool-free Russian session and discards tool calls', async () => {
    const { engine, provider, sendChat } = setup();
    await expect(engine.handle(message, { kind: 'direct', generation: 1 })).resolves.toBe(false);
    expect(provider.createChat).toHaveBeenCalledWith(expect.objectContaining({ tools: [] }));
    expect(provider.sendMessage).toHaveBeenCalledWith(expect.anything(), 'player: Привет, Sam', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(sendChat).not.toHaveBeenCalled();
    expect(engine.conversationMemory.entries).toHaveLength(1);
  });

  it('does not record history when sending fails or the model chooses silence', async () => {
    const failed = setup({ sendChat: vi.fn(async () => false) });
    await expect(failed.engine.handle(message, { kind: 'direct', generation: 1 })).resolves.toBe(false);
    expect(failed.conversationMemory.entries).toHaveLength(1);
    const silent = setup({ provider: { createChat: vi.fn(async () => ({})), sendMessage: vi.fn(async () => ({ text: 'SILENCE' })) } });
    await expect(silent.engine.handle(message, { kind: 'direct', generation: 1 })).resolves.toBe(false);
    expect(silent.sendChat).not.toHaveBeenCalled();
  });

  it('uses bounded untrusted context and records an outbound reply only after its social send succeeds', async () => {
    const conversationMemory = new SocialConversationMemory({ getActiveGeneration: () => 1 });
    for (let index = 0; index < 8; index += 1) {
      conversationMemory.recordSeenChat({ envelope: { messageId: `old:${index}`, sender: 'player', content: `старый контекст ${index}` }, generation: 1 });
    }
    const { engine, provider, sendChat } = setup({
      conversationMemory,
      provider: { createChat: vi.fn(async () => ({})), sendMessage: vi.fn(async () => ({ text: 'Помню.', toolCalls: [] })) },
    });

    await expect(engine.handle(message, { kind: 'direct', generation: 1 })).resolves.toBe(true);
    const prompt = provider.createChat.mock.calls[0][0].systemPrompt;
    expect(prompt).toContain('UNTRUSTED');
    expect(prompt).toContain('старый контекст 7');
    expect(prompt).not.toContain('старый контекст 0');
    expect(sendChat).toHaveBeenCalledWith('Помню.', expect.objectContaining({ social: true, envelopeId: message.messageId, generation: 1 }));
    expect(conversationMemory.entries.at(-1)).toMatchObject({ provenance: 'own_chat', envelopeId: message.messageId, generation: 1 });
  });

  it('does not let a group request replace an active direct request', async () => {
    let resolve;
    const provider = { createChat: vi.fn(async () => ({})), sendMessage: vi.fn(() => new Promise((r) => { resolve = r; })) };
    const { engine } = setup({ provider });
    const direct = engine.handle(message, { kind: 'direct', generation: 1 });
    await Promise.resolve();
    await expect(engine.handle({ ...message, messageId: 'group:1' }, { kind: 'group', generation: 1 })).resolves.toBe(false);
    resolve({ text: 'Отвечаю.' });
    await direct;
  });

  it('retains a successful group winner and releases an aborted request', async () => {
    const finalize = vi.fn();
    const release = vi.fn();
    const { engine } = setup({
      finalize,
      release,
      sendChat: vi.fn(async () => true),
      provider: { createChat: vi.fn(async () => ({})), sendMessage: vi.fn(async () => ({ text: 'Я здесь.', toolCalls: [] })) },
    });
    await expect(engine.handle({ ...message, messageId: 'group:sent' }, { kind: 'group', generation: 1 })).resolves.toBe(true);
    expect(engine.groupWindow.get('group:sent')?.immediateSent).toBe(1);

    const provider = {
      createChat: vi.fn(async () => ({})),
      sendMessage: vi.fn((_session, _message, { signal }) => new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve({ text: 'Старый ответ', toolCalls: [] }), { once: true });
      })),
    };
    const pending = setup({ provider, release: vi.fn() });
    const promise = pending.engine.handle({ ...message, messageId: 'group:abort' }, { kind: 'group', generation: 1 });
    await Promise.resolve();
    pending.engine.stop();
    await expect(promise).resolves.toBe(false);
    expect(pending.engine.groupWindow.get('group:abort')?.attempts.get('immediate:Sam')?.status).toBe('released');
  });

  it('keeps a silent action appraisal private', async () => {
    const { engine, provider, sendChat } = setup();
    const record = {
      sender: 'player',
      result: { actionId: 'fast:1', status: 'completed', outcome: { action: 'stop' } },
      appraisal: { decision: { speech: 'silent' } },
    };

    await expect(engine.handleActionOutcome(record, { generation: 1 })).resolves.toBe(false);
    expect(provider.createChat).not.toHaveBeenCalled();
    expect(sendChat).not.toHaveBeenCalled();
  });

  it('describes an observed action outcome without claiming an accepted action is finished', async () => {
    const { engine, provider, sendChat } = setup({
      provider: { createChat: vi.fn(async () => ({})), sendMessage: vi.fn(async () => ({ text: 'Уже иду.', toolCalls: [] })) },
    });
    const record = {
      sender: 'player',
      routing: { kind: 'direct', recipientIds: ['player'] },
      intent: 'FOLLOW',
      result: { actionId: 'fast:2', status: 'accepted', outcome: { action: 'follow', target: 'player' } },
      appraisal: { decision: { speech: 'inform' } },
    };

    await expect(engine.handleActionOutcome(record, { generation: 1 })).resolves.toBe(true);
    expect(provider.sendMessage.mock.calls[0][1]).toContain('Не говори, что длительное действие завершено');
    expect(sendChat).toHaveBeenCalledWith('Уже иду.', expect.objectContaining({ generation: 1 }));
  });
});
