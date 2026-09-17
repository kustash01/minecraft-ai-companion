import { describe, it, expect, vi } from 'vitest';
import { StreamOfConsciousness } from '../../../src/cognition/stream-of-consciousness.js';

describe('StreamOfConsciousness (Autonomous Mind & Agency)', () => {
  it('triggers impulse on teammate death with coordinates and urgency', async () => {
    let processedMessage = null;
    const mockAiBrain = {
      isProcessing: false,
      processMessage: vi.fn((prompt) => {
        processedMessage = prompt;
        return Promise.resolve('ща бегу за вещами');
      }),
    };

    let chatSent = null;
    let deadListener = null;
    const mockBot = {
      username: 'GeminiBot',
      entity: { position: { x: 100, y: 64, z: 200 } },
      chat: vi.fn((msg) => { chatSent = msg; }),
      on: vi.fn((evt, cb) => {
        if (evt === 'entityDead') deadListener = cb;
      }),
      removeListener: vi.fn(),
    };

    const mockMemory = {
      getMemoryContext: vi.fn(() => '• помню базу на 100, 64, 200'),
    };

    const consciousness = new StreamOfConsciousness({
      bot: mockBot,
      aiBrain: mockAiBrain,
      memoryManager: mockMemory,
      config: { minThoughtIntervalMs: 100 },
    });

    consciousness.start();
    expect(mockBot.on).toHaveBeenCalledWith('entityDead', expect.any(Function));

    // Simulate teammate death
    deadListener({
      type: 'player',
      username: 'kustash01',
      position: { x: 150, y: 32, z: 220 },
    });

    // Wait a tick for async triggerImpulse
    await new Promise(r => setTimeout(r, 50));

    expect(mockAiBrain.processMessage).toHaveBeenCalled();
    expect(processedMessage).toContain('kustash01 погиб');
    expect(processedMessage).toContain('[150, 32, 220]');
    expect(processedMessage).toContain('свободой воли');
    expect(mockBot.chat).toHaveBeenCalledWith('ща бегу за вещами');

    consciousness.stop();
  });

  it('triggers idle curiosity impulse when bot has been inactive for a while', async () => {
    let processedMessage = null;
    const mockAiBrain = {
      isProcessing: false,
      processMessage: vi.fn((prompt) => {
        processedMessage = prompt;
        return Promise.resolve('пойду накопаю угля');
      }),
    };

    const mockBot = {
      username: 'GeminiBot',
      entity: { position: { x: 0, y: 64, z: 0 } },
      pathfinder: { isMoving: () => false },
      time: { timeOfDay: 6000 },
      chat: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    const consciousness = new StreamOfConsciousness({
      bot: mockBot,
      aiBrain: mockAiBrain,
      config: { minThoughtIntervalMs: 100, consciousnessCheckIntervalMs: 50 },
    });

    consciousness.start();
    // Set lastActivityTime to 50 seconds ago
    consciousness.lastActivityTime = Date.now() - 50000;

    await consciousness._pulse();

    expect(mockAiBrain.processMessage).toHaveBeenCalled();
    expect(processedMessage).toContain('стоишь без дела');
    expect(processedMessage).toContain('Чего ты хочешь прямо сейчас?');
    consciousness.stop();
  });
});
