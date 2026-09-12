import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('MESSAGE_BUS');

export const MessageOrigin = {
  PLAYER: 'PLAYER',
  BOT_REAL_CHAT: 'BOT_REAL_CHAT',
  SYSTEM: 'SYSTEM',
  INTERNAL: 'INTERNAL',
};

export const MessageChannel = {
  PUBLIC: 'public',
  WHISPER: 'whisper',
  SYSTEM: 'system',
  INTERNAL: 'internal',
};

/**
 * MessageBus — единая шина сообщений с контролем происхождения (provenance),
 * дедупликацией сообщений и строгим разделением восприятия и отправки.
 */
export class MessageBus extends EventEmitter {
  constructor() {
    super();
    this.seenMessageIds = new Set();
    this.maxSeenCache = 1000;
    this.agentSeenMap = new Map(); // agentName -> Set<messageId>
    this.responseClaims = new Set();
  }

  /**
   * Генерация уникального ID сообщения
   */
  generateMessageId(sender, content, timestamp = Date.now()) {
    // Stable short-lived id: duplicate event emissions for the same chat line
    // must address one logical message, even when handlers run milliseconds apart.
    const bucket = Math.floor(timestamp / 2000);
    return `${sender}:${bucket}:${String(content).trim().toLowerCase()}`;
  }

  /**
   * Публикация полученного из Minecraft чата сообщения (chat_received)
   * @param {Object} payload
   * @param {string} payload.sender
   * @param {string} payload.content
   * @param {string} [payload.origin]
   * @param {string} [payload.channel]
   * @param {string} [payload.target]
   */
  emitChatReceived({
    sender,
    content,
    origin = MessageOrigin.PLAYER,
    channel = MessageChannel.PUBLIC,
    target = null,
    timestamp = Date.now(),
    messageId = null,
  }) {
    const stableMessageId = messageId || this.generateMessageId(sender, content, timestamp);

    const message = {
      messageId: stableMessageId,
      sender,
      content,
      origin,
      channel,
      target,
      timestamp,
    };

    logger.debug(`[CHAT_RECEIVED] (${origin}) ${sender}: "${content}" [id: ${stableMessageId}]`);
    this.emit('chat_received', message);
    return message;
  }

  /**
   * Проверка: обрабатывал ли конкретный агент это сообщение ранее (дедупликация)
   * @param {string} agentName
   * @param {string} messageId
   * @returns {boolean} true если сообщение новое, false если дубликат
   */
  markProcessed(agentName, messageId) {
    if (!this.agentSeenMap.has(agentName)) {
      this.agentSeenMap.set(agentName, new Set());
    }

    const seen = this.agentSeenMap.get(agentName);
    if (seen.has(messageId)) {
      return false; // Уже было обработано
    }

    seen.add(messageId);
    if (seen.size > 200) {
      const first = seen.values().next().value;
      seen.delete(first);
    }
    return true; // Новое сообщение
  }

  /** Allow one natural-language responder for an unaddressed chat line. */
  claimResponse(messageId) {
    if (this.responseClaims.has(messageId)) return false;
    this.responseClaims.add(messageId);
    if (this.responseClaims.size > this.maxSeenCache) {
      const first = this.responseClaims.values().next().value;
      this.responseClaims.delete(first);
    }
    return true;
  }

  /**
   * Проверка адресации сообщения: адресовано ли оно конкретному агенту, группе или всем
   * @param {string} content
   * @param {string} agentName
   * @param {string[]} allAgentNames
   * @returns {{ isAddressedToMe: boolean, isGroupMessage: boolean, targetName: string|null }}
   */
  checkAddressing(content, agentName, allAgentNames = []) {
    const lower = content.toLowerCase().trim();
    const myNameLower = agentName.toLowerCase();
    const aliases = {
      sam: ['сэм', 'сэмми', 'сам'],
      max: ['макс', 'максим'],
      jack: ['джек', 'джеки'],
      ryan: ['райан', 'райн'],
      alex: ['алекс', 'саша'],
      leo: ['лео', 'леон'],
    };
    const hasAddress = (name) => {
      const names = [name.toLowerCase(), ...(aliases[name.toLowerCase()] || [])];
      return names.some((alias) => new RegExp(`(^|\\s)${alias}(?=($|[\\s,!?:;.]))`, 'i').test(lower));
    };

    // 1. Проверка прямого обращения к боту (например: "Sam,", "Sam ", "Sam!")
    if (hasAddress(agentName)) {
      return { isAddressedToMe: true, isGroupMessage: false, targetName: agentName, routing: { kind: 'direct', recipientIds: [agentName] } };
    }

    // 2. Проверка обращения к другому конкретному боту
    for (const other of allAgentNames) {
      if (other.toLowerCase() === myNameLower) continue;
      if (hasAddress(other)) {
        return { isAddressedToMe: false, isGroupMessage: false, targetName: other, routing: { kind: 'named', recipientIds: [other] } };
      }
    }

    // 3. Проверка группового обращения
    const groupKeywords = ['ребят', 'парни', 'народ', 'боты', 'все', 'команда', 'друзья', 'everyone', 'all'];
    const isGroup = groupKeywords.some(kw => lower.includes(kw));

    return {
      isAddressedToMe: isGroup || false,
      isGroupMessage: isGroup,
      targetName: isGroup ? 'group' : null,
      routing: { kind: isGroup ? 'group' : 'public', recipientIds: isGroup ? allAgentNames.filter((name) => name !== agentName) : [] },
    };
  }
}

export const messageBus = new MessageBus();
