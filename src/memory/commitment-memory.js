import { createLogger } from '../utils/logger.js';

const logger = createLogger('COMMITMENTS');

/**
 * CommitmentMemory — «обещания и договорённости».
 *
 * Когда владелец просит что-то на потом («потом построй забор», «не забудь
 * набрать камня»), бот запоминает это как обещание. Позже он сам может о нём
 * вспомнить. Со временем детали «стираются» (живая память): старое обещание
 * возвращается с пометкой, что деталь подзабылась — а точные слова всегда
 * формулирует LLM, здесь НЕТ ни одной готовой фразы.
 *
 * Хранится в существующей таблице facts (category='commitment'), без новой БД.
 */
export class CommitmentMemory {
  constructor(memoryManager) {
    this.mm = memoryManager;
    this.lt = memoryManager?.longTerm || null;
  }

  _key(id) {
    return `commitment:${id}`;
  }

  /**
   * Запомнить обещание. `text` — суть просьбы своими словами (не реплика бота).
   */
  remember(text, { requestedBy = null, importance = 0.6 } = {}) {
    if (!this.lt || !text) return null;
    try {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const record = {
        id,
        text: String(text).slice(0, 240),
        requestedBy,
        importance,
        createdAt: Date.now(),
        done: false,
      };
      this.lt.setFact(this._key(id), record, 'commitment');
      logger.info(`[COMMITMENT] Запомнил обещание: "${record.text}"`);
      return record;
    } catch (err) {
      logger.warn(`Не удалось сохранить обещание: ${err.message}`);
      return null;
    }
  }

  /**
   * Все активные (невыполненные) обещания, свежие сначала.
   */
  listOpen() {
    if (!this.lt) return [];
    try {
      const rows = this.lt.getAllFacts().filter(r => r.category === 'commitment');
      const out = [];
      for (const r of rows) {
        let rec;
        try { rec = JSON.parse(r.value); } catch { continue; }
        if (rec && !rec.done) out.push(rec);
      }
      return out.sort((a, b) => b.createdAt - a.createdAt);
    } catch (err) {
      logger.debug(`listOpen error: ${err.message}`);
      return [];
    }
  }

  /**
   * Пометить обещание выполненным (или отменённым).
   */
  resolve(id) {
    if (!this.lt || !id) return false;
    try {
      const raw = this.lt.getFact(this._key(id));
      if (!raw) return false;
      const rec = typeof raw === 'string' ? JSON.parse(raw) : raw;
      rec.done = true;
      rec.resolvedAt = Date.now();
      this.lt.setFact(this._key(id), rec, 'commitment');
      return true;
    } catch (err) {
      logger.debug(`resolve error: ${err.message}`);
      return false;
    }
  }

  /**
   * Готовый фрагмент контекста для LLM: что бот пообещал и ещё не сделал.
   * Старые обещания (> ~20 мин реального времени) помечаются как подзабытые,
   * чтобы модель могла вспомнить их неуверенно — как живой человек. Текст самой
   * реплики модель формулирует сама; здесь только факты + пометка ясности.
   */
  getContextForPrompt(now = Date.now()) {
    const open = this.listOpen();
    if (open.length === 0) return null;
    const lines = open.slice(0, 5).map(rec => {
      const ageMin = (now - rec.createdAt) / 60000;
      const hazy = ageMin > 20; // деталь подзабылась
      const who = rec.requestedBy ? ` (просил ${rec.requestedBy})` : '';
      return hazy
        ? `- ${rec.text}${who} [давно, деталь помнишь смутно]`
        : `- ${rec.text}${who}`;
    });
    return `Ты пообещал и ещё не сделал:\n${lines.join('\n')}`;
  }
}
