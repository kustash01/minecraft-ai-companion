import { describe, it, expect, vi } from 'vitest';
import { InterAgentChat } from '../../../src/social/inter-agent-chat.js';

describe('InterAgentChat Bot Access Tests', () => {
  it('correctly uses bot from AgentInstance (agent.bot or agent.mcBot.bot)', async () => {
    const chatSent = [];
    const mockBot = {
      chat: vi.fn((msg) => chatSent.push(msg)),
      state: 'idle',
    };

    const mockAgentInstance = {
      name: 'Sam',
      personality: { talkativeness: 0.8 },
      mcBot: { bot: mockBot },
      get bot() {
        return this.mcBot.bot;
      },
    };

    const agentsMap = new Map();
    agentsMap.set('Sam', mockAgentInstance);

    const interChat = new InterAgentChat({
      agents: agentsMap,
      conversationManager: null,
    });

    // Test sendImmediate
    interChat.sendImmediate('Sam', 'Привет, Ryan!');
    expect(mockBot.chat).toHaveBeenCalledWith('Привет, Ryan!');
    expect(chatSent).toContain('Привет, Ryan!');

    // Test whisper format
    interChat.sendImmediate('Sam', 'Секретное сообщение', { target: 'whisper:Ryan' });
    expect(mockBot.chat).toHaveBeenCalledWith('/msg Ryan Секретное сообщение');
  });

  it('fails gracefully when agent does not exist', async () => {
    const agentsMap = new Map();
    const interChat = new InterAgentChat({ agents: agentsMap, conversationManager: null });

    const result = await interChat.sendMessage('GhostAgent', 'Привет');
    expect(result).toBe(false);
  });
});
