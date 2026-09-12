import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CompanyOrchestrator, AGENT_NAMES } from '../../src/agents/company-orchestrator.js';

describe('Company Orchestrator & 6-Agent Infrastructure', () => {
  let orchestrator;

  const mockConfig = {
    minecraft: { host: '127.0.0.1', port: 25565, version: '1.20.4' },
    ai: { provider: 'gemini', model: 'gemini-3.7-flash', geminiApiKey: 'test-key' },
    bot: { owner: 'kustash01', language: 'ru', initiative: 'balanced' },
    ui: { port: 3002 },
  };

  beforeEach(() => {
    orchestrator = new CompanyOrchestrator(mockConfig);
  });

  afterEach(async () => {
    if (orchestrator) {
      await orchestrator.stop();
    }
  });

  it('should initialize 6 distinct agent instances with proper names', () => {
    expect(orchestrator.agentNames).toEqual(AGENT_NAMES);
    expect(orchestrator.getAllAgents().length).toBe(6);

    for (const name of AGENT_NAMES) {
      const agent = orchestrator.getAgent(name);
      expect(agent).toBeDefined();
      expect(agent.name).toBe(name);
      expect(agent.memoryManager).toBeDefined();
      expect(agent.worldState).toBeDefined();
      expect(agent.skills).toBeDefined();
      expect(agent.emotions).toBeDefined();
      expect(agent.adaptiveThinking).toBeDefined();
      expect(agent.actionCommitment).toBeDefined();
      expect(agent.capabilities).toEqual({ enableAutoEat: false });
      expect(Object.isFrozen(agent.capabilities)).toBe(true);
    }
  });

  it('should provide full multi-agent state snapshot for dashboard', () => {
    const snapshot = orchestrator.getStateSnapshot();
    expect(snapshot).toBeDefined();
    expect(snapshot.agents).toBeDefined();
    expect(Object.keys(snapshot.agents).length).toBe(6);
    expect(snapshot.socialGraph).toBeDefined();
    expect(snapshot.groups).toBeDefined();
    expect(snapshot.apiBudget).toBeDefined();
    expect(snapshot.conversations).toBeDefined();
    expect(snapshot.availability).toMatchObject({ totalAgents: 6, availableAgents: [] });

    for (const name of AGENT_NAMES) {
      expect(snapshot.agents[name]).toBeDefined();
      expect(snapshot.agents[name].name).toBe(name);
      expect(snapshot.agents[name].traits).toBeDefined();
      expect(snapshot.agents[name].mood).toBeDefined();
    }
  });

  it('should manage shared infrastructure correctly without central decision making', () => {
    expect(orchestrator.socialGraph).toBeDefined();
    expect(orchestrator.budgetManager).toBeDefined();
    expect(orchestrator.conversationManager).toBeDefined();
    expect(orchestrator.groupManager).toBeDefined();
    expect(orchestrator.interAgentChat).toBeUndefined();
  });
});
