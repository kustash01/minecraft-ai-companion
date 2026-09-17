import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ToolRegistry } from '../../src/brain/tool-registry.js';
import { ActionSandbox } from '../../src/actions/action-sandbox.js';
import { SkillLibrary } from '../../src/skills/skill-library.js';
import { registerAllTools } from '../../src/tools/index.js';

describe('Code-as-Action End-to-End Flow', () => {
  let tempSkillsDir;
  let skillLibrary;
  let actionSandbox;
  let toolRegistry;
  let mockBot;

  beforeEach(() => {
    tempSkillsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-e2e-'));
    skillLibrary = new SkillLibrary(tempSkillsDir);

    mockBot = {
      version: '1.20.4',
      entity: { position: { x: 10, y: 64, z: 20 }, yaw: 0, pitch: 0 },
      inventory: {
        items: () => [
          { name: 'iron_sword', count: 1, slot: 36, type: 267 },
          { name: 'dirt', count: 64, slot: 10, type: 3 },
          { name: 'cobblestone', count: 32, slot: 11, type: 4 },
        ],
        slots: {
          36: { name: 'iron_sword' },
          10: { name: 'dirt' },
          11: { name: 'cobblestone' },
        },
      },
      recipesFor: () => [],
      chat: () => {},
    };

    actionSandbox = new ActionSandbox({
      bot: mockBot,
      skillLibrary,
    });

    toolRegistry = new ToolRegistry();
    registerAllTools(toolRegistry, {
      bot: mockBot,
      actionSandbox,
      skillLibrary,
    });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempSkillsDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('регистрирует run_code и исполняет динамический JS-код со всеми хелперами', async () => {
    const runCodeTool = toolRegistry.get('run_code');
    expect(runCodeTool).toBeTruthy();

    const code = `
      log('Проверяю инвентарь...');
      const hasSword = inventory.has('iron_sword');
      const dirtCount = inventory.count('dirt');
      log(\`Меч: \${hasSword}, земли: \${dirtCount}\`);
      return { hasSword, dirtCount };
    `;

    const result = await toolRegistry.execute('run_code', { code });
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.data);
    expect(parsed.hasSword).toBe(true);
    expect(parsed.dirtCount).toBe(64);
    expect(result.logs.length).toBeGreaterThanOrEqual(2);
  });

  it('сохраняет новый навык через save_skill и сразу же вызывает его через run_code', async () => {
    // 1. Сохраняем навык
    const saveResult = await toolRegistry.execute('save_skill', {
      name: 'count_all_blocks',
      description: 'Подсчёт земли и камня',
      code: `
        const dirt = inventory.count('dirt');
        const cobble = inventory.count('cobblestone');
        return dirt + cobble;
      `,
    });
    expect(saveResult.success).toBe(true);

    // 2. Проверяем в list_skills
    const listResult = await toolRegistry.execute('list_skills', {});
    expect(listResult.success).toBe(true);
    expect(listResult.data).toContain('count_all_blocks');

    // 3. Вызываем этот сохраненный навык внутри run_code через skills.count_all_blocks()
    const callSkillCode = `
      const total = await skills.count_all_blocks();
      return { total };
    `;
    const execResult = await toolRegistry.execute('run_code', { code: callSkillCode });
    expect(execResult.success).toBe(true);
    const parsed = JSON.parse(execResult.data);
    expect(parsed.total).toBe(96); // 64 dirt + 32 cobble
  });
});
