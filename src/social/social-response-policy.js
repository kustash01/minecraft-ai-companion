const INTEREST = Object.freeze(['none', 'low', 'medium', 'high']);
const WILLINGNESS = Object.freeze(['none', 'low', 'medium', 'high']);
const STANCES = Object.freeze(['warm', 'neutral', 'cautious']);
const TIMING = Object.freeze(['none', 'immediate', 'delayed']);
const REASONS = Object.freeze(['empty', 'low_interest', 'hostile', 'question', 'help', 'social']);

/** Pure profile-derived social disposition. No names, randomness, providers, or actions. */
export function socialResponsePolicy({ profile = {}, messageClass = {}, relationshipTone = 'neutral', personalState = {}, disposition = {}, senderIrritation = 0 } = {}) {
  const traits = profile.traits || {};
  const sociability = clamp(traits.sociability, 0.5);
  const talkativeness = clamp(traits.talkativeness, 0.5);
  const caution = clamp(traits.caution, 0.5);
  const irritation = clamp(Math.max(disposition.irritation || 0, senderIrritation), 0);
  const fear = clamp(disposition.fear || 0, 0);
  const category = messageClass.speechAct || messageClass.category || 'casual';
  const hostile = category === 'conflict' || irritation >= 0.75 || relationshipTone === 'cautious';
  const interest = category === 'silence' ? 'none' : category === 'question' || category === 'request' ? 'high' : sociability + talkativeness >= 1.3 ? 'high' : sociability + talkativeness >= 0.8 ? 'medium' : 'low';
  const willing = hostile ? 'low' : interest === 'high' ? 'high' : interest;
  const fearShy = fear >= 0.6 ? 'low' : fear >= 0.35 ? 'medium' : null;
  const shouldRespond = category !== 'silence' && willing !== 'none' && (category === 'question' || category === 'request' || sociability + talkativeness >= 0.65);
  const reasonCode = category === 'silence' ? 'empty' : hostile ? 'hostile' : category === 'question' ? 'question' : category === 'request' ? 'help' : shouldRespond ? 'social' : 'low_interest';
  return Object.freeze({
    interest: INTEREST.includes(interest) ? interest : 'low',
    willingness: WILLINGNESS.includes(willing) ? willing : 'low',
    stanceBias: STANCES.includes(hostile ? 'cautious' : relationshipTone) ? (hostile ? 'cautious' : relationshipTone) : 'neutral',
    timing: shouldRespond ? (personalState.busy ? 'delayed' : (fearShy && category !== 'question' && category !== 'request' ? 'delayed' : 'immediate')) : 'none',
    reasonCode: REASONS.includes(reasonCode) ? reasonCode : 'low_interest',
    policyVersion: 'social-response-policy.v1',
  });
}

function clamp(value, fallback) { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback; }
