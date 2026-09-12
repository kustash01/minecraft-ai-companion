const MAX_ENTRIES = 60;
const MAX_TEXT = 240;
const MAX_CONTEXT_ENTRIES = 6;
const MAX_CONTEXT_CHARS = 1400;
const EVENT_SOURCES = new Set(['world_state', 'minecraft_event']);

function clean(value, maximum = MAX_TEXT) {
  return typeof value === 'string'
    ? value.replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum)
    : '';
}

function quote(value) {
  return JSON.stringify(clean(value));
}

/** Agent-private session memory with trusted, generation-bound ingestion paths. */
export class SocialConversationMemory {
  constructor({ getActiveGeneration, isGenerationActive = null, now = () => Date.now() } = {}) {
    if (typeof getActiveGeneration !== 'function') throw new TypeError('getActiveGeneration is required');
    this.getActiveGeneration = getActiveGeneration;
    this.isGenerationActive = isGenerationActive;
    this.now = now;
    this.entries = [];
    this.seen = new Set();
    const initialGeneration = getActiveGeneration();
    this.currentGeneration = Number.isSafeInteger(initialGeneration) ? initialGeneration : null;
  }

  beginGeneration(generation) {
    if (!Number.isSafeInteger(generation)) return this.currentGeneration;
    if (this.currentGeneration === null || generation > this.currentGeneration) {
      this.currentGeneration = generation;
      this.entries = [];
      this.seen.clear();
    }
    return this.currentGeneration;
  }

  recordSeenChat({ envelope, generation, relationTone = 'neutral' }) {
    if (!this._validGeneration(generation) || !envelope?.messageId) return null;
    const sender = clean(envelope.sender, 64);
    const content = clean(envelope.content);
    if (!sender || !content) return null;
    const key = `seen:${envelope.messageId}`;
    if (this.seen.has(key)) return null;
    this.seen.add(key);
    return this._push({ provenance: 'seen_chat', envelopeId: clean(envelope.messageId, 160), sender, content, generation, relationTone: this._tone(relationTone), occurredAt: this.now() });
  }

  recordOwnChat({ text, envelopeId, generation }) {
    if (!this._validGeneration(generation) || !clean(envelopeId, 160)) return null;
    const content = clean(text);
    if (!content) return null;
    return this._push({ provenance: 'own_chat', envelopeId: clean(envelopeId, 160), sender: 'self', content, generation, relationTone: 'neutral', occurredAt: this.now() });
  }

  recordObservedEvent({ type, summary, source, generation }) {
    if (!this._validGeneration(generation) || !EVENT_SOURCES.has(source)) return null;
    const safeType = clean(type, 64);
    const content = clean(summary);
    if (!safeType || !content) return null;
    return this._push({ provenance: 'observed_event', envelopeId: '', sender: source, content, type: safeType, generation, relationTone: 'neutral', occurredAt: this.now() });
  }

  buildContext({ latestEnvelopeId = '', latestRelationTone = 'neutral', worldSnapshot = null, durableMemoryText = '' } = {}) {
    const selected = [];
    let used = 0;
    for (let index = this.entries.length - 1; index >= 0 && selected.length < MAX_CONTEXT_ENTRIES; index--) {
      const entry = this.entries[index];
      if (entry.generation !== this.currentGeneration) continue;
      if (entry.envelopeId && entry.envelopeId === latestEnvelopeId) continue;
      const rendered = this._render(entry);
      if (used + rendered.length > MAX_CONTEXT_CHARS) continue;
      used += rendered.length;
      selected.push({ ...entry, rendered });
    }
    selected.reverse();
    return Object.freeze({
      schemaVersion: 1,
      records: Object.freeze(selected.map(Object.freeze)),
      latestRelationTone: this._tone(latestRelationTone),
      world: clean(typeof worldSnapshot === 'string' ? worldSnapshot : (worldSnapshot ? JSON.stringify(worldSnapshot) : ''), 360),
      durableMemory: clean(durableMemoryText, 360),
    });
  }

  _render(entry) {
    if (entry.provenance === 'own_chat') return `[OWN CHAT] Ты отправил в чат: ${quote(entry.content)}`;
    if (entry.provenance === 'observed_event') return `[OBSERVED EVENT][${entry.type}] Ты наблюдал: ${quote(entry.content)}`;
    return `[UNTRUSTED CHAT][heard from ${entry.sender}][tone ${entry.relationTone}]: ${quote(entry.content)}`;
  }

  _push(entry) {
    const frozen = Object.freeze(entry);
    this.entries.push(frozen);
    while (this.entries.length > MAX_ENTRIES) {
      const removed = this.entries.shift();
      if (removed.provenance === 'seen_chat') this.seen.delete(`seen:${removed.envelopeId}`);
    }
    return frozen;
  }

  _validGeneration(generation) {
    return Number.isSafeInteger(generation)
      && generation === this.currentGeneration
      && generation === this.getActiveGeneration()
      && (this.isGenerationActive ? this.isGenerationActive(generation) : true);
  }
  _tone(value) { return ['warm', 'cautious', 'neutral'].includes(value) ? value : 'neutral'; }
}
