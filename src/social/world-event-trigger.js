import { stableSocialScore } from './group-conversation-window.js';
import { classifyTopic } from './social-message-classifier.js';

const SILENCE_MS = 8 * 60000;
const DEATH_TOPIC_COOLDOWN_MS = 10 * 60000;
const FIND_TOPIC_COOLDOWN_MS = 10 * 60000;
const DEATH_FEAR_WINDOW_MS = 60000;
const TIME_BUCKETS = Object.freeze(['day', 'sunset', 'night', 'dawn']);
const OTHER_TOPIC_COOLDOWN_MS = 10 * 60000;

function timeBucket(timeOfDay) {
  if (timeOfDay >= 0 && timeOfDay < 11000) return 'day';
  if (timeOfDay >= 11000 && timeOfDay < 13000) return 'sunset';
  if (timeOfDay >= 13000 && timeOfDay < 23000) return 'night';
  return 'dawn';
}

/**
 * Per-agent initiative triggers from real, already-observed facts. Pure
 * scheduling: it never writes the graph, never calls providers, and never
 * invents world facts — it only decides WHEN an agent may consider remarking.
 */
export class WorldEventTrigger {
  constructor({ agentName, profile, personalState, chatBus, now = () => Date.now(), maxRingPerTopic = 8, chanceGate = null } = {}) {
    this.agentName = agentName;
    this.profile = profile || {};
    this.personalState = personalState;
    this.chatBus = chatBus;
    this.now = now;
    this.maxRingPerTopic = maxRingPerTopic;
    this.chanceGate = chanceGate;
    this.lastInboundChatAt = null;
    this.lastTimeBucket = null;
    this.bucketTransitionsSinceUse = new Map();
    this.topicCooldownUntil = new Map();
    this.attemptedBuckets = new Set();
    this.topicRing = new Map();
    this.lastWeather = null;
    this.transitionState = null;
    this.dayCount = 0;
    this.lastSeen = new Map();
    this.onlinePlayers = new Set();
    this.pendingEvents = [];
    // Physical changes are kept as private impulses for future behaviour
    // systems, never queued as chat stimuli.
    this.internalImpulses = [];
    this.bindAt = this.now();
    this.prevFood = null;
    this.prevHealth = null;
  }

  /** Clears transition/edge state and stale attempt latches; cooldowns persist. */
  resetTransitions() {
    this.lastTimeBucket = null;
    this.lastWeather = null;
    this.transitionState = null;
    this.attemptedBuckets.clear();
    this.internalImpulses = [];
    this.prevFood = null;
    this.prevHealth = null;
  }

  noteChatAt(at, topic = 'social') {
    this.lastInboundChatAt = at;
    if (topic && topic !== 'unknown') this._ringTopic(topic, at);
  }

  noteOtherDeath(playerName, at) {
    this._ringTopic('death', at);
    this.pendingEvents.push({ kind: 'death', playerName: String(playerName || '').slice(0, 64), at });
  }

  noteRespawn(at = this.now()) {
    this.pendingEvents.push({ kind: 'respawn', at });
  }

  /** Return and clear private body impulses (hunger / injury). */
  drainInternalImpulses() {
    const impulses = this.internalImpulses;
    this.internalImpulses = [];
    return impulses;
  }

  notePlayerJoined(playerName, at = this.now()) {
    const name = String(playerName || '').slice(0, 64);
    if (!name) return;
    const last = this.lastSeen.get(name);
    this.lastSeen.set(name, at);
    this.onlinePlayers.add(name);
    if (last !== undefined && at - last >= 5 * 60000) {
      this.pendingEvents.push({ kind: 'player_return', playerName: name, awayMs: at - last, at });
    }
  }

  notePlayerLeft(playerName, at = this.now()) {
    const name = String(playerName || '').slice(0, 64);
    if (!name) return;
    this.lastSeen.set(name, at);
    this.onlinePlayers.delete(name);
    this.pendingEvents.push({ kind: 'player_left', playerName: name, at });
  }

