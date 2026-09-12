import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

export const EventPriority = {
  EMERGENCY: 4, // Instant preemption (e.g. creeper hiss, player critical HP)
  HIGH: 3,      // High urgency (e.g. nightfall, low food, new hostile mob)
  NORMAL: 2,    // Standard gameplay events (e.g. item collected, block mined)
  LOW: 1,       // Informational / background (e.g. time tick, small weather shift)
};

export const EventTypes = {
  PLAYER_DIED: 'player_died',
  BOT_DIED: 'bot_died',
  PLAYER_HURT: 'player_hurt',
  BOT_HURT: 'bot_hurt',
  DANGER_DETECTED: 'danger_detected',
  CREEPER_HISS: 'creeper_hiss',
  SOUND_DETECTED: 'sound_detected',
  RARE_ITEM_FOUND: 'rare_item_found',
  NIGHT_STARTED: 'night_started',
  DAY_STARTED: 'day_started',
  WEATHER_CHANGED: 'weather_changed',
  BASE_REACHED: 'base_reached',
  TASK_STARTED: 'task_started',
  TASK_COMPLETED: 'task_completed',
  TASK_FAILED: 'task_failed',
  TASK_INTERRUPTED: 'task_interrupted',
  NEW_POI_DISCOVERED: 'new_poi_discovered',
  LOW_FOOD: 'low_food',
  LOW_HEALTH: 'low_health',
  TOOL_BROKEN: 'tool_broken',
  SIGN_READ: 'sign_read',
  PLAYER_SPOKE: 'player_spoke',
  DEFERRED_REMINDER: 'deferred_reminder',
  GOAL_CHANGED: 'goal_changed',
  EMOTION_CHANGED: 'emotion_changed',
};

export class EventBus extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxHistory = options.maxHistory || 100;
    this.history = [];
    this.debounceMs = options.debounceMs || 500;
    this.lastEmitted = new Map();
    this.pendingPrioritized = [];
  }

  /**
   * Emit a prioritized event.
   * @param {string} type - EventTypes value
   * @param {object} payload - Event payload data
   * @param {number} priority - EventPriority value (default: NORMAL)
   * @param {boolean} force - Skip debounce if true
   */
  emitEvent(type, payload = {}, priority = EventPriority.NORMAL, force = false) {
    const now = Date.now();
    const lastTime = this.lastEmitted.get(type) || 0;

    // Check debounce for rapid non-emergency events
    if (!force && priority < EventPriority.EMERGENCY && (now - lastTime < this.debounceMs)) {
      return false;
    }

    this.lastEmitted.set(type, now);

    const eventObj = {
      id: `${now}-${Math.random().toString(36).substring(2, 7)}`,
      type,
      payload,
      priority,
      timestamp: now,
    };

    // Store in historical event ring buffer
    this.history.push(eventObj);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Keep prioritized queue sorted descending by priority
    this.pendingPrioritized.push(eventObj);
    this.pendingPrioritized.sort((a, b) => b.priority - a.priority || a.timestamp - b.timestamp);

    logger.debug(`[EVENT] ${type} (Priority: ${priority})`);

    // Standard event emitter dispatch
    this.emit(type, eventObj);
    this.emit('*', eventObj);

    return true;
  }

  /**
   * Drain pending prioritized events.
   * @param {number} minPriority
   * @returns {Array} List of pending event objects
   */
  drainEvents(minPriority = EventPriority.LOW) {
    const drained = this.pendingPrioritized.filter(e => e.priority >= minPriority);
    this.pendingPrioritized = this.pendingPrioritized.filter(e => e.priority < minPriority);
    return drained;
  }

  /**
   * Peek at the highest priority pending event.
   */
  peekHighestPriority() {
    return this.pendingPrioritized[0] || null;
  }

  /**
   * Get recent event history filtered by type or time.
   */
  getRecentEvents(count = 10, filterType = null) {
    let list = this.history;
    if (filterType) {
      list = list.filter(e => e.type === filterType);
    }
    return list.slice(-count);
  }

  /**
   * Clear pending and historical events.
   */
  clear() {
    this.history = [];
    this.pendingPrioritized = [];
    this.lastEmitted.clear();
  }
}

export const eventBus = new EventBus();
