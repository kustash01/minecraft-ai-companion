const clamp01 = (value, fallback = 0) => Number.isFinite(value)
  ? Math.max(0, Math.min(1, value))
  : fallback;

const SPEECH = Object.freeze({
  SILENT: 'silent',
  INFORM: 'inform',
  ASK: 'ask',
  BOAST: 'boast',
  DEFER: 'defer',
});

const ACTION = Object.freeze({
  IGNORE: 'ignore',
  RESERVE: 'reserve',
  KEEP_FOR_GOAL: 'keep_for_goal',
  HONOR_COMMITMENT: 'honor_commitment',
  SHARE_WITH_PERSON: 'share_with_person',
  OFFER_TO_GROUP: 'offer_to_group',
  CONTINUE_CAREFULLY: 'continue_carefully',
  PREPARE_AND_RETURN: 'prepare_and_return',
  RETRY_WITH_ADAPTATION: 'retry_with_adaptation',
  SEEK_SUPPORT_AND_RETURN: 'seek_support_and_return',
  WITHDRAW: 'withdraw',
  INVESTIGATE: 'investigate',
  REMEMBER: 'remember',
});

export const AppraisalSpeech = SPEECH;
export const AppraisalAction = ACTION;

/**
 * Turns a factual event into an agent-private interpretation. It never emits
 * chat or executes gameplay actions. Randomness only breaks close choices;
 * goals, needs, obligations and character remain the primary causes.
 */
export class EventAppraisalEngine {
  constructor({ profile = {}, random = Math.random, now = () => Date.now() } = {}) {
    this.profile = profile;
    this.random = random;
    this.now = now;
    this.sequence = 0;
  }

  appraise(event = {}, context = {}) {
    const facts = this._facts(event, context);
    const character = this._character();
    const motives = this._motives(facts, character);
    const action = this._chooseAction(facts, character, motives);
    const speech = this._chooseSpeech(facts, character, motives, action);

    return Object.freeze({
      appraisalId: `${this.profile.name || 'agent'}:appraisal:${this.now()}:${++this.sequence}`,
      eventId: event.eventId || null,
      eventType: event.type || 'unknown',
      meaning: Object.freeze({
        personalValue: motives.personalValue,
        groupValue: motives.groupValue,
        obligation: facts.obligation,
        risk: facts.risk,
        confidence: facts.confidence,
      }),
      motives: Object.freeze(motives),
      decision: Object.freeze({
        action,
        speech,
        audience: speech === SPEECH.SILENT ? 'none' : (facts.recipientId || 'group'),
        reasonCodes: Object.freeze(this._reasonCodes(facts, motives, action, speech)),
      }),
    });
  }

  _facts(event, context) {
    const tags = new Set(Array.isArray(event.tags) ? event.tags : []);
    return {
      isResource: event.category === 'resource' || tags.has('resource'),
      isSetback: event.category === 'setback' || tags.has('setback'),
      personalNeed: clamp01(event.personalNeed ?? context.personalNeed),
      groupNeed: clamp01(event.groupNeed ?? context.groupNeed),
      goalRelevance: clamp01(event.goalRelevance ?? context.goalRelevance),
      scarcity: clamp01(event.scarcity),
      ownership: clamp01(event.ownership, 0.5),
      obligation: clamp01(event.obligation ?? context.obligation),
      risk: clamp01(event.risk ?? context.risk),
      recoverableLoss: clamp01(event.recoverableLoss),
      confidence: clamp01(event.confidence, 1),
      novelty: clamp01(event.novelty, 0.5),
      urgency: clamp01(event.urgency),
      prideOpportunity: clamp01(event.prideOpportunity),
      publicRelevance: clamp01(event.publicRelevance),
      socialRisk: clamp01(event.socialRisk),
      informationSensitivity: clamp01(event.informationSensitivity),
      equipmentReadiness: clamp01(context.equipmentReadiness, 0.5),
      busy: clamp01(context.busy),
      recentlyDiscussed: clamp01(context.recentlyDiscussed),
      recipientId: event.recipientId || context.recipientId || null,
      lessonAvailable: Boolean(event.lessonAvailable),
    };
  }

  _character() {
    const traits = this.profile.traits || {};
    return {
      caution: clamp01(traits.caution, 0.5),
      curiosity: clamp01(traits.curiosity, 0.5),
      empathy: clamp01(traits.empathy, 0.5),
      talkativeness: clamp01(traits.talkativeness, 0.5),
      competitiveness: clamp01(traits.competitiveness, 0.5),
      stubbornness: clamp01(traits.stubbornness, 0.5),
      impulsiveness: clamp01(traits.impulsiveness, 0.5),
      riskAttitude: clamp01(traits.risk_attitude, 0.5),
      resilience: clamp01(traits.resilience, 0.6),
      thrillSeeking: clamp01(traits.thrill_seeking, traits.risk_attitude ?? 0.5),
      recoveryDrive: clamp01(traits.recovery_drive, 0.6),
      lossAversion: clamp01(traits.loss_aversion, traits.caution ?? 0.5),
      generosity: clamp01(traits.generosity, traits.empathy ?? 0.5),
      secrecy: clamp01(traits.secrecy, 0.35),
      pride: clamp01(traits.pride, traits.competitiveness ?? 0.5),
      resourceIndividualism: clamp01(traits.resource_individualism, 0.5),
    };
  }

