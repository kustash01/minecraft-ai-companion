import { describe, it, expect, beforeEach } from 'vitest';
import { RecoveryController } from '../../../src/recovery/recovery-controller.js';

describe('RecoveryController Idle Unresponsive Tests', () => {
  let recovery;
  let mockBot;

  beforeEach(() => {
    mockBot = {
      entity: {
        position: { x: 100, y: 64, z: 200, clone: () => ({ x: 100, y: 64, z: 200, distanceTo: () => 0 }) },
        velocity: { x: 0, y: 0, z: 0 },
        onGround: true,
      },
      pathfinder: {
        isMoving: () => false,
      },
    };
  });

  it('does NOT flag unresponsive when agent is intentionally idling peacefully', () => {
    recovery = new RecoveryController({
      agentName: 'Sam',
      bot: mockBot,
      aiBrain: { isProcessing: false, activeRequests: 0 },
      movementController: { mode: 'idle' },
      debugMode: true,
    });

    // Simulate 50 seconds passing without actions while idling
    recovery.lastActionTime = Date.now() - 50000;

    const issues = recovery.check();
    const unresponsive = issues.find(i => i.type === 'unresponsive');

    expect(unresponsive).toBeUndefined();
    // lastActionTime should have been refreshed for idle bot
    expect(Date.now() - recovery.lastActionTime).toBeLessThan(1000);
  });

  it('DOES flag unresponsive when an active movement task has stalled for > 40s', () => {
    recovery = new RecoveryController({
      agentName: 'Sam',
      bot: mockBot,
      aiBrain: { isProcessing: false, activeRequests: 0 },
      movementController: { mode: 'moving_to' },
      debugMode: true,
    });

    recovery.lastActionTime = Date.now() - 50000;

    const issues = recovery.check();
    const unresponsive = issues.find(i => i.type === 'unresponsive');

    expect(unresponsive).toBeDefined();
    expect(unresponsive.type).toBe('unresponsive');
  });

  it('DOES flag unresponsive when an AI request is processing and has stalled for > 40s', () => {
    recovery = new RecoveryController({
      agentName: 'Sam',
      bot: mockBot,
      aiBrain: { isProcessing: true, activeRequests: 1 },
      movementController: { mode: 'idle' },
      debugMode: true,
    });

    recovery.lastActionTime = Date.now() - 50000;

    const issues = recovery.check();
    const unresponsive = issues.find(i => i.type === 'unresponsive');

    expect(unresponsive).toBeDefined();
  });
});
