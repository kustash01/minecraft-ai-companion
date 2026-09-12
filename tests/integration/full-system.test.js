import { describe, it, expect, beforeEach } from 'vitest';
import { createMockBot } from '../mocks/mock-bot.js';
import { MockAIProvider } from '../mocks/mock-ai.js';
import { ToolRegistry } from '../../src/brain/tool-registry.js';
import { ContextManager } from '../../src/brain/context-manager.js';
import { AIBrain } from '../../src/brain/ai-brain.js';
import { WorldState } from '../../src/perception/world-state.js';
import { MemoryManager, POITypes } from '../../src/memory/memory-manager.js';
import { Planner } from '../../src/planning/planner.js';
import { registerAllTools } from '../../src/tools/index.js';

describe('Full Companion System Scenarios', () => {
  let mockBot;
  let provider;
  let registry;
  let worldState;
  let memoryManager;
  let planner;
  let aiBrain;

  beforeEach(() => {
    mockBot = createMockBot();
    provider = new MockAIProvider();
    registry = new ToolRegistry();
    worldState = new WorldState();
    memoryManager = new MemoryManager(':memory:');
    const contextManager = new ContextManager({
      bot: { owner: 'kustash01', language: 'ru' },
      minecraft: { username: 'GeminiBot' },
      ai: { rateLimit: { maxRequests: 1000, windowMs: 1000 } },
    });

    aiBrain = new AIBrain(
      {
        bot: { owner: 'kustash01', language: 'ru' },
        minecraft: { username: 'GeminiBot' },
        ai: { rateLimit: { maxRequests: 1000, windowMs: 1000 } },
      },
      registry,
      contextManager,
      provider,
      memoryManager
    );

    planner = new Planner(memoryManager, registry, aiBrain);

    registerAllTools(registry, {
      bot: mockBot,
      worldState,
      mcBot: { bot: mockBot, isConnected: () => true },
      memoryManager,
      planner,
    });

    worldState.forceUpdate(mockBot);
  });

  it('Scenario 1: "следуй за мной" -> calls follow_player', async () => {
    provider.addResponse({
      text: '',
      toolCalls: [{ name: 'follow_player', args: { playerName: 'kustash01', distance: 3 } }],
      raw: {},
    });
    provider.addResponse({
      text: 'Иду за тобой, держу дистанцию 3 блока!',
      toolCalls: [],
      raw: {},
    });

    const reply = await aiBrain.processMessage('Следуй за мной', worldState);
    expect(reply).toContain('Иду за тобой');
  });

  it('Scenario 2: "построй дом" -> decomposes into plan with create_plan', async () => {
    provider.addResponse({
      text: '',
      toolCalls: [
        {
          name: 'create_plan',
          args: {
            goal: 'Построить дом для нас',
            steps: [
              'Очистить площадку 6х6',
              'Собрать 32 дубовых бревна',
              'Построить стены из досок',
              'Поставить крышу и дверь',
            ],
          },
        },
      ],
      raw: {},
    });
    provider.addResponse({
      text: 'Я составил отличный план стройки! Начинаю с первого шага.',
      toolCalls: [],
      raw: {},
    });

    const reply = await aiBrain.processMessage('Давай построим нормальный дом', worldState);
    expect(reply).toContain('план');

    const activePlan = planner.getActivePlan();
    expect(activePlan).toBeDefined();
    expect(activePlan.goal).toBe('Построить дом для нас');
    expect(activePlan.steps).toHaveLength(4);
  });

  it('Scenario 3: "где база?" -> calls find_poi to recall base coordinates', async () => {
    // Preset base in memory
    memoryManager.pois.addPOI('Наша база', POITypes.BASE, { x: 50, y: 70, z: -120 }, 'Главный сундук');

    provider.addResponse({
      text: '',
      toolCalls: [{ name: 'find_poi', args: { name: 'база' } }],
      raw: {},
    });
    provider.addResponse({
      text: 'Наша база находится на координатах X: 50, Y: 70, Z: -120.',
      toolCalls: [],
      raw: {},
    });

    const reply = await aiBrain.processMessage('Где находится наша база?', worldState);
    expect(reply).toContain('50');
    expect(reply).toContain('-120');
  });

  it('Scenario 4: "что мы делали вчера?" -> reads diary / episodic memory', async () => {
    memoryManager.diary.logEntry(4, 'Поход в шахту', 'Мы нашли 8 алмазов и построили портал в Нижний мир.');

    provider.addResponse({
      text: '',
      toolCalls: [{ name: 'read_diary', args: { limit: 3 } }],
      raw: {},
    });
    provider.addResponse({
      text: 'Вчера мы ходили в шахту, нашли 8 алмазов и построили портал в Незер!',
      toolCalls: [],
      raw: {},
    });

    const reply = await aiBrain.processMessage('Что мы делали вчера?', worldState);
    expect(reply).toContain('алмазов');
  });

  it('Scenario 5: "сохрани это место как шахта" -> saves POI to SQLite', async () => {
    provider.addResponse({
      text: '',
      toolCalls: [{ name: 'save_poi', args: { name: 'Глубокая шахта', type: 'mine', notes: 'Много железа' } }],
      raw: {},
    });
    provider.addResponse({
      text: 'Запомнил это место как "Глубокая шахта" на текущих координатах!',
      toolCalls: [],
      raw: {},
    });

    const reply = await aiBrain.processMessage('Запомни это место как шахта', worldState);
    expect(reply).toContain('Запомнил');

    const pois = memoryManager.pois.getPOIs(POITypes.MINE);
    expect(pois).toHaveLength(1);
    expect(pois[0].name).toBe('Глубокая шахта');
    expect(pois[0].x).toBe(100);
  });
});
