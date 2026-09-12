import { describe, it, expect, beforeEach } from 'vitest';
import { Planner } from '../../../src/planning/planner.js';
import { MemoryManager } from '../../../src/memory/memory-manager.js';
import { ToolRegistry } from '../../../src/brain/tool-registry.js';
import { MockAIProvider } from '../../mocks/mock-ai.js';
import { AIBrain } from '../../../src/brain/ai-brain.js';
import { ContextManager } from '../../../src/brain/context-manager.js';

describe('Planner', () => {
  let planner;
  let memoryManager;

  beforeEach(() => {
    memoryManager = new MemoryManager(':memory:');
    const toolRegistry = new ToolRegistry();
    const contextManager = new ContextManager({});
    const provider = new MockAIProvider();
    const aiBrain = new AIBrain({}, toolRegistry, contextManager, provider, memoryManager);
    planner = new Planner(memoryManager, toolRegistry, aiBrain);
  });

  it('should create a multi-step plan', () => {
    const plan = planner.createPlan('Построить дом', [
      'Найти подходящую ровную площадку',
      'Добыть 30 бревен',
      'Построить стены 5х5',
      'Поставить крышу и дверь',
    ]);

    expect(plan).toBeDefined();
    expect(plan.goal).toBe('Построить дом');
    expect(plan.steps).toHaveLength(4);
    expect(plan.steps[0].status).toBe('in_progress');
    expect(plan.steps[1].status).toBe('pending');
    expect(plan.status).toBe('in_progress');
  });

  it('should complete steps sequentially and finish plan', () => {
    planner.createPlan('Скрафтить железный меч', [
      'Добыть железную руду',
      'Переплавить в печи',
      'Скрафтить меч на верстаке',
    ]);

    planner.completeStep(0, 'Добыто 3 руды');
    expect(planner.getActivePlan().currentStepIndex).toBe(1);
    expect(planner.getActivePlan().steps[0].status).toBe('completed');
    expect(planner.getActivePlan().steps[1].status).toBe('in_progress');

    planner.completeStep(1, 'Переплавлено 3 слитка');
    planner.completeStep(2, 'Меч создан');

    expect(planner.getActivePlan().status).toBe('completed');
  });

  it('should revise plan on failure', () => {
    planner.createPlan('Добыть алмазы', [
      'Спуститься в пещеру',
      'Копать на глубине -58',
    ]);

    planner.completeStep(0, 'Спустились');
    
    // Revise plan with new steps
    planner.revisePlan([
      'Обойти озеро лавы',
      'Поставить мост из булыжника',
      'Продолжить раскопки',
    ]);

    const plan = planner.getActivePlan();
    expect(plan.steps).toHaveLength(4); // 1 completed + 3 new
    expect(plan.steps[1].description).toBe('Обойти озеро лавы');
    expect(plan.steps[1].status).toBe('in_progress');
  });

  it('should cancel plan', () => {
    planner.createPlan('Охота', ['Найти коров', 'Добыть мясо']);
    const cancelled = planner.cancelPlan('Игрок попросил остановиться');
    expect(cancelled).toBe(true);
    expect(planner.getActivePlan()).toBeNull();
  });
});
