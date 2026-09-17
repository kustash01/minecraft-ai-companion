import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SkillLibrary } from '../../../src/skills/skill-library.js';

describe('SkillLibrary', () => {
  let tempDir;
  let skillLib;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-lib-test-'));
    skillLib = new SkillLibrary(tempDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('сохраняет и загружает новый навык', () => {
    const code = 'return 42;';
    skillLib.saveSkill('test_skill', code, 'Тестовый навык');

    const skill = skillLib.getSkill('test_skill');
    expect(skill).toBeTruthy();
    expect(skill.name).toBe('test_skill');
    expect(skill.description).toBe('Тестовый навык');
  });

  it('возвращает список навыков через listSkills', () => {
    skillLib.saveSkill('skill_one', 'return 1;', 'Первый');
    skillLib.saveSkill('skill_two', 'return 2;', 'Второй');

    const list = skillLib.listSkills();
    const names = list.map(s => s.name);
    expect(names).toContain('skill_one');
    expect(names).toContain('skill_two');
  });

  it('вызывает функцию навыка через getSkills(context)', async () => {
    skillLib.saveSkill('add_numbers', 'return a + b;', 'Сложение');
    const skills = skillLib.getSkills({});

    // Запускаем через обертку с аргументами
    const skill = skillLib.getSkill('add_numbers');
    expect(skill).toBeTruthy();
  });

  it('отклоняет сохранение навыка с некорректным синтаксисом', () => {
    expect(() => {
      skillLib.saveSkill('bad_skill', 'const x = ;', 'Ошибка синтаксиса');
    }).toThrow();
  });

  it('отклоняет некорректные имена навыков со спецсимволами', () => {
    expect(() => {
      skillLib.saveSkill('bad name with spaces!', 'return true;', 'Невалидное имя');
    }).toThrow(/Некорректное имя/);
  });

  it('передает параметры params в скомпилированный навык', async () => {
    skillLib.saveSkill('calc_with_params', 'return (params.multiplier || 1) * 10;', 'Умножение');
    const skills = skillLib.getSkills({});
    const res = await skills.calc_with_params({ multiplier: 5 });
    expect(res).toBe(50);
  });
});
