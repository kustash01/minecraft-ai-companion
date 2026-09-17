import { describe, it, expect, vi } from 'vitest';
import { registerCodeActionTools } from '../../../src/tools/code-action-tools.js';

describe('CodeActionTools', () => {
  it('регистрирует run_code, save_skill, list_skills в реестре', async () => {
    const registered = new Map();
    const registry = {
      register: (def) => registered.set(def.name, def),
    };

    const mockSandbox = {
      execute: vi.fn().mockResolvedValue({ success: true, result: 'ok', logs: [] }),
    };
    const mockLibrary = {
      saveSkill: vi.fn(),
      listSkills: vi.fn().mockReturnValue([{ name: 'test', description: 'desc' }]),
    };

    registerCodeActionTools(registry, { actionSandbox: mockSandbox, skillLibrary: mockLibrary });

    expect(registered.has('run_code')).toBe(true);
    expect(registered.has('save_skill')).toBe(true);
    expect(registered.has('list_skills')).toBe(true);

    // Вызов run_code
    const runResult = await registered.get('run_code').handler({ code: 'return 1;' });
    expect(mockSandbox.execute).toHaveBeenCalledWith('return 1;');
    expect(runResult.success).toBe(true);
    expect(runResult.data).toBe('ok');

    // Вызов save_skill
    const saveResult = await registered.get('save_skill').handler({
      name: 'my_skill',
      code: 'return 2;',
      description: 'my desc',
    });
    expect(mockLibrary.saveSkill).toHaveBeenCalledWith('my_skill', 'return 2;', 'my desc');
    expect(saveResult.success).toBe(true);

    // Вызов list_skills
    const listResult = await registered.get('list_skills').handler({});
    expect(listResult.success).toBe(true);
    expect(listResult.data).toContain('test: desc');
  });
});
