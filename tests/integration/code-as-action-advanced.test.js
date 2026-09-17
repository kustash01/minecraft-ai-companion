import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vec3 from 'vec3';
import { ActionSandbox } from '../../src/actions/action-sandbox.js';
import { SkillLibrary } from '../../src/skills/skill-library.js';
import { ReflexEngine } from '../../src/behavior/reflex-engine.js';
import { AIBrain, AgentAIState } from '../../src/brain/ai-brain.js';
import { ToolRegistry } from '../../src/brain/tool-registry.js';
import { ContextManager } from '../../src/brain/context-manager.js';
import { registerCodeActionTools } from '../../src/tools/code-action-tools.js';
import { FidgetController } from '../../src/behavior/fidget-controller.js';

describe('Advanced Code-as-Action Integration Flow', () => {
  let tempSkillsDir;
  let skillLibrary;
  let actionSandbox;
  let toolRegistry;
  let mockBot;

  beforeEach(() => {
    tempSkillsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adv-skills-test-'));
    skillLibrary = new SkillLibrary(tempSkillsDir);

    mockBot = {
      version: '1.20.4',
      entity: { position: vec3(0, 64, 0), yaw: 0, pitch: 0, height: 1.6 },
      entities: {
        5: { id: 5, username: 'kustash01', name: 'player', type: 'player', position: vec3(3, 64, 0), height: 1.6 },
      },
      inventory: {
        items: () => [
          { name: 'diamond', count: 5, slot: 36, type: 264 },
          { name: 'dirt', count: 64, slot: 37, type: 3 },
          { name: 'shield', count: 1, slot: 38, type: 442 },
        ],
        slots: { 36: { name: 'diamond' }, 38: { name: 'shield' } },
      },
      pathfinder: {
        setGoal: vi.fn(),
        stop: vi.fn(),
      },
      findBlock: vi.fn().mockImplementation(({ matching }) => {
        return { name: 'chest', position: vec3(2, 64, 2) };
      }),
      blockAt: vi.fn().mockImplementation((pos) => {
        return { name: 'stone', position: pos };
      }),
      setControlState: vi.fn(),
      clearControlStates: vi.fn(),
      equip: vi.fn().mockResolvedValue(true),
      toss: vi.fn().mockResolvedValue(true),
      look: vi.fn().mockResolvedValue(true),
      dig: vi.fn().mockResolvedValue(true),
      openContainer: vi.fn().mockResolvedValue({
        deposit: vi.fn().mockResolvedValue(true),
        close: vi.fn(),
      }),
    };

    actionSandbox = new ActionSandbox({
      bot: mockBot,
      skillLibrary,
    });

    toolRegistry = new ToolRegistry();
    registerCodeActionTools(toolRegistry, { actionSandbox, skillLibrary });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempSkillsDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('Сценарий 1: Успешное выполнение скрипта со stations, crouchSpam и inventory.tossTo', async () => {
    const code = `
      // 1. Поиск сундука через станции
      const chest = stations.chest;
      if (!chest) throw new Error('Сундук не найден');

      // 2. Бросаем алмаз игроку по дуге
      await inventory.tossTo('kustash01', 'diamond', 1);

      // 3. Дружеский шифт-спам
      await bot.crouchSpam(2);

      return 'успешно поделился ресурсом';
    `;

    const res = await actionSandbox.execute(code);
    expect(res.success).toBe(true);
    expect(res.result).toBe('успешно поделился ресурсом');
    expect(mockBot.toss).toHaveBeenCalledWith(264, null, 1);
    expect(mockBot.setControlState).toHaveBeenCalledWith('sneak', true);
  });

  it('Сценарий 2: Self-Healing диагностика при ошибке и guidance в AIBrain', async () => {
    const toolCallRes = await toolRegistry.execute('run_code', {
      code: `
        const bad = null;
        return bad.something.value;
      `,
    });

    expect(toolCallRes.success).toBe(false);
    expect(toolCallRes.error).toContain('Cannot read properties of null');
    expect(toolCallRes.hint).toContain('findBlock');
    expect(toolCallRes.line).toBeDefined();

    // Проверяем, что AIBrain дополняет toolResults инструкцией по автоисправлению
    const mockProvider = {
      createChat: vi.fn().mockResolvedValue({}),
      sendMessage: vi.fn().mockResolvedValue({
        toolCalls: [{ id: 'call_1', name: 'run_code', args: { code: 'return null.x;' } }],
      }),
      sendToolResults: vi.fn().mockImplementation((session, toolResults) => {
        const tr = toolResults[0];
        expect(tr.result.success).toBe(false);
        expect(tr.result.instruction).toContain('исправь');
        return Promise.resolve({ text: 'Исправил код!' });
      }),
    };

    const aiBrain = new AIBrain({ ai: {} }, toolRegistry, new ContextManager({}), mockProvider);
    const reply = await aiBrain.processMessage('сделай действие', {});
    expect(reply).toBe('Исправил код!');
  });

  it('Сценарий 3: Спинномозговой рефлекс прерывает долгоиграющий скрипт (Spinal Reflex Abort)', async () => {
    const reflex = new ReflexEngine(mockBot);
    reflex.setEmergencyHandler((reason) => {
      actionSandbox.abortRunning(reason);
    });

    const scriptPromise = actionSandbox.execute(`
      await sleep(1500);
      return 'should not reach here';
    `);

    // Имитируем приближение крипера
    mockBot.entities[99] = {
      name: 'creeper',
      position: vec3(1, 64, 1),
    };

    await reflex._checkCreeperDanger();

    const result = await scriptPromise;
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Крипер/);
    expect(mockBot.pathfinder.stop).toHaveBeenCalled();
  });

  it('Сценарий 4: Параметризованный навык smelt_items и deposit_clutter', async () => {
    mockBot.goto = vi.fn().mockResolvedValue(true);
    const skills = skillLibrary.getSkills({
      bot: mockBot,
      world: {
        findNearestStation: () => ({ name: 'chest', position: vec3(2, 64, 2) }),
        getBlock: () => ({ name: 'chest', position: vec3(2, 64, 2) }),
      },
      inventory: {
        items: () => [
          { name: 'dirt', count: 10, type: 3 },
          { name: 'iron_sword', count: 1, type: 267 },
          { name: 'diamond', count: 5, type: 264 },
        ],
      },
      pathfinder: { goto: vi.fn() },
      sleep: vi.fn().mockResolvedValue(),
      log: vi.fn(),
    });

    // Оставляем только алмазы и меч, остальное в сундук
    const res = await skills.deposit_clutter({ keepItems: ['diamond'] });
    expect(res).toContain('Сложил');
  });

  it('Сценарий 5: Безопасное копание через world.safeDig', async () => {
    const res = await actionSandbox.execute(`
      const block = { name: 'iron_ore', position: vec3(1, 64, 1) };
      return await world.safeDig(block);
    `);

    expect(res.success).toBe(true);
    expect(mockBot.dig).toHaveBeenCalled();
  });
});
