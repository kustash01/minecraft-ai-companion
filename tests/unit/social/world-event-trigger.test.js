import { describe, expect, it, vi } from 'vitest';
import { WorldEventTrigger } from '../../../src/social/world-event-trigger.js';
import { PersonalSocialState } from '../../../src/social/personal-social-state.js';
import { classifyTopic } from '../../../src/social/social-message-classifier.js';

const NIGHT = { timeOfDay: 14000, isRaining: false, nearbyEntities: [] };

function setup({ chatBus = null, now = () => 1000, traits = { curiosity: 1, exploration_bias: 1, talkativeness: 1, caution: 0 }, chanceGate = () => true } = {}) {
  const personalState = new PersonalSocialState({ getActiveGeneration: () => 1, now });
  personalState.beginGeneration(1);
  personalState.markBindingReady(1);
  const trigger = new WorldEventTrigger({ agentName: 'Sam', profile: { traits }, personalState, chatBus, now, chanceGate });
  return { trigger, personalState, now };
}

describe('WorldEventTrigger', () => {
  it('does not claim social capacity for night transitions', () => {
    let claimFree = false;
    const claim = vi.fn(() => { if (claimFree) { claimFree = false; return true; } return false; });
    const { trigger } = setup({ chatBus: { claimResponse: claim } });
    trigger.poll({ snapshot: NIGHT, generation: 1, bindingReady: true });
    expect(trigger.poll({ snapshot: NIGHT, generation: 1, bindingReady: true })).toBeNull();
    claimFree = true;
    expect(trigger.poll({ snapshot: NIGHT, generation: 1, bindingReady: true })).toBeNull();
    expect(claim).not.toHaveBeenCalled();
  });

  it('keeps night as nonverbal world state', () => {
    const claim = vi.fn(() => true);
    const { trigger } = setup({ chatBus: { claimResponse: claim } });
    const stimulus = trigger.poll({ snapshot: NIGHT, generation: 1, bindingReady: true });
    expect(stimulus).toBeNull();
    expect(claim).not.toHaveBeenCalled();
  });

  it('does not fire when unbound or during the silence window', () => {
    const { trigger } = setup();
    expect(trigger.poll({ snapshot: NIGHT, generation: 1, bindingReady: false })).toBeNull();
    expect(trigger.poll({ snapshot: { timeOfDay: 6000, isRaining: false, nearbyEntities: [] }, generation: 1, bindingReady: true })).toBeNull();
  });

  it('emotions update only from typed events and decay on read', () => {
    let clock = 1000;
    const { personalState } = setup({ now: () => clock });
    personalState.noteOwnDeath();
    expect(personalState.getDispositionSnapshot().fear).toBeGreaterThanOrEqual(0.5);
    clock += 60 * 60000;
    expect(personalState.getDispositionSnapshot().fear).toBeLessThan(0.5);
  });

  it('greets a returning player after a long absence', () => {
    const claim = vi.fn(() => true);
    const { trigger } = setup({ chatBus: { claimResponse: claim } });
    trigger.notePlayerLeft('kustash01', 1000);
    trigger.poll({ snapshot: { timeOfDay: 6000, isRaining: false, nearbyEntities: [] }, generation: 1, bindingReady: true });
    trigger.notePlayerJoined('kustash01', 1000 + 10 * 60000);
    const stimulus = trigger.poll({ snapshot: { timeOfDay: 6000, isRaining: false, nearbyEntities: [] }, generation: 1, bindingReady: true });
    expect(stimulus?.type).toBe('player_return');
    expect(stimulus?.data).toBe('kustash01');
  });

  it('counts days at dawn and remarks only from the second day on', () => {
    const { trigger } = setup();
    const day = (t) => trigger.poll({ snapshot: { timeOfDay: t, isRaining: false, nearbyEntities: [] }, generation: 1, bindingReady: true });
    day(6000); day(14000); day(23500);
    expect(trigger.poll({ snapshot: { timeOfDay: 100, isRaining: false, nearbyEntities: [] }, generation: 1, bindingReady: true })?.type ?? 'none').not.toBe('dawn');
    day(6000); day(14000);
    const dawn = day(23500);
    expect(dawn?.type).toBe('dawn');
    expect(dawn?.data?.dayCount).toBe(2);
  });

  it('comments when a companion leaves the game', () => {
    const claim = vi.fn(() => true);
    const { trigger } = setup({ chatBus: { claimResponse: claim } });
    trigger.notePlayerLeft('Max', 50000);
    const stimulus = trigger.poll({ snapshot: { timeOfDay: 6000, isRaining: false, nearbyEntities: [] }, generation: 1, bindingReady: true });
    expect(stimulus?.type).toBe('player_left');
  });

  it('keeps hunger and injury as private impulses, never chat stimuli', () => {
    let clock = 1000;
    const { trigger } = setup({ now: () => clock, chanceGate: () => true });
    const snapshot = (food, health) => ({ timeOfDay: 6000, isRaining: false, food, health, nearbyEntities: [] });
    trigger.poll({ snapshot: snapshot(20, 20), generation: 1, bindingReady: true });
    clock += 1000;
    expect(trigger.poll({ snapshot: snapshot(6, 6), generation: 1, bindingReady: true })).toBeNull();
    expect(trigger.drainInternalImpulses().map((item) => item.kind)).toEqual(['hungry', 'hurt']);
    expect(trigger.drainInternalImpulses()).toEqual([]);
  });

  it('clears body baselines and queued impulses when transitions reset', () => {
    let clock = 1000;
    const { trigger } = setup({ now: () => clock, chanceGate: () => true });
    const snapshot = (food, health) => ({ timeOfDay: 6000, isRaining: false, food, health, nearbyEntities: [] });
    trigger.poll({ snapshot: snapshot(20, 20), generation: 1, bindingReady: true });
    clock += 1000;
    trigger.poll({ snapshot: snapshot(6, 6), generation: 1, bindingReady: true });
    trigger.resetTransitions();
    expect(trigger.drainInternalImpulses()).toEqual([]);
    clock += 1000;
    trigger.poll({ snapshot: snapshot(6, 6), generation: 1, bindingReady: true });
    expect(trigger.drainInternalImpulses()).toEqual([]);
  });

  it('marks social events as optional and silence-friendly', () => {
    const claim = vi.fn(() => true);
    const { trigger } = setup({ chatBus: { claimResponse: claim }, chanceGate: () => true });
    trigger.noteOtherDeath('Max', -600000);
    const stimulus = trigger.poll({ snapshot: { timeOfDay: 6000, isRaining: false, nearbyEntities: [] }, generation: 1, bindingReady: true });
    expect(stimulus).toMatchObject({ type: 'death', allowSilence: true, publiclyRelevant: true });
  });
});

describe('classifyTopic', () => {
  it('maps bounded topics without action semantics', () => {
    expect(classifyTopic('уже темнеет, пора спать').topic).toBe('night');
    expect(classifyTopic('дождь начинается').topic).toBe('weather');
    expect(classifyTopic('крипер! осторожно').topic).toBe('danger');
    expect(Object.isFrozen(classifyTopic('привет'))).toBe(true);
  });
});