  poll({ snapshot, generation, bindingReady }) {
    const now = this.now();
    if (!bindingReady || !snapshot || !Number.isSafeInteger(generation)) return null;
    this._trackTransitions(snapshot, now);
    this._trackBodyState(snapshot, now);
    const sessionBucket = Math.floor((now - this.bindAt) / (30 * 60000));
    const candidates = [];
    const bucket = this.lastTimeBucket;
    if (sessionBucket >= 1) candidates.push({ type: 'session', topic: 'social', timeBucket: `${generation}:session:${sessionBucket}`, allowSilence: true, publiclyRelevant: true });
    // Night and weather remain world state, not conversation invitations.
    // Physical coping belongs to the agent's behavior loop and must not
    // consume a shared social-response claim.
      if (this.transitionState?.dawnEntered && this.dayCount >= 2) candidates.push({ type: 'dawn', topic: 'night', timeBucket: `${generation}:dawn:${this.dayCount}`, data: { dayCount: this.dayCount }, allowSilence: true, publiclyRelevant: true });
      if (this.lastInboundChatAt !== null && now - this.lastInboundChatAt >= SILENCE_MS) candidates.push({ type: 'silence', topic: 'silence', timeBucket: `${generation}:silence:${Math.floor(now / (10 * 60000))}`, allowSilence: true, publiclyRelevant: true });
    while (this.pendingEvents.length) {
      const event = this.pendingEvents.shift();
      const bucketKey = `${generation}:${event.kind}:${event.playerName ?? ''}:${Math.floor(event.at / 60000)}`;
      if (event.kind === 'death') candidates.push({ type: 'death', topic: 'death', timeBucket: bucketKey, data: event.playerName, allowSilence: true, publiclyRelevant: true });
      else if (event.kind === 'respawn') candidates.push({ type: 'respawn', topic: 'death', timeBucket: bucketKey, allowSilence: true, publiclyRelevant: true });
      else candidates.push({ type: event.kind, topic: 'social', timeBucket: bucketKey, data: event.playerName, awayMs: event.awayMs ?? null, allowSilence: true, publiclyRelevant: true });
    }
    for (const candidate of candidates) {
      const stimulus = this._admit(candidate, now);
      if (stimulus) return stimulus;
    }
    return null;
  }

  _admit(candidate, now) {
    const key = `${candidate.type}:${candidate.timeBucket}`;
    if (this.attemptedBuckets.has(key)) { this.personalState.telemetry.cooldownSuppressed += 1; return null; }
    if (!this._cooldownPassed(candidate.topic, now)) { this.personalState.telemetry.cooldownSuppressed += 1; return null; }
    if (this._recentlyDiscussed(candidate.topic, now)) { this.personalState.telemetry.gateSuppressed += 1; return null; }
    if (!this._chance(candidate, now)) { this.personalState.telemetry.gateSuppressed += 1; this.attemptedBuckets.add(key); return null; }
    if (this.chatBus && !this.chatBus.claimResponse(`initiative:${candidate.topic}:${candidate.timeBucket}`)) { this.personalState.telemetry.gateSuppressed += 1; this.attemptedBuckets.add(key); return null; }
    this.attemptedBuckets.add(key);
    this.personalState.telemetry.attempts += 1;
    this._markTopicUse(candidate.topic, now);
    this.transitionState = { ...this.transitionState, [`${candidate.type === 'death' ? 'otherDeath' : candidate.type}Entered`]: false };
    return candidate;
  }

