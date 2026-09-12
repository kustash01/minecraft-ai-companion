import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoopDetector } from '../../../src/safety/loop-detector.js';
import { DeathHandler } from '../../../src/safety/death-handler.js';
import { EmergencyController } from '../../../src/safety/emergency.js';
import { MemoryManager } from '../../../src/memory/memory-manager.js';
import { createMockBot } from '../../mocks/mock-bot.js';

describe('Safety & Emergency Systems', () => {
  describe('LoopDetector', () => {
    let detector;

    beforeEach(() => {
      detector = new LoopDetector(4);
    });

    it('should not trigger on different tool calls', () => {
      expect(detector.recordAndCheck('move_to', { x: 10, y: 64, z: 20 })).toBe(false);
      expect(detector.recordAndCheck('move_to', { x: 15, y: 64, z: 25 })).toBe(false);
      expect(detector.recordAndCheck('mine_block', { blockName: 'dirt' })).toBe(false);
      expect(detector.recordAndCheck('mine_block', { blockName: 'stone' })).toBe(false);
    });

    it('should detect loop when same tool called with same args 4 times in a row', () => {
      expect(detector.recordAndCheck('mine_block', { blockName: 'iron_ore' })).toBe(false);
      expect(detector.recordAndCheck('mine_block', { blockName: 'iron_ore' })).toBe(false);
      expect(detector.recordAndCheck('mine_block', { blockName: 'iron_ore' })).toBe(false);
      expect(detector.recordAndCheck('mine_block', { blockName: 'iron_ore' })).toBe(true);
    });
  });

  describe('DeathHandler', () => {
    let deathHandler;
    let memoryManager;
    let mockBot;

    beforeEach(() => {
      memoryManager = new MemoryManager(':memory:');
      mockBot = createMockBot();
      deathHandler = new DeathHandler(mockBot, memoryManager, { bot: { owner: 'kustash01' } });
    });

    it('should record player death as POI and episodic memory', () => {
      deathHandler.handlePlayerDeath('kustash01', { x: 120, y: 30, z: 240 });

      const pois = memoryManager.pois.getPOIs();
      expect(pois.length).toBeGreaterThan(0);
      expect(pois[0].name).toContain('Место гибели');
      expect(pois[0].x).toBe(120);

      const episodes = memoryManager.episodic.recall('погиб');
      expect(episodes.length).toBeGreaterThan(0);
    });

    it('should detect repeated bot deaths and trigger loop protection', () => {
      expect(deathHandler.handleBotDeath()).toBe(true);
      expect(deathHandler.handleBotDeath()).toBe(true);
      // 3rd death in short window triggers deathloop protection
      expect(deathHandler.handleBotDeath()).toBe(false);
    });
  });

  describe('EmergencyController', () => {
    let emergency;
    let mockBot;
    let stopped;

    beforeEach(() => {
      mockBot = createMockBot();
      stopped = false;
      mockBot.pathfinder.stop = () => { stopped = true; };

      emergency = new EmergencyController({
        bot: mockBot,
        planner: { cancelPlan: () => {} },
        aiBrain: { stop: () => {} },
      });
    });

    it('should stop pathfinder and halt actions on emergency stop', () => {
      const result = emergency.emergencyStop('Опасность');
      expect(result).toBe(true);
      expect(stopped).toBe(true);
    });

    it('should pause and resume actions', () => {
      expect(emergency.isPaused).toBe(false);
      emergency.pause();
      expect(emergency.isPaused).toBe(true);
      emergency.resume();
      expect(emergency.isPaused).toBe(false);
    });
  });
});
