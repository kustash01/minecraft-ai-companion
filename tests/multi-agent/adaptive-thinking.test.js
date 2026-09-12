import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdaptiveThinkingController } from '../../src/agents/adaptive-thinking.js';
import { ActionCommitmentManager } from '../../src/agents/action-commitment.js';
import { APIBudgetManager } from '../../src/agents/api-budget-manager.js';

describe('Adaptive Thinking & Action Commitment', () => {
  let controller;
  let commitment;
  let budgetManager;

  beforeEach(() => {
    controller = new AdaptiveThinkingController({
      agentName: 'Sam',
      cognitiveEngine: {},
      fastPath: {},
      eventBus: { emit: vi.fn(), on: vi.fn() },
    });

    commitment = new ActionCommitmentManager({ agentName: 'Sam' });

    budgetManager = new APIBudgetManager({
      maxGlobalRPM: 14,
      maxPerAgentRPM: 4,
      agents: ['Sam', 'Max', 'Jack', 'Ryan', 'Alex', 'Leo'],
    });
  });

  it('should classify events into 4 distinct cognitive layers', () => {
    // 1. FAST_PATH
    const dangerEvent = controller.evaluateEvent({ type: 'creeper_nearby' });
    expect(dangerEvent.layer).toBe('FAST_PATH');
    expect(dangerEvent.shouldCallLLM).toBe(false);
    expect(dangerEvent.priority).toBe(10);

    // 2. EVENT_DRIVEN
    const chatEvent = controller.evaluateEvent({ type: 'chat', payload: { message: 'hi' } });
    expect(chatEvent.layer).toBe('EVENT_DRIVEN');
    expect(chatEvent.shouldCallLLM).toBe(true);

    // 3. DEEP_THINKING
    const deepEvent = controller.evaluateEvent({ type: 'complex_goal_planning' });
    expect(deepEvent.layer).toBe('DEEP_THINKING');
    expect(deepEvent.shouldCallLLM).toBe(true);

    // 4. NORMAL_TICK fallback
    const tickEvent = controller.evaluateEvent({ type: 'unknown_periodic' });
    expect(tickEvent.layer).toBe('NORMAL_TICK');
  });

  it('should adapt tick intervals based on activity level', () => {
    controller.setActivityLevel('danger');
    expect(controller.getTickInterval()).toBe(7500);

    controller.setActivityLevel('group');
    expect(controller.getTickInterval()).toBe(15000);

    controller.setActivityLevel('working');
    expect(controller.getTickInterval()).toBe(22500);

    controller.setActivityLevel('idle');
    expect(controller.getTickInterval()).toBe(45000);
  });

  it('should enforce action commitment and resist low-priority twitching', () => {
    commitment.commitTo({
      type: 'building',
      description: 'Building wooden wall',
      priority: 5,
    });

    // Lower priority event should NOT interrupt
    const lowPriority = { priority: 4, type: 'look_around' };
    expect(commitment.canInterrupt(lowPriority)).toBe(false);

    // Emergency should ALWAYS interrupt
    const emergency = { priority: 10, type: 'emergency' };
    expect(commitment.canInterrupt(emergency)).toBe(true);
  });

  it('should enforce API budget and manage request priorities', async () => {
    expect(budgetManager.canAgentThink('Sam')).toBe(true);

    const slotGranted = await budgetManager.requestSlot('Sam', 'event_driven', 'chat');
    expect(slotGranted).toBe(true);

    const stats = budgetManager.getStats();
    expect(stats.global.requestsThisMinute).toBe(1);
    expect(stats.perAgent.Sam.requestsThisMinute).toBe(1);

    budgetManager.releaseSlot('Sam');
  });
});