  _trackTransitions(snapshot, now) {
    const bucket = timeBucket(snapshot.timeOfDay ?? 0);
    if (this.lastTimeBucket === null) this.lastTimeBucket = bucket;
    else if (bucket !== this.lastTimeBucket) {
      for (const [topic, count] of this.bucketTransitionsSinceUse) this.bucketTransitionsSinceUse.set(topic, count + 1);
      if (bucket === 'dawn') { this.dayCount += 1; this.transitionState = { ...(this.transitionState || {}), dawnEntered: true }; }
      this.lastTimeBucket = bucket;
    }
    const weather = Boolean(snapshot.isRaining);
    if (this.lastWeather === null) this.lastWeather = weather;
    else if (weather !== this.lastWeather) { this.transitionState = { ...(this.transitionState || {}), weatherChanged: true }; this.lastWeather = weather; }
    if (bucket === 'night') this.transitionState = { ...(this.transitionState || {}), nightEntered: this.transitionState?.nightEntered ?? true };
  }

  _cooldownPassed(topic, now) {
    const until = this.topicCooldownUntil.get(topic) || 0;
    if (now < until) return false;
    if (topic === 'night' || topic === 'weather') {
      const transitions = this.bucketTransitionsSinceUse.get(topic);
      if (transitions !== undefined && transitions < 3) return false;
    }
    return true;
  }

  _markTopicUse(topic, now) {
    const fixed = { find: 1, death: 1, silence: 1, danger: 1, hungry: 1, hurt: 1, respawn: 1, session: 1 };
    if (fixed[topic]) this.topicCooldownUntil.set(topic, now + 20 * 60000);
    else if (topic === 'night' || topic === 'weather') this.bucketTransitionsSinceUse.set(topic, 0);
  }

  _recentlyDiscussed(topic, now) {
    const entries = this.topicRing.get(topic) || [];
    return entries.some((at) => now - at < 5 * 60000);
  }

  _ringTopic(topic, at) {
    const entries = (this.topicRing.get(topic) || []).filter((stamp) => stamp > at - 15 * 60000);
    entries.push(at);
    while (entries.length > this.maxRingPerTopic) entries.shift();
    this.topicRing.set(topic, entries);
  }

  _trackBodyState(snapshot, now) {
    const food = Number.isFinite(snapshot.food) ? snapshot.food : null;
    const health = Number.isFinite(snapshot.health) ? snapshot.health : null;
    if (this.prevFood !== null && food !== null && food <= 6 && this.prevFood > 6) {
      this.internalImpulses.push({ kind: 'hungry', at: now, value: food });
    }
    if (this.prevHealth !== null && health !== null && health <= 6 && this.prevHealth > 6) {
      this.internalImpulses.push({ kind: 'hurt', at: now, value: health });
    }
    this.prevFood = food;
    this.prevHealth = health;
  }

  _chance(candidate) {
    if (this.chanceGate) return this.chanceGate(candidate) === true;
    const traits = this.profile.traits || {};
    const base = candidate.type === 'silence' ? 0.08 : candidate.type === 'death' ? 0.3
      : candidate.type === 'player_return' || candidate.type === 'player_left' ? 0.3
      : candidate.type === 'respawn' ? 0.35 : candidate.type === 'hungry' || candidate.type === 'hurt' ? 0.4
      : candidate.type === 'session' ? 0.12 : candidate.type === 'dawn' ? 0.15 : 0.18;
    let threshold = base + 0.25 * (traits.curiosity ?? 0.5) + 0.15 * (traits.exploration_bias ?? 0.5) + 0.1 * (traits.talkativeness ?? 0.5) + 0.15 * (traits.sociability ?? 0.5);
    if (candidate.topic === 'night') threshold *= 1 - 0.3 * (traits.caution ?? 0.5);
    return stableSocialScore(`${this.agentName}|${candidate.type}|${candidate.timeBucket}`, 'gate', candidate.topic) < Math.floor(threshold * 10000);
  }
}

function bucketCycleKey(now) { return Math.floor(now / (10 * 60000)); }

export { TIME_BUCKETS, DEATH_FEAR_WINDOW_MS, DEATH_TOPIC_COOLDOWN_MS, FIND_TOPIC_COOLDOWN_MS };