  _motives(facts, character) {
    const personalValue = clamp01(
      facts.personalNeed * 0.42 + facts.goalRelevance * 0.28 +
      facts.scarcity * 0.15 + facts.ownership * 0.15
    );
    const groupValue = clamp01(
      facts.groupNeed * 0.5 + facts.obligation * 0.3 + character.empathy * 0.2
    );
    const persistence = clamp01(
      facts.goalRelevance * 0.25 + facts.recoverableLoss * 0.25 +
      character.stubbornness * 0.15 + character.resilience * 0.2 +
      character.recoveryDrive * 0.15
    );
    const cautionPressure = clamp01(
      facts.risk * (character.caution * 0.55 + character.lossAversion * 0.25 +
      (1 - facts.equipmentReadiness) * 0.2)
    );
    const thrill = clamp01(
      facts.risk * (character.thrillSeeking * 0.5 + character.riskAttitude * 0.3 +
      character.impulsiveness * 0.2)
    );
    const cooperation = clamp01(
      groupValue * 0.55 + character.generosity * 0.25 + character.empathy * 0.2
    );
    const retention = clamp01(
      personalValue * 0.55 + character.resourceIndividualism * 0.25 +
      facts.scarcity * character.lossAversion * 0.2
    );
    const expression = clamp01(
      facts.publicRelevance * 0.22 + facts.urgency * 0.18 + facts.obligation * 0.15 +
      character.talkativeness * 0.2 + facts.prideOpportunity * character.pride * 0.2 +
      groupValue * 0.12 - facts.busy * 0.22 - facts.recentlyDiscussed * 0.25 -
      facts.socialRisk * 0.12 - facts.informationSensitivity * character.secrecy * 0.2
    );
    return { personalValue, groupValue, persistence, cautionPressure, thrill, cooperation, retention, expression };
  }

  _chooseAction(facts, character, motives) {
    if (facts.isSetback || (facts.risk >= 0.55 && facts.recoverableLoss > 0)) {
      const returnDrive = clamp01(motives.persistence + motives.thrill * 0.3);
      if (returnDrive + 0.08 < motives.cautionPressure) return ACTION.WITHDRAW;
      if (motives.thrill >= 0.62 && character.impulsiveness >= 0.65 && returnDrive >= 0.6) {
        return ACTION.RETRY_WITH_ADAPTATION;
      }
      if (facts.equipmentReadiness < 0.45 && character.caution >= 0.55) return ACTION.PREPARE_AND_RETURN;
      if (facts.risk >= 0.75 && character.empathy >= 0.55) return ACTION.SEEK_SUPPORT_AND_RETURN;
      return ACTION.CONTINUE_CAREFULLY;
    }

    if (facts.isResource) {
      if (facts.obligation >= 0.65) return ACTION.HONOR_COMMITMENT;
      const closeChoice = Math.abs(motives.cooperation - motives.retention) < 0.12;
      const cooperate = motives.cooperation > motives.retention || (closeChoice && this.random() < motives.cooperation);
      if (cooperate && facts.groupNeed >= 0.45) {
        return facts.recipientId ? ACTION.SHARE_WITH_PERSON : ACTION.OFFER_TO_GROUP;
      }
      if (facts.personalNeed >= 0.45 || facts.goalRelevance >= 0.55) return ACTION.KEEP_FOR_GOAL;
      return ACTION.RESERVE;
    }

    if (facts.risk >= 0.65) return motives.thrill > motives.cautionPressure ? ACTION.INVESTIGATE : ACTION.WITHDRAW;
    if (facts.novelty * character.curiosity >= 0.45) return ACTION.INVESTIGATE;
    if (Math.max(motives.personalValue, motives.groupValue) >= 0.35) return ACTION.REMEMBER;
    return ACTION.IGNORE;
  }

  _chooseSpeech(facts, character, motives, action) {
    if (facts.confidence < 0.45 && facts.urgency < 0.7) return SPEECH.DEFER;
    if (action === ACTION.OFFER_TO_GROUP) return SPEECH.ASK;
    if (action === ACTION.HONOR_COMMITMENT && facts.publicRelevance >= 0.45) return SPEECH.INFORM;

    const shouldSpeak = motives.expression >= 0.62 ||
      (motives.expression >= 0.42 && this.random() < motives.expression);
    if (!shouldSpeak) return SPEECH.SILENT;
    if (facts.prideOpportunity * character.pride >= 0.55 && character.competitiveness >= 0.5) return SPEECH.BOAST;
    return SPEECH.INFORM;
  }

  _reasonCodes(facts, motives, action, speech) {
    const reasons = [];
    if (motives.personalValue >= 0.55) reasons.push('personal_value');
    if (motives.groupValue >= 0.55) reasons.push('group_value');
    if (facts.obligation >= 0.55) reasons.push('obligation');
    if (facts.risk >= 0.55) reasons.push('danger');
    if (motives.persistence >= 0.55) reasons.push('persistence');
    if (motives.thrill >= 0.55) reasons.push('thrill');
    if (action === ACTION.PREPARE_AND_RETURN || action === ACTION.RETRY_WITH_ADAPTATION || action === ACTION.CONTINUE_CAREFULLY) reasons.push('adapted_strategy');
    if (speech === SPEECH.SILENT) reasons.push('speech_not_worth_cost');
    if (speech === SPEECH.DEFER) reasons.push('insufficient_confidence');
    return reasons.length ? reasons : ['low_significance'];
  }
}
