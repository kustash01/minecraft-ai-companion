import { describe, expect, it } from 'vitest';
import { AGENT_PROFILES } from '../../../src/agents/agent-profiles.js';
import {
  AppraisalAction,
  AppraisalSpeech,
  EventAppraisalEngine,
} from '../../../src/cognition/event-appraisal.js';

describe('EventAppraisalEngine', () => {
  it('can keep a valuable resource for a personal goal without announcing it', () => {
    const engine = new EventAppraisalEngine({
      profile: AGENT_PROFILES.Alex,
      random: () => 0.99,
      now: () => 1000,
    });

    const appraisal = engine.appraise({
      eventId: 'diamonds-1',
      type: 'resource_found',
      category: 'resource',
      personalNeed: 0.95,
      groupNeed: 0.15,
      goalRelevance: 0.9,
      scarcity: 1,
      ownership: 1,
      publicRelevance: 0.1,
      prideOpportunity: 0.2,
    }, { busy: 0.7 });

    expect(appraisal.decision.action).toBe(AppraisalAction.KEEP_FOR_GOAL);
    expect(appraisal.decision.speech).toBe(AppraisalSpeech.SILENT);
    expect(appraisal.decision.reasonCodes).toContain('personal_value');
  });

  it('can ask the group when a resource matters more to others than to itself', () => {
    const engine = new EventAppraisalEngine({
      profile: AGENT_PROFILES.Alex,
      random: () => 0,
      now: () => 1000,
    });

    const appraisal = engine.appraise({
      type: 'resource_found',
      category: 'resource',
      personalNeed: 0.05,
      groupNeed: 1,
      goalRelevance: 0.1,
      scarcity: 0.8,
      publicRelevance: 0.8,
    });

    expect(appraisal.decision.action).toBe(AppraisalAction.OFFER_TO_GROUP);
    expect(appraisal.decision.speech).toBe(AppraisalSpeech.ASK);
    expect(appraisal.decision.audience).toBe('group');
  });

  it('lets an impulsive resilient agent return after a loss instead of becoming avoidant', () => {
    const engine = new EventAppraisalEngine({
      profile: AGENT_PROFILES.Jack,
      random: () => 0.5,
      now: () => 1000,
    });

    const appraisal = engine.appraise({
      type: 'died_in_mine',
      category: 'setback',
      risk: 0.85,
      recoverableLoss: 1,
      goalRelevance: 0.85,
      lessonAvailable: true,
    }, { equipmentReadiness: 0.2 });

    expect(appraisal.decision.action).toBe(AppraisalAction.RETRY_WITH_ADAPTATION);
    expect(appraisal.decision.reasonCodes).toContain('thrill');
    expect(appraisal.decision.reasonCodes).toContain('adapted_strategy');
  });

  it('lets a cautious persistent agent prepare and return for important items', () => {
    const engine = new EventAppraisalEngine({
      profile: AGENT_PROFILES.Ryan,
      random: () => 0.5,
      now: () => 1000,
    });

    const appraisal = engine.appraise({
      type: 'died_in_mine',
      category: 'setback',
      risk: 0.8,
      recoverableLoss: 1,
      goalRelevance: 0.9,
      lessonAvailable: true,
    }, { equipmentReadiness: 0.2 });

    expect(appraisal.decision.action).toBe(AppraisalAction.PREPARE_AND_RETURN);
    expect(appraisal.decision.action).not.toBe(AppraisalAction.WITHDRAW);
  });

  it('defers speech when an observation is uncertain and not urgent', () => {
    const engine = new EventAppraisalEngine({
      profile: AGENT_PROFILES.Sam,
      random: () => 0,
      now: () => 1000,
    });

    const appraisal = engine.appraise({
      type: 'possible_village',
      novelty: 1,
      publicRelevance: 1,
      confidence: 0.3,
      urgency: 0.1,
    });

    expect(appraisal.decision.action).toBe(AppraisalAction.INVESTIGATE);
    expect(appraisal.decision.speech).toBe(AppraisalSpeech.DEFER);
    expect(appraisal.decision.reasonCodes).toContain('insufficient_confidence');
  });
});
