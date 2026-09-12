import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus, EventPriority, EventTypes } from '../../../src/events/event-bus.js';

describe('EventBus', () => {
  let bus;

  beforeEach(() => {
    bus = new EventBus({ debounceMs: 50 });
  });

  it('should emit and receive prioritized events', () => {
    let received = null;
    bus.on(EventTypes.DANGER_DETECTED, (evt) => {
      received = evt;
    });

    const emitted = bus.emitEvent(EventTypes.DANGER_DETECTED, { mob: 'creeper' }, EventPriority.HIGH);
    expect(emitted).toBe(true);
    expect(received).not.toBeNull();
    expect(received.type).toBe(EventTypes.DANGER_DETECTED);
    expect(received.payload.mob).toBe('creeper');
    expect(received.priority).toBe(EventPriority.HIGH);
  });

  it('should order pending prioritized events by priority', () => {
    bus.emitEvent(EventTypes.DAY_STARTED, {}, EventPriority.LOW, true);
    bus.emitEvent(EventTypes.CREEPER_HISS, {}, EventPriority.EMERGENCY, true);
    bus.emitEvent(EventTypes.PLAYER_HURT, {}, EventPriority.HIGH, true);

    const highest = bus.peekHighestPriority();
    expect(highest.type).toBe(EventTypes.CREEPER_HISS);
    expect(highest.priority).toBe(EventPriority.EMERGENCY);

    const drained = bus.drainEvents(EventPriority.HIGH);
    expect(drained.length).toBe(2);
    expect(drained[0].type).toBe(EventTypes.CREEPER_HISS);
    expect(drained[1].type).toBe(EventTypes.PLAYER_HURT);
  });

  it('should debounce rapid low-priority events', () => {
    const e1 = bus.emitEvent(EventTypes.DAY_STARTED, {}, EventPriority.LOW);
    const e2 = bus.emitEvent(EventTypes.DAY_STARTED, {}, EventPriority.LOW);
    expect(e1).toBe(true);
    expect(e2).toBe(false); // Debounced
  });
});
