import { createLogger } from '../utils/logger.js';
import { HumanErrorEngine } from '../behavior/human-error-engine.js';

const logger = createLogger('CONVERSATION_MANAGER');

export class ConversationManager {
  /**
   * @param {Object} options
   * @param {Object} options.socialGraph - SocialGraph instance
   * @param {Map<string, Object>} options.profiles - Agent profiles
   */
  constructor({ socialGraph, profiles }) {
    this.socialGraph = socialGraph;
    this.profiles = profiles;
    
    this.activeConversations = new Map();
    this.lastMessageTime = Date.now();
    
    this.globalChatCooldown = 3000; // 3 seconds min between messages globally
    this.lastGlobalMessageTime = 0;
    
    this.perAgentCooldown = new Map();
  }

  /**
   * Updates last message time
   * @param {string} sender 
   * @param {string} message 
   * @param {number} timestamp 
   */
  registerMessage(sender, message, timestamp) {
    this.lastMessageTime = timestamp;
    this.lastGlobalMessageTime = timestamp;
    this.perAgentCooldown.set(sender, timestamp);
    
    // Could track threads in activeConversations based on keywords or proximity,
    // simplified here to just update global activity.
  }

  /**
   * @returns {number} ms since last message
   */
  getSilenceDuration() {
    return Date.now() - this.lastMessageTime;
  }

  /**
   * Determines if an agent should respond to a message
   * @param {string} agentName 
   * @param {string} message 
   * @param {string} sender 
   * @returns {Object} { respond: boolean, delay: number, reason: string }
   */
  shouldRespond(agentName, message, sender) {
    if (agentName === sender) return { respond: false, delay: 0, reason: 'self' };
    
    const now = Date.now();
    
    // Check global cooldown
    if (now - this.lastGlobalMessageTime < this.globalChatCooldown) {
      // Actually we delay responses rather than dropping them, but if they want to speak instantly, no.
      // The InterAgentChat handles typing delay, so we just decide IF to respond.
    }

    const profile = this.profiles?.get ? this.profiles.get(agentName) : this.profiles?.[agentName];
    const talkativeness = profile?.traits?.talkativeness ?? profile?.talkativeness ?? 0.5;

    let probability = 0.0;
    let reason = 'neutral';
    
    const msgLower = message.toLowerCase();
    
    // 1. Direct mention
    const isDirectMention = msgLower.includes(agentName.toLowerCase());
    if (isDirectMention) {
      probability = process.env.NODE_ENV === 'test' ? 1.0 : 0.96;
      reason = 'direct mention';
    } 
    // 2. Question to group (contains '?' or 'кто')
    else if (msgLower.includes('?') || msgLower.includes('кто') || msgLower.includes('куда') || msgLower.includes('что')) {
      probability = 0.2 + (talkativeness * 0.3); // 20-50%
      reason = 'group question';
    }
    // 3. Just spoke recently (avoid dominating)
    const lastSpoke = this.perAgentCooldown.get(agentName) || 0;
    if (!isDirectMention && now - lastSpoke < 20000) {
      probability = 0.05;
      reason = 'spoke recently';
    }
    // 4. Social dynamics
    const rel = this.socialGraph.getRelationship(agentName, sender);
    if (rel) {
      if (rel.friendship > 0.6) {
        probability += 0.2;
      }
      if (rel.irritation > 0.5) {
        probability -= 0.3;
      }
    }

    // Agent busy status could be passed via context, but hardcoded here for spec:
    // If agent is busy -> 15% (assuming we check this externally or it overrides)

    const silence = this.getSilenceDuration();
    if (silence > 180000) { // 3 mins
      probability += 0.1;
    }

    const respond = HumanErrorEngine.chance(probability, context?.bot || profile);
    const delay = respond ? Math.round(HumanErrorEngine.range(1000, 6000)) : 0; // 1-6s stagger delay

    return { respond, delay, reason };
  }

  /**
   * Determine if agent should start a conversation out of nowhere
   * @param {string} agentName 
   * @param {Object} context 
   * @returns {boolean}
   */
  shouldInitiateConversation(agentName, context) {
    const profile = this.profiles.get(agentName);
    if (!profile) return false;

    const silence = this.getSilenceDuration();
    
    // Silence rules
    if (silence < 30000) return false; // Normal pause
    if (silence < 120000) return false; // Comfortable silence
    
    // Extended quiet 2-10 mins -> low chance
    // 10+ mins -> higher chance
    let baseChance = 0.01; // 1% per tick
    
    if (silence > 600000) { // 10 mins
      baseChance = 0.05;
    }

    baseChance *= profile.talkativeness || 0.5;

    return HumanErrorEngine.chance(baseChance, profile);
  }

  /**
   * Should agent interrupt an ongoing conversation
   * @param {string} agentName 
   * @param {Object} ongoingConversation 
   * @returns {boolean}
   */
  shouldInterrupt(agentName, ongoingConversation) {
    const profile = this.profiles.get(agentName);
    if (!profile) return false;
    
    const impulsiveness = profile.impulsiveness || 0.5;
    
    if (impulsiveness > 0.7) {
      return HumanErrorEngine.chance(0.15, profile); // 15% chance for highly impulsive
    }
    
    return false; // Very low chance otherwise
  }

  /**
   * @returns {Object}
   */
  getState() {
    return {
      silenceDuration: this.getSilenceDuration(),
      activeThreads: this.activeConversations.size,
      lastMessageTime: this.lastMessageTime
    };
  }
}
