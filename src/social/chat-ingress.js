function normalize(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function fingerprint(sender, content) {
  let hash = 2166136261;
  for (const char of `${normalize(sender)}\u0000${normalize(content)}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** Canonicalizes the same server chat line for one company instance. */
export class ChatIngress {
  constructor({ now = () => Date.now(), debounceMs = 750, maxEntries = 1000 } = {}) {
    this.now = now;
    this.debounceMs = debounceMs;
    this.maxEntries = maxEntries;
    this.sequence = 0;
    this.recent = new Map();
  }

  getEnvelopeId(sender, content, observedAt = this.now()) {
    this.cleanup(observedAt);
    const key = fingerprint(sender, content);
    const prior = this.recent.get(key);
    if (prior && observedAt - prior.observedAt < this.debounceMs) return prior.id;
    const id = `chat:${++this.sequence}:${key}`;
    this.recent.set(key, { id, observedAt });
    if (this.recent.size > this.maxEntries) this.recent.delete(this.recent.keys().next().value);
    return id;
  }

  cleanup(now = this.now()) {
    for (const [key, entry] of this.recent) {
      if (now - entry.observedAt >= this.debounceMs) this.recent.delete(key);
    }
  }

  clear() { this.recent.clear(); }
}
