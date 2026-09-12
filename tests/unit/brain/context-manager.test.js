import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager } from '../../../src/brain/context-manager.js';

// Minimal config for test
const testConfig = {
  bot: { owner: 'kustash01', language: 'ru' },
  minecraft: { username: 'GeminiBot' },
};

// Mock WorldState
const mockWorldState = {
  position: { x: 100, y: 64, z: 200 },
  health: 18,
  food: 15,
  timeOfDay: 6000,
  isRaining: false,
  nearbyEntities: [
    { name: 'kustash01', type: 'player', distance: 5 },
    { name: 'zombie', type: 'mob', distance: 12 },
  ],
  inventory: [
    { name: 'diamond_pickaxe', count: 1 },
    { name: 'cobblestone', count: 64 },
  ],
  getSummary() {
    return 'Позиция: [100, 64, 200]. Здоровье: 18/20, Еда: 15/20. Время: Утро, Погода: Ясно. Инвентарь: 1x diamond_pickaxe, 64x cobblestone. Рядом: kustash01, zombie';
  },
  getInventorySummary() {
    return '1x diamond_pickaxe, 64x cobblestone';
  },
};

describe('ContextManager', () => {
  let manager;

  beforeEach(() => {
    manager = new ContextManager(testConfig);
  });

  it('should build context with world state', () => {
    const context = manager.buildContext(mockWorldState, null, []);
    expect(context).toContain('СОСТОЯНИЕ МИРА');
    expect(context).toContain('100');
    expect(context).toContain('18/20');
  });

  it('should include current task when provided', () => {
    const context = manager.buildContext(mockWorldState, 'Добыть железо', []);
    expect(context).toContain('ТЕКУЩАЯ ЗАДАЧА');
    expect(context).toContain('Добыть железо');
  });

  it('should handle null world state', () => {
    const context = manager.buildContext(null, null, []);
    expect(context).toContain('СОСТОЯНИЕ МИРА');
  });

  it('should add and retrieve history', () => {
    manager.addToHistory('user', 'Привет!');
    manager.addToHistory('bot', 'Привет, kustash01!');
    expect(manager.recentHistory).toHaveLength(2);
  });

  it('should limit history size', () => {
    for (let i = 0; i < 30; i++) {
      manager.addToHistory('user', `Сообщение ${i}`);
    }
    expect(manager.recentHistory.length).toBeLessThanOrEqual(20);
  });

  it('should include history in context', () => {
    manager.addToHistory('user', 'Найди железо');
    manager.addToHistory('bot', 'Ищу железную руду поблизости');
    const context = manager.buildContext(mockWorldState, null, []);
    expect(context).toContain('НЕДАВНЯЯ ИСТОРИЯ');
    expect(context).toContain('железо');
  });

  it('should clear history', () => {
    manager.addToHistory('user', 'test');
    manager.clearHistory();
    expect(manager.recentHistory).toHaveLength(0);
  });
});
