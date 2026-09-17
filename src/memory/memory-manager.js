import { LongTermMemory } from './long-term.js';
import { ShortTermMemory } from './short-term.js';
import { POIManager, POITypes } from './poi-manager.js';
import { Diary } from './diary.js';
import { EpisodicMemory } from './episodic.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('MEMORY');

export class MemoryManager {
  constructor(dbPath = null) {
    this.longTerm = new LongTermMemory(dbPath);
    this.shortTerm = new ShortTermMemory();
    this.pois = new POIManager(this.longTerm);
    this.diary = new Diary(this.longTerm);
    this.episodic = new EpisodicMemory(this.longTerm);

    logger.info('Единый менеджер памяти инициализирован');
  }

  /**
   * Возвращает компактный контекст памяти для AI Brain.
   */
  getMemoryContext(currentPos = null, query = null) {
    const parts = [];

    // 0. Свободные мысли, заметки и впечатления (Stream of Thoughts)
    try {
      if (typeof this.longTerm.getRecentNotes === 'function') {
        const notes = this.longTerm.getRecentNotes(6);
        if (notes.length > 0) {
          parts.push('[МОИ МЫСЛИ И ЗАМЕТКИ]');
          for (const n of notes) {
            parts.push(`• ${n.content}`);
          }
        }
      }
    } catch (_) {}

    // 1. Известные POI
    const allPois = this.pois.getPOIs();
    if (allPois.length > 0) {
      parts.push('\n[ИЗВЕСТНЫЕ МЕСТА / POI]');
      for (const poi of allPois.slice(0, 5)) {
        parts.push(`• ${poi.name} (${poi.type}): [${Math.round(poi.x)}, ${Math.round(poi.y)}, ${Math.round(poi.z)}] ${poi.notes ? '- ' + poi.notes : ''}`);
      }
    }

    // 2. Важные факты
    const facts = this.longTerm.getAllFacts();
    if (facts.length > 0) {
      parts.push('\n[ВАЖНЫЕ ФАКТЫ И ДОГОВОРЁННОСТИ]');
      for (const fact of facts.slice(0, 5)) {
        parts.push(`• ${fact.key}: ${fact.value}`);
      }
    }

    // 3. Недавние эпизодические воспоминания
    const episodes = this.episodic.recall(query, 3);
    if (episodes.length > 0) {
      parts.push('\n[НЕДАВНИЕ СОБЫТИЯ]');
      for (const ep of episodes) {
        parts.push(`• [День ${ep.mc_day || '?'}] ${ep.summary}`);
      }
    }

    // 4. Активный план
    const plan = this.shortTerm.getPlan();
    if (plan) {
      parts.push(`\n[ТЕКУЩИЙ ПЛАН]\nЦель: ${plan.goal}`);
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        const mark = step.status === 'completed' ? '✓' : step.status === 'in_progress' ? '►' : '○';
        parts.push(`${mark} Шаг ${i + 1}: ${step.description}`);
      }
    }

    return parts.join('\n');
  }

  // Свободная память
  rememberNote(content, tags = '', importance = 5) {
    return this.longTerm.addNote(content, tags, importance);
  }

  getNotes(limit = 10) {
    return this.longTerm.getRecentNotes(limit);
  }

  searchNotes(query, limit = 5) {
    return this.longTerm.searchNotes(query, limit);
  }

  forgetNote(idOrSubstring) {
    return this.longTerm.deleteNote(idOrSubstring);
  }

  search(query = '', limit = 3) {
    return this.episodic ? this.episodic.recall(query, limit) : [];
  }

  savePOI(name, x, y, z, notes = '', type = 'base') {
    return this.pois.addPOI(name, type, { x, y, z }, notes);
  }

  getPOI(name) {
    return this.pois.findByName(name) || (name === 'base' ? this.pois.getBase() : null);
  }

  close() {
    this.longTerm.close();
  }
}

export { POITypes };
