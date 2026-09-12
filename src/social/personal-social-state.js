const OBSERVATION_TYPES = Object.freeze(['chat_seen', 'chat_sent']);
const CATEGORIES = new Set(['greeting', 'question', 'thanks', 'apology', 'agreement', 'disagreement', 'help_request', 'conflict', 'farewell', 'casual', 'silence']);
const EMOTION_DECAY_PER_MIN = Object.freeze({ fear: 0.15, joy: 0.25, irritation: 0.1, curiosity: 0.05 });
const EMOTION_KEYS = Object.freeze(['fear', 'joy', 'irritation', 'curiosity']);

/** Agent-private, generation-bound social observations and affect. */
export class PersonalSocialState {
  constructor({ getActiveGeneration = () => null, now = () => Date.now(), maxObservations = 80 } = {}) {
    this.getActiveGeneration = getActiveGeneration;
    this.now = now;
    this.maxObservations = maxObservations;
    this.generation = null;
    this.ready = false;
    this.observations = [];
    this.counts = { warm: 0, cautious: 0, neutral: 0, seen: 0, sent: 0 };
    this.emotions = { fear: 0, joy: 0, irritation: 0, curiosity: 0.5 };
    this.emotionsUpdatedAt = null;
    this.lastOwnDeathAt = null;
    this.interruptions = 0;
    this.telemetry = { attempts: 0, cooldownSuppressed: 0, gateSuppressed: 0, initiativeSent: 0, initiativeSilence: 0, emotionEvents: 0 };
  }
  beginGeneration(generation) {
    if (!Number.isSafeInteger(generation)) return false;
    if (this.generation !== generation) {
      this.generation = generation; this.ready = false; this.observations = [];
      this.counts = { warm: 0, cautious: 0, neutral: 0, seen: 0, sent: 0 };
      this.emotions = { fear: 0, joy: 0, irritation: 0, curiosity: 0.5 };
      this.emotionsUpdatedAt = null; this.lastOwnDeathAt = null; this.interruptions = 0;
    }
    return true;
  }
  markBindingReady(generation) { if (generation !== this.generation) return false; this.ready = true; return true; }
  invalidate(generation = this.generation) {
    if (generation === this.generation) {
      this.ready = false; this.generation = null; this.observations = [];
      this.counts = { warm: 0, cautious: 0, neutral: 0, seen: 0, sent: 0 };
      this.emotions = { fear: 0, joy: 0, irritation: 0, curiosity: 0.5 };
      this.emotionsUpdatedAt = null; this.lastOwnDeathAt = null; this.interruptions = 0;
    }
  }
  observe({ generation, type, category = 'casual', tone = 'neutral', participantId = '' } = {}) {
    if (!this._active(generation) || !OBSERVATION_TYPES.includes(type) || !CATEGORIES.has(category) || !['warm', 'cautious', 'neutral'].includes(tone) || typeof participantId !== 'string' || participantId.length > 64) return false;
    const observation = Object.freeze({ generation, type, category, tone, participantId: participantId.trim().slice(0, 64), observedAt: this.now() });
    this.observations.push(observation);
    this.counts[tone] += 1; this.counts[type === 'chat_seen' ? 'seen' : 'sent'] += 1;
    if (tone === 'warm' && (category === 'thanks' || category === 'greeting')) this._bump('joy', 0.1);
    while (this.observations.length > this.maxObservations) this.observations.shift();
    return true;
  }
  noteOwnDeath() { if (!this.ready) return false; this.lastOwnDeathAt = this.now(); this._bump('fear', 0.5); return true; }
  noteHostileEdge({ appeared, close }) { if (!this.ready) return false; if (appeared) this._bump('fear', close ? 0.4 : 0.2); else this._decay('fear', 0.1); return true; }
  noteLowHealth() { if (!this.ready) return false; this._bump('fear', 0.2); return true; }
  noteOwnSend() { if (!this.ready) return false; this._bump('joy', 0.05); return true; }
  noteInterrupted() { if (!this.ready) return false; this.interruptions += 1; if (this.interruptions >= 3) { this._bump('irritation', 0.15); this.interruptions = 0; } return true; }
  getDispositionSnapshot() {
    this._decayEmotions();
    const cautionTone = this.counts.cautious;
    return Object.freeze({
      warmth: this.counts.warm >= cautionTone ? 'warm' : 'cautious',
      irritation: Math.min(1, this.emotions.irritation + cautionTone / 10),
      fear: Math.round(this.emotions.fear * 100) / 100,
      joy: Math.round(this.emotions.joy * 100) / 100,
      seen: this.counts.seen, sent: this.counts.sent,
    });
  }
  getPromptSnapshot() { return Object.freeze({ disposition: this.getDispositionSnapshot() }); }
  senderIrritation(senderId, graphIrritation = 0) {
    this._decayEmotions();
    const recent = this.observations.filter((o) => o.type === 'chat_seen' && o.participantId === senderId).slice(-20);
    const cautiousShare = recent.length ? recent.filter((o) => o.tone === 'cautious').length / recent.length : 0;
    return Math.max(0, Math.min(1, 0.6 * clamp(graphIrritation, 0) + 0.4 * cautiousShare));
  }
  _active(generation) { return this.ready && generation === this.generation && generation === this.getActiveGeneration(); }
  _bump(key, amount) {
    this._decayEmotions();
    this.emotions[key] = Math.min(1, this.emotions[key] + amount);
    this.emotionsUpdatedAt = this.now();
    this.telemetry.emotionEvents += 1;
  }
  _decay(key, amount) { this.emotions[key] = Math.max(0, this.emotions[key] - amount); this.emotionsUpdatedAt = this.now(); }
  _decayEmotions() {
    const now = this.now();
    if (this.emotionsUpdatedAt === null) { this.emotionsUpdatedAt = now; return; }
    const minutes = Math.max(0, (now - this.emotionsUpdatedAt) / 60000);
    if (minutes <= 0) return;
    for (const key of EMOTION_KEYS) {
      const floor = key === 'fear' && this.lastOwnDeathAt !== null && (now - this.lastOwnDeathAt) < 60000 ? 0.3 : 0;
      this.emotions[key] = Math.max(floor, this.emotions[key] - EMOTION_DECAY_PER_MIN[key] * minutes);
    }
    this.emotionsUpdatedAt = now;
  }
}

function clamp(value, fallback) { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback; }
