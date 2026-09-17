import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NaturalGazeEngine } from '../../../src/behavior/natural-gaze-engine.js';

describe('NaturalGazeEngine — многофакторные движения головы и саккады', () => {
  let engine;
  let mockBot;

  beforeEach(() => {
    mockBot = {
      entity: {
        position: { x: 0, y: 64, z: 0, offset: vi.fn((dx, dy, dz) => ({ x: dx, y: 64 + dy, z: dz })) },
        yaw: 0,
        pitch: 0,
      },
      entities: {},
      look: vi.fn(async () => {}),
      blockAt: vi.fn(() => ({ name: 'stone' })),
    };
    engine = new NaturalGazeEngine({ bot: mockBot });
  });

  it('позволяет активировать и останавливать цикл наблюдения', () => {
    engine.start(mockBot);
    expect(engine.isRunning).toBe(true);
    engine.stop();
    expect(engine.isRunning).toBe(false);
  });

  it('поддерживает блокировку саккад при точной задаче (task focus lock)', () => {
    engine.setTaskFocus(true);
    expect(engine.isTaskFocused).toBe(true);
    engine.setTaskFocus(false);
    expect(engine.isTaskFocused).toBe(false);
  });

  it('детектирует сущности в периферийном зрении (сектор 30° - 110°)', () => {
    // Враг сбоку под углом ~45°
    mockBot.entities['mob1'] = {
      id: 'mob1',
      type: 'mob',
      name: 'zombie',
      position: {
        x: 5,
        y: 64,
        z: -5,
      },
    };
    mockBot.entity.position.distanceTo = () => 7;

    const detected = engine.detectPeripheralThreat();
    expect(detected).not.toBeNull();
    expect(detected.name).toBe('zombie');
  });

  it('выполняет саккаду оглядывания на бегу с возвратом взгляда', async () => {
    await engine.performRunningSaccade();
    expect(mockBot.look).toHaveBeenCalled();
  });

  it('выполняет взгляд под ноги при проверке обрыва', async () => {
    await engine.performGroundFootingGlance();
    expect(mockBot.look).toHaveBeenCalled();
  });

  it('поддерживает зрительный контакт и его последующий естественный разрыв', () => {
    engine.triggerMutualGaze('player1', 1500);
    expect(engine.mutualGazeTarget).toBe('player1');
    expect(engine.mutualGazeEndTime).toBeGreaterThan(Date.now());
  });

  it('выполняет беглый взгляд на руки при смене слота хотбара', async () => {
    await engine.performHandInspect();
    expect(mockBot.look).toHaveBeenCalled();
  });
});
