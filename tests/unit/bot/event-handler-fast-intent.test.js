import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { EventHandler } from '../../../src/bot/event-handler.js';

describe('EventHandler fast player intents', () => {
  it('executes a Russian movement request locally instead of sending it to conversation', async () => {
    const mcBot = new EventEmitter();
    const movementController = {
      followPlayer: vi.fn(),
      stop: vi.fn(),
      wait: vi.fn(),
    };
    const agentInstance = {
      activeGeneration: 1,
      bindingReady: true,
      name: 'Sam',
      chatIngress: null,
      observeChat: vi.fn(() => true),
      handleConversationMessage: vi.fn(),
      sendChat: vi.fn(async () => ({ sent: true })),
      movementController,
      preemptRuntimeForLegacy: vi.fn(),
      currentTask: 'idle',
      mcBot: { bot: { chat: vi.fn() } },
    };
    const handler = new EventHandler(mcBot, null, null, {
      bot: { owner: 'kustash01' },
      minecraft: { username: 'Sam' },
      ai: { social: { maxPublicResponders: 2 } },
    }, { agentInstance, allAgentNames: ['Sam', 'Max'] });

    handler.setup();
    mcBot.emit('chat', 'kustash01', 'Sam, иди за мной', 1);
    await new Promise((resolve) => setImmediate(resolve));

    expect(movementController.followPlayer).toHaveBeenCalledWith('kustash01', 3);
    expect(agentInstance.handleConversationMessage).not.toHaveBeenCalled();
    expect(agentInstance.sendChat).not.toHaveBeenCalled();
  });

  it('uses the agent runtime facade when one is available', async () => {
    const mcBot = new EventEmitter();
    const submitFastIntent = vi.fn(async ({ intent, playerUsername, generation }) => ({
      actionId: 'Sam:runtime:1', generation, executed: true, status: 'accepted',
      responseDisposition: 'deferred', ack: null, outcome: { action: intent, target: playerUsername },
      error: null, expectedObservation: { movementMode: 'following', targetPlayer: playerUsername },
    }));
    const recordFastIntentResult = vi.fn();
    const agentInstance = {
      activeGeneration: 1,
      bindingReady: true,
      name: 'Sam',
      chatIngress: null,
      observeChat: vi.fn(() => true),
      handleConversationMessage: vi.fn(),
      sendChat: vi.fn(),
      submitFastIntent,
      recordFastIntentResult,
      mcBot: { bot: { chat: vi.fn() } },
    };
    const handler = new EventHandler(mcBot, null, null, {
      bot: { owner: 'kustash01' },
      minecraft: { username: 'Sam' },
      ai: { social: { maxPublicResponders: 2 } },
    }, { agentInstance, allAgentNames: ['Sam', 'Max'] });

    handler.setup();
    mcBot.emit('chat', 'kustash01', 'Sam, иди за мной', 1);
    await new Promise((resolve) => setImmediate(resolve));

    expect(submitFastIntent).toHaveBeenCalledWith(expect.objectContaining({ intent: 'FOLLOW', playerUsername: 'kustash01', generation: 1 }));
    expect(recordFastIntentResult).toHaveBeenCalledWith(expect.objectContaining({ actionId: 'Sam:runtime:1' }), expect.any(Object));
  });

  it('does not let a non-owner execute a gameplay command', async () => {
    const mcBot = new EventEmitter();
    const movementController = {
      followPlayer: vi.fn(),
      stop: vi.fn(),
      wait: vi.fn(),
    };
    const agentInstance = {
      activeGeneration: 1,
      bindingReady: true,
      name: 'Sam',
      chatIngress: null,
      observeChat: vi.fn(() => true),
      handleConversationMessage: vi.fn(),
      sendChat: vi.fn(async () => ({ sent: true })),
      movementController,
      preemptRuntimeForLegacy: vi.fn(),
      currentTask: 'idle',
      mcBot: { bot: { chat: vi.fn() } },
    };
    const handler = new EventHandler(mcBot, null, null, {
      bot: { owner: 'kustash01' },
      minecraft: { username: 'Sam' },
      ai: { social: { maxPublicResponders: 2 } },
    }, { agentInstance, allAgentNames: ['Sam', 'Max'] });

    handler.setup();
    mcBot.emit('chat', 'visitor', 'Sam, иди за мной', 1);
    await new Promise((resolve) => setImmediate(resolve));

    expect(movementController.followPlayer).not.toHaveBeenCalled();
    expect(agentInstance.sendChat).not.toHaveBeenCalled();
    expect(agentInstance.handleConversationMessage).toHaveBeenCalledOnce();
  });

  it('does not send a null acknowledgement for a fast-path action', async () => {
    const mcBot = new EventEmitter();
    const agentInstance = {
      activeGeneration: 1,
      bindingReady: true,
      name: 'Sam',
      chatIngress: null,
      observeChat: vi.fn(() => true),
      handleConversationMessage: vi.fn(),
      sendChat: vi.fn(async () => ({ sent: true })),
      movementController: { followPlayer: vi.fn(async () => {}), stop: vi.fn(), wait: vi.fn() },
      preemptRuntimeForLegacy: vi.fn(),
      currentTask: 'idle',
      mcBot: { bot: { chat: vi.fn() } },
    };
    const handler = new EventHandler(mcBot, null, null, {
      bot: { owner: 'kustash01' },
      minecraft: { username: 'Sam' },
      ai: { social: { maxPublicResponders: 2 } },
    }, { agentInstance, allAgentNames: ['Sam', 'Max'] });

    handler.setup();
    mcBot.emit('chat', 'kustash01', 'Sam, иди за мной', 1);
    await new Promise((resolve) => setImmediate(resolve));

    expect(agentInstance.sendChat).not.toHaveBeenCalled();
  });

  it('routes harmless position questions to conversation instead of treating them as privileged commands', async () => {
    const mcBot = new EventEmitter();
    const agentInstance = {
      activeGeneration: 1,
      bindingReady: true,
      name: 'Sam',
      chatIngress: null,
      observeChat: vi.fn(() => true),
      handleConversationMessage: vi.fn(),
      sendChat: vi.fn(),
      movementController: { followPlayer: vi.fn(), stop: vi.fn(), wait: vi.fn() },
      mcBot: { bot: { chat: vi.fn() } },
    };
    const handler = new EventHandler(mcBot, null, null, {
      bot: { owner: 'kustash01' },
      minecraft: { username: 'Sam' },
      ai: { social: { maxPublicResponders: 2 } },
    }, { agentInstance, allAgentNames: ['Sam', 'Max'] });

    handler.setup();
    mcBot.emit('chat', 'visitor', 'Sam, где ты?', 1);
    await new Promise((resolve) => setImmediate(resolve));

    expect(agentInstance.handleConversationMessage).toHaveBeenCalledOnce();
    expect(agentInstance.movementController.followPlayer).not.toHaveBeenCalled();
  });
});
