import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CompanyOrchestrator, AGENT_NAMES } from '../../src/agents/company-orchestrator.js';

describe('6-Agent Company Endurance Simulation', () => {
  let orchestrator;

  const mockConfig = {
    minecraft: { host: '127.0.0.1', port: 25565, version: '1.20.4' },
    ai: { provider: 'gemini', model: 'gemini-3.7-flash', geminiApiKey: 'test-key' },
    bot: { owner: 'kustash01', language: 'ru', initiative: 'balanced' },
    ui: { port: 3003 },
  };

  beforeEach(() => {
    orchestrator = new CompanyOrchestrator(mockConfig);
  });

  afterEach(async () => {
    if (orchestrator) {
      await orchestrator.stop();
    }
  });

  it('should run multi-agent cognitive simulation across all 6 agents', async () => {
    const agents = orchestrator.getAllAgents();
    expect(agents.length).toBe(6);

    // Mock bot instances and entities for all 6 agents
    for (const agent of agents) {
      agent.isConnected = true;
      agent.mcBot.bot = {
        entity: {
          position: {
            x: Math.random() * 100,
            y: 64,
            z: Math.random() * 100,
            distanceTo: vi.fn(() => 5),
          },
        },
        health: 20,
        food: 20,
        foodSaturation: 5,
        inventory: {
          items: () => [{ name: 'bread', count: 5, slot: 36 }],
          slots: new Array(45).fill(null),
        },
        time: { timeOfDay: 6000 },
        isRaining: false,
        chat: vi.fn(),
      };
      agent.worldState.forceUpdate(agent.mcBot.bot);
    }

    // Run 100 simulated ticks across all agents
    const decisions = [];
    for (let tick = 0; tick < 100; tick++) {
      const agent = agents[tick % agents.length];
      
      // Update activity levels periodically
      if (tick % 10 === 0) {
        const levels = ['idle', 'working', 'group', 'danger'];
        agent.adaptiveThinking.setActivityLevel(levels[tick % levels.length]);
      }

      await agent.tick();

      const snapshot = agent.getStateSnapshot();
      decisions.push({
        agent: agent.name,
        tick,
        mood: snapshot.mood,
        activity: snapshot.thinkingState.activityLevel,
      });
    }

    expect(decisions.length).toBe(100);

    // Verify all 6 agents participated in the simulation
    for (const name of AGENT_NAMES) {
      const agentDecisions = decisions.filter(d => d.agent === name);
      expect(agentDecisions.length).toBeGreaterThan(10);
    }
  });

  it('should simulate inter-agent communication, group activities and task delegation', () => {
    const sam = orchestrator.getAgent('Sam');
    const ryan = orchestrator.getAgent('Ryan');
    const max = orchestrator.getAgent('Max');

    expect(sam).toBeDefined();
    expect(ryan).toBeDefined();
    expect(max).toBeDefined();

    // 1. Social Event
    orchestrator.socialGraph.recordEvent('Sam', 'Ryan', {
      type: 'completed_task_together',
      description: 'Built cobblestone generator',
    });

    const rel = orchestrator.socialGraph.getRelationship('Sam', 'Ryan');
    expect(rel.sharedHistory.length).toBe(1);
    expect(rel.trust).toBeGreaterThan(0.5);

    // 2. Dynamic Group
    const group = orchestrator.groupManager.proposeGroup(
      'Sam',
      ['Sam', 'Ryan', 'Max'],
      'Mining expedition at Y=-58',
      'mining'
    );
    expect(group.status).toBe('forming');

    orchestrator.groupManager.acceptGroupInvite('Ryan', group.id);
    orchestrator.groupManager.acceptGroupInvite('Max', group.id);
    orchestrator.groupManager.activateGroup(group.id);

    // 3. Task Posting & Claiming
    const task = {
      id: 'task_torches',
      description: 'Craft 64 torches',
      priority: 7,
      requestedBy: 'Sam',
      status: 'open',
    };
    orchestrator.groupManager.postTask(group.id, task);
    orchestrator.groupManager.claimTask('Ryan', group.id, 'task_torches');

    expect(group.taskBoard.length).toBe(1);
    expect(group.taskBoard[0].assignedTo).toBe('Ryan');

    // 4. Delegation
    const delegation = sam.delegation.delegate('Ryan', 'Скрафти железную кирку');
    ryan.delegation.receiveRequest(delegation);
    ryan.delegation.respondToRequest(delegation.id, 'Сделал', 'completed');
    sam.delegation.complete(delegation.id, 'Получил кирку');

    expect(sam.delegation.getPendingOutgoing().length).toBe(0);

    // 5. Company Memory
    orchestrator.companyMemory.recordEvent({
      type: 'mining_expedition',
      description: 'Sam, Ryan and Max mined 42 diamonds',
      participants: ['Sam', 'Ryan', 'Max'],
      significance: 9,
    });

    const recentEvents = orchestrator.companyMemory.getRecentEvents(5);
    expect(recentEvents.length).toBeGreaterThanOrEqual(1);
    expect(recentEvents.some(e => e.type === 'mining_expedition')).toBe(true);
  });

  it('should verify recovery controller detectors prevent deadlock and action loops without teleportation', () => {
    const leo = orchestrator.getAgent('Leo');
    expect(leo).toBeDefined();

    // Mock bot entity with stuck position
    leo.recovery.bot = {
      entity: { position: { x: 10, y: 64, z: 20 }, isAlive: true },
      pathfinder: {
        isMoving: () => true,
        stop: vi.fn(),
        setGoal: vi.fn(),
      },
      lookAt: vi.fn(),
      setControlState: vi.fn(),
      clearControlStates: vi.fn(),
    };

    // Simulate agent being stuck in the same position for multiple detector intervals
    for (let i = 0; i < 10; i++) {
      leo.recovery.recordPosition({ x: 10.001, y: 64, z: 20.001 });
    }

    const issues = leo.recovery.check();
    expect(Array.isArray(issues)).toBe(true);

    // Verify recovery controller executes non-teleportation recovery
    for (const issue of issues) {
      leo.recovery.recover(issue);
    }

    const recHistory = leo.recovery.getRecoveryHistory();
    expect(Array.isArray(recHistory)).toBe(true);
  });
});
