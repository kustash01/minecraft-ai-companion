import { describe, it, expect, vi } from 'vitest';
import { ActionSandbox } from '../../../src/actions/action-sandbox.js';

describe('ActionSandbox', () => {
  it('выполняет простой асинхронный JS-код и возвращает результат', async () => {
    const sandbox = new ActionSandbox();
    const res = await sandbox.execute(`
      const a = 10;
      const b = 25;
      return a + b;
    `);

    expect(res.success).toBe(true);
    expect(res.result).toBe(35);
  });

  it('перехватывает console.log и log в массив logs', async () => {
    const sandbox = new ActionSandbox();
    const res = await sandbox.execute(`
      log('Привет из скрипта!');
      console.log('Тест console.log');
      return 'done';
    `);

    expect(res.success).toBe(true);
    expect(res.logs).toContain('Привет из скрипта!');
    expect(res.logs).toContain('Тест console.log');
  });

  it('обрабатывает ошибки синтаксиса и рантайма без падения процесса', async () => {
    const sandbox = new ActionSandbox();
    const res = await sandbox.execute(`
      throw new Error('Кастомная ошибка из скрипта');
    `);

    expect(res.success).toBe(false);
    expect(res.error).toContain('Кастомная ошибка из скрипта');
  });

  it('прерывает исполнение при превышении таймаута', async () => {
    const sandbox = new ActionSandbox({ config: { actionTimeoutMs: 100 } });
    const res = await sandbox.execute(`
      await sleep(500);
      return 'too late';
    `, { timeoutMs: 80 });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Таймаут/);
  });

  it('предоставляет контекстные объекты world, inventory, vec3, mcData', async () => {
    const mockBot = {
      version: '1.20.4',
      inventory: {
        items: () => [{ name: 'diamond', count: 3, slot: 36 }],
        slots: { 36: { name: 'diamond' } },
      },
      entity: { position: { x: 0, y: 64, z: 0 } },
    };

    const sandbox = new ActionSandbox({ bot: mockBot });
    const res = await sandbox.execute(`
      const hasDiamonds = inventory.has('diamond', 2);
      const count = inventory.count('diamond');
      const v = vec3(1, 2, 3);
      return { hasDiamonds, count, v: [v.x, v.y, v.z] };
    `);

    expect(res.success).toBe(true);
    expect(res.result).toEqual({
      hasDiamonds: true,
      count: 3,
      v: [1, 2, 3],
    });
  });

  it('поддерживает экстренную отмену через abortRunning (Spinal Reflex Abort)', async () => {
    const sandbox = new ActionSandbox();
    const executePromise = sandbox.execute(`
      await sleep(1000);
      return 'done';
    `);

    // Спинномозговой рефлекс прерывает выполнение через 50 мс
    setTimeout(() => {
      sandbox.abortRunning('Угроза взрыва крипера');
    }, 50);

    const res = await executePromise;
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Угроза взрыва крипера/);
    expect(res.hint).toMatch(/рефлексами/);
  });

  it('возвращает диагностику и подсказки при ошибках в коде (Self-Healing)', async () => {
    const sandbox = new ActionSandbox();
    const res = await sandbox.execute(`
      const target = null;
      return target.position.x;
    `);

    expect(res.success).toBe(false);
    expect(res.hint).toContain('findBlock');
    expect(res.line).toBeDefined();
  });

  it('предоставляет stations, crouchSpam, organizeHotbar, equipOffhand, sleep.gamerPause', async () => {
    let sneakCount = 0;
    const mockBot = {
      version: '1.20.4',
      entity: { position: { x: 0, y: 64, z: 0 }, yaw: 0, pitch: 0 },
      inventory: {
        items: () => [{ name: 'iron_sword', count: 1, slot: 20 }],
        slots: {},
      },
      setControlState: vi.fn((state, val) => {
        if (state === 'sneak' && val) sneakCount++;
      }),
      equip: vi.fn().mockResolvedValue(true),
      findBlock: vi.fn().mockReturnValue({ name: 'chest', position: { x: 5, y: 64, z: 5 } }),
    };

    const sandbox = new ActionSandbox({ bot: mockBot });
    const res = await sandbox.execute(`
      await sleep.gamerPause(10, 30);
      await bot.crouchSpam(2);
      await inventory.equipOffhand('iron_sword');
      const chest = stations.chest;
      return { sneakCalled: true, chestName: chest?.name };
    `);

    expect(res.success).toBe(true);
    expect(res.result.chestName).toBe('chest');
    expect(mockBot.setControlState).toHaveBeenCalledWith('sneak', true);
    expect(mockBot.equip).toHaveBeenCalled();
  });

  it('world.safeDig копает блок и не копает прямо под собой', async () => {
    const mockBlock = {
      name: 'stone',
      position: { x: 10, y: 64, z: 10 },
    };
    const mockBot = {
      version: '1.20.4',
      entity: { position: { x: 0, y: 64, z: 0 } },
      inventory: { items: () => [] },
      dig: vi.fn().mockResolvedValue(true),
      blockAt: vi.fn().mockReturnValue(null),
    };

    const sandbox = new ActionSandbox({ bot: mockBot });
    const res = await sandbox.execute(`
      return await world.safeDig({ name: 'stone', position: { x: 10, y: 64, z: 10 } });
    `);

    expect(res.success).toBe(true);
    expect(mockBot.dig).toHaveBeenCalled();
  });

  it('поддерживает тиковую физику: sleep.ticks, bot.jump, wTap, blockWithShield', async () => {
    const mockBot = {
      version: '1.20.4',
      entity: { position: { x: 0, y: 64, z: 0 }, velocity: { x: 0, y: 0, z: 0 } },
      inventory: { items: () => [], slots: {} },
      setControlState: vi.fn(),
      activateItem: vi.fn(),
      deactivateItem: vi.fn(),
      on: vi.fn((evt, cb) => {
        if (evt === 'physicsTick') setTimeout(cb, 10);
      }),
      removeListener: vi.fn(),
    };

    const sandbox = new ActionSandbox({ bot: mockBot });
    const res = await sandbox.execute(`
      await sleep.ticks(2);
      await bot.jump();
      await bot.wTap();
      await bot.blockWithShield(50);
      return 'physics_ok';
    `);

    expect(res.success).toBe(true);
    expect(res.result).toContain('physics_ok');
    expect(mockBot.setControlState).toHaveBeenCalledWith('jump', true);
    expect(mockBot.setControlState).toHaveBeenCalledWith('jump', false);
    expect(mockBot.activateItem).toHaveBeenCalled();
    expect(mockBot.deactivateItem).toHaveBeenCalled();
  });

  it('поддерживает операции со свободной памятью (memory.remember / recall / getNotes)', async () => {
    const store = [];
    const mockMemoryManager = {
      rememberNote: vi.fn((text) => {
        store.push({ id: 1, content: text });
        return 1;
      }),
      searchNotes: vi.fn((q) => store.filter(s => s.content.includes(q))),
      getNotes: vi.fn(() => store),
      forgetNote: vi.fn((q) => {
        const idx = store.findIndex(s => s.content.includes(q));
        if (idx !== -1) store.splice(idx, 1);
      }),
    };

    const sandbox = new ActionSandbox({
      bot: { version: '1.20.4', entity: { position: { x: 0, y: 64, z: 0 } } },
      memoryManager: mockMemoryManager,
    });

    const res = await sandbox.execute(`
      await memory.remember('нашел пещеру с алмазами на (10, 12, 10)');
      const notes = await memory.getNotes();
      const found = await memory.recall('алмазами');
      return { notesCount: notes.length, first: found[0].content };
    `);

    expect(res.success).toBe(true);
    expect(mockMemoryManager.rememberNote).toHaveBeenCalled();
    expect(res.result.first).toContain('пещеру с алмазами');
  });

  it('рассчитывает и добавляет State-Diff при изменении состояния в скрипте', async () => {
    let pos = { x: 100, y: 64, z: 200 };
    const mockBot = {
      version: '1.20.4',
      get entity() { return { position: pos }; },
      health: 20,
      food: 20,
      inventory: {
        items: () => [{ name: 'bread', count: 5 }],
      },
    };

    const sandbox = new ActionSandbox({ bot: mockBot });
    const res = await sandbox.execute(`
      bot.entity.position.x = 105;
      return 'done';
    `);

    expect(res.success).toBe(true);
    expect(res.result).toContain('[ИТОГ ДЕЙСТВИЯ]');
    expect(res.result).toContain('переместился');
    expect(res.result).toContain('105');
  });
});
