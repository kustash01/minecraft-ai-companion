const SPEECH_ACTS = Object.freeze(['greeting', 'question', 'thanks', 'apology', 'agreement', 'disagreement', 'request', 'conflict', 'farewell', 'casual', 'silence']);
const DOMAINS = Object.freeze(['social', 'information', 'assistance', 'conflict', 'none']);
const RISKS = Object.freeze(['none', 'low', 'medium', 'high']);
const CATEGORY_SET = new Set(SPEECH_ACTS);

/** Pure, text-only classification. It never produces a gameplay action. */
export function classifySocialMessage(message) {
  const text = typeof message === 'string' ? message.trim() : String(message?.content || '').trim();
  const lower = text.toLowerCase();
  let speechAct = 'casual';
  if (!text) speechAct = 'silence';
  else if (/^(привет|здравствуй|хай|hello|hi|доброе утро|добрый вечер)(?:\b|[,!.])/i.test(lower)) speechAct = 'greeting';
  else if (/\?$/.test(text) || /^(кто|что|где|когда|почему|как|можешь|можно)\b/i.test(lower)) speechAct = 'question';
  else if (/(спасибо|благодарю|thanks|thx)/i.test(lower)) speechAct = 'thanks';
  else if (/(извини|простите|сорри|прости)/i.test(lower)) speechAct = 'apology';
  else if (/(помоги|помощь|выруч|help)/i.test(lower)) speechAct = 'request';
  else if (/(не согласен|не,|нет,|не думаю|disagree)/i.test(lower)) speechAct = 'disagreement';
  else if (/(согласен|давай|го|окей|ок|правильно)/i.test(lower)) speechAct = 'agreement';
  else if (/(бесишь|заткнись|дурак|конфликт|ненавижу)/i.test(lower)) speechAct = 'conflict';
  else if (/^(пока|до встречи|увидимся|бай)\b/i.test(lower)) speechAct = 'farewell';
  const domain = speechAct === 'question' ? 'information' : speechAct === 'request' ? 'assistance' : speechAct === 'conflict' ? 'conflict' : speechAct === 'silence' ? 'none' : 'social';
  const risk = speechAct === 'conflict' ? 'high' : speechAct === 'request' || speechAct === 'disagreement' ? 'medium' : speechAct === 'silence' ? 'none' : 'low';
  return Object.freeze({ speechAct: CATEGORY_SET.has(speechAct) ? speechAct : 'casual', domain, risk });
}

export { SPEECH_ACTS as SOCIAL_MESSAGE_SPEECH_ACTS, DOMAINS as SOCIAL_MESSAGE_DOMAINS, RISKS as SOCIAL_MESSAGE_RISKS };

const TOPICS = Object.freeze(['night', 'weather', 'danger', 'find', 'death', 'social', 'unknown']);
const TOPIC_SET = new Set(TOPICS);

/** Pure, text-only topic classification for scheduling and dedup. Never an action. */
export function classifyTopic(message) {
  const text = typeof message === 'string' ? message.trim() : String(message?.content || '').trim();
  const lower = text.toLowerCase();
  let topic = 'social';
  if (!text) topic = 'unknown';
  else if (/(темнеет|ночь|ночью|пора спать|спать| сон|луна)/i.test(lower)) topic = 'night';
  else if (/(дождь|гроза|ливень|непогода| дожд)/i.test(lower)) topic = 'weather';
  else if (/(осторожно|опасно|крипер|скелет|зомби|моб|смерть|убил)/i.test(lower)) topic = 'danger';
  else if (/(нашел|нашла|нашли|нашёл|видел деревню|алмаз|железо|жилую|деревня|шахта)/i.test(lower)) topic = 'find';
  else if (/(погиб|умер|умерла|скончался|respawn)/i.test(lower)) topic = 'death';
  return Object.freeze({ topic: TOPIC_SET.has(topic) ? topic : 'unknown' });
}

export { TOPICS as SOCIAL_TOPICS };
