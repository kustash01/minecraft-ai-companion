import { classifySocialMessage } from './social-message-classifier.js';

// Stable selection keeps a chat line lively without making six agents answer at once.
export class ConversationRouter {
  constructor({ agentNames = [], maxPublicResponders = 2 } = {}) {
    this.agentNames = [...agentNames];
    this.maxPublicResponders = Math.max(1, maxPublicResponders);
  }

  route(message, { agentName } = {}) {
    const text = String(message?.content || '').trim();
    const addressing = this._addressing(text, agentName);
    if (addressing.kind === 'direct') return { kind: 'direct', recipientIds: [addressing.target] };
    if (addressing.kind === 'named') return { kind: 'public', recipientIds: [] };
    if (addressing.kind === 'group') return { kind: 'group', recipientIds: [...this.agentNames] };

    const messageClass = classifySocialMessage(message || { content: text });
    if (messageClass.speechAct === 'silence') return { kind: 'public', recipientIds: [] };
    const ranked = this.agentNames
      .map((name) => ({ name, score: hash(`${message?.messageId || text}:${name}`) }))
      .sort((a, b) => a.score - b.score)
      .slice(0, this.maxPublicResponders);
    return { kind: 'public', recipientIds: ranked.map((item) => item.name), messageClass };
  }

  _addressing(text, agentName) {
    const lower = text.toLowerCase();
    if (/(^|\s)(ребята|ребят|парни|команда)(?=$|[\s,!?:;.])/i.test(lower)) return { kind: 'group' };
    const aliases = { sam: ['сэм', 'сэмми', 'сам'], max: ['макс', 'максим'], jack: ['джек', 'джеки'], ryan: ['райан', 'райн'], alex: ['алекс', 'саша'], leo: ['лео', 'леон'] };
    const hasName = (name) => [name.toLowerCase(), ...(aliases[name.toLowerCase()] || [])]
      .some((alias) => new RegExp(`(^|\\s)${alias}(?=($|[\\s,!?:;.]))`, 'i').test(lower));
    if (agentName && hasName(agentName)) return { kind: 'direct', target: agentName };
    if (this.agentNames.some((name) => name !== agentName && hasName(name))) return { kind: 'named' };
    return { kind: 'public' };
  }
}

function hash(value) {
  let result = 2166136261;
  for (const char of value) { result ^= char.charCodeAt(0); result = Math.imul(result, 16777619); }
  return result >>> 0;
}
