const CATEGORIES = new Set(['greeting', 'question', 'thanks', 'apology', 'agreement', 'disagreement', 'help_request', 'conflict', 'farewell', 'casual', 'silence']);

/** Company-owned provenance gate for all social relationship deltas. */
export class SocialRelationshipUpdater {
  constructor({ socialGraph, entities = [], now = () => Date.now(), maxDelta = 0.1 } = {}) {
    if (!socialGraph) throw new TypeError('socialGraph is required');
    this.socialGraph = socialGraph; this.entities = new Set(entities); this.now = now; this.maxDelta = Math.min(0.25, Math.max(0.01, maxDelta)); this.seen = new Set(); this.stats = { observed: 0, accepted: 0, rejected: 0, deduped: 0 };
  }
  observeChat({ observerId, senderId, messageId, category = 'casual', generation, observedAt = this.now() } = {}) {
    if (!this._validIds(observerId, senderId, messageId, generation, observedAt) || !CATEGORIES.has(category)) return this._reject();
    const eventId = `in:${generation}:${observerId}:${messageId}`;
    if (!this._once(eventId)) return this._dedupe();
    const tone = ['thanks', 'apology', 'agreement', 'greeting'].includes(category) ? 'warm' : category === 'conflict' || category === 'disagreement' ? 'cautious' : 'neutral';
    const delta = tone === 'warm' ? { familiarity: 0.03, friendship: 0.02, trust: 0.01 } : tone === 'cautious' ? { irritation: 0.03, trust: -0.02 } : { familiarity: 0.02 };
    const applied = this.socialGraph.applyProvenancedDelta({ from: observerId, to: senderId, changes: delta, event: { type: 'chat_observed', description: category, timestamp: observedAt }, provenance: { source: 'chat_observed', eventId, generation } });
    if (!applied) { this.seen.delete(eventId); return this._reject(); }
    this.stats.observed += 1; return true;
  }
  acceptChatSend({ senderId, outboundId, recipientScope, generation, acceptedAt = this.now() } = {}) {
    const recipients = recipientScope?.recipientIds;
    if (!this.entities.has(senderId) || typeof outboundId !== 'string' || !outboundId || !Number.isSafeInteger(generation) || !Number.isFinite(acceptedAt) || !recipientScope || !['direct', 'named', 'group', 'public'].includes(recipientScope.kind) || !Array.isArray(recipients) || new Set(recipients).size !== recipients.length || recipients.some((to) => !this.entities.has(to) || to === senderId)) return this._reject();
    const eventId = `out:${generation}:${senderId}:${outboundId}`;
    if (!this._once(eventId)) return this._dedupe();
    if (recipients.length === 0) return true;
    for (const to of recipients) if (!this.socialGraph.applyProvenancedDelta({ from: senderId, to, changes: { familiarity: 0.03, friendship: 0.01 }, event: { type: 'chat_send_accepted', timestamp: acceptedAt }, provenance: { source: 'chat_send_accepted', eventId: `${eventId}:${to}`, generation } })) { this.seen.delete(eventId); return this._reject(); }
    this.stats.accepted += recipients.length; return true;
  }
  getStats() { return Object.freeze({ ...this.stats }); }
  _validIds(from, to, id, generation, timestamp) { return this.entities.has(from) && this.entities.has(to) && typeof id === 'string' && id.length > 0 && Number.isSafeInteger(generation) && Number.isFinite(timestamp); }
  _once(key) { if (this.seen.has(key)) return false; this.seen.add(key); return true; }
  _reject() { this.stats.rejected += 1; return false; }
  _dedupe() { this.stats.deduped += 1; return false; }
}
