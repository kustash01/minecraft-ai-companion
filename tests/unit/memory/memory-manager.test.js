import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryManager, POITypes } from '../../../src/memory/memory-manager.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testDbPath = path.join(__dirname, 'test_memory.db');

describe('MemoryManager and LongTermMemory', () => {
  let memory;

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    memory = new MemoryManager(testDbPath);
  });

  afterEach(() => {
    if (memory) memory.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  it('should save and retrieve POIs', () => {
    memory.pois.addPOI('Дом', POITypes.BASE, { x: 100, y: 64, z: 200 }, 'Главный сундук и кровать');
    memory.pois.addPOI('Шахта', POITypes.MINE, { x: 150, y: 32, z: 220 }, 'Вход в пещеру с железом');

    const allPois = memory.pois.getPOIs();
    expect(allPois).toHaveLength(2);

    const base = memory.pois.getBase();
    expect(base).toBeDefined();
    expect(base.name).toBe('Дом');
    expect(base.x).toBe(100);

    const nearest = memory.pois.findNearest({ x: 140, y: 40, z: 215 });
    expect(nearest.name).toBe('Шахта');
  });

  it('should save and retrieve facts and player profile', () => {
    memory.longTerm.setFact('любимый_ресурс', 'алмазы');
    expect(memory.longTerm.getFact('любимый_ресурс')).toBe('алмазы');

    memory.longTerm.setPlayerPreference('playstyle', 'builder');
    expect(memory.longTerm.getPlayerPreference('playstyle')).toBe('builder');
  });

  it('should save and recall episodic memories', () => {
    memory.episodic.rememberEpisode({
      mcDay: 5,
      eventType: 'discovery',
      summary: 'Кусташ и я нашли алмазы на глубине -58',
      position: { x: 120, y: -58, z: 300 },
      importance: 8,
    });

    const episodes = memory.episodic.recall('алмазы');
    expect(episodes).toHaveLength(1);
    expect(episodes[0].summary).toContain('алмазы');
  });

  it('should save and read diary entries', () => {
    memory.diary.logEntry(1, 'Начало пути', 'Мы заспавнились в дубовом лесу и срубили первое дерево.');
    const entries = memory.diary.getRecentEntries(5);
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe('Начало пути');

    const summary = memory.diary.getFormattedSummary();
    expect(summary).toContain('Начало пути');
  });

  it('should generate formatted memory context for AI Brain', () => {
    memory.pois.addPOI('Дом', POITypes.BASE, { x: 0, y: 64, z: 0 });
    memory.longTerm.setFact('договорённость', 'строим замок');
    
    const context = memory.getMemoryContext();
    expect(context).toContain('ИЗВЕСТНЫЕ МЕСТА');
    expect(context).toContain('Дом');
    expect(context).toContain('строим замок');
  });
});
