import { describe, it, expect } from 'vitest';
import { FastPlayerIntentRouter, PlayerIntents } from '../../../src/control/fast-player-intent.js';
import { messageBus } from '../../../src/events/message-bus.js';

describe('FastPlayerIntentRouter Expanded Vocabulary Tests', () => {
  it('routes Russian agent names to the matching companion', () => {
    expect(messageBus.checkAddressing('Сэм, иди за мной', 'Sam', ['Sam', 'Max']).isAddressedToMe).toBe(true);
    expect(messageBus.checkAddressing('Сэм, иди за мной', 'Max', ['Sam', 'Max']).targetName).toBe('Sam');
    expect(messageBus.checkAddressing('Макс, стой', 'Max', ['Sam', 'Max']).isAddressedToMe).toBe(true);
  });

  it('understands ordinary group phrasing without a bot name', () => {
    expect(FastPlayerIntentRouter.classifyIntent('не отставайте')).toBe(PlayerIntents.FOLLOW);
    expect(FastPlayerIntentRouter.classifyIntent('соберитесь около меня')).toBe(PlayerIntents.COME_HERE);
    expect(FastPlayerIntentRouter.classifyIntent('прикройте меня')).toBe(PlayerIntents.HELP);
    expect(FastPlayerIntentRouter.classifyIntent('стоим здесь')).toBe(PlayerIntents.STOP);
    expect(FastPlayerIntentRouter.classifyIntent('куда идём?')).toBe(PlayerIntents.NONE);
  });

  it('correctly classifies Russian STOP synonyms', () => {
    expect(FastPlayerIntentRouter.classifyIntent('Sam, стоп')).toBe(PlayerIntents.STOP);
    expect(FastPlayerIntentRouter.classifyIntent('стой!')).toBe(PlayerIntents.STOP);
    expect(FastPlayerIntentRouter.classifyIntent('ребят, остановитесь')).toBe(PlayerIntents.STOP);
    expect(FastPlayerIntentRouter.classifyIntent('замри тут')).toBe(PlayerIntents.STOP);
    expect(FastPlayerIntentRouter.classifyIntent('парни, стойте')).toBe(PlayerIntents.STOP);
    expect(FastPlayerIntentRouter.classifyIntent('хватит идти за мной')).toBe(PlayerIntents.STOP);
    expect(FastPlayerIntentRouter.classifyIntent('не двигайся')).toBe(PlayerIntents.STOP);
    expect(FastPlayerIntentRouter.classifyIntent('отмена')).toBe(PlayerIntents.STOP);
  });

  it('correctly classifies Russian WAIT synonyms', () => {
    expect(FastPlayerIntentRouter.classifyIntent('Sam, подожди')).toBe(PlayerIntents.WAIT);
    expect(FastPlayerIntentRouter.classifyIntent('погоди секунду')).toBe(PlayerIntents.WAIT);
    expect(FastPlayerIntentRouter.classifyIntent('постой тут')).toBe(PlayerIntents.WAIT);
    expect(FastPlayerIntentRouter.classifyIntent('ждите меня')).toBe(PlayerIntents.WAIT);
    expect(FastPlayerIntentRouter.classifyIntent('обожди пару минут')).toBe(PlayerIntents.WAIT);
  });

  it('correctly classifies Russian COME_HERE synonyms', () => {
    expect(FastPlayerIntentRouter.classifyIntent('Sam, иди сюда')).toBe(PlayerIntents.COME_HERE);
    expect(FastPlayerIntentRouter.classifyIntent('быстро сюда!')).toBe(PlayerIntents.COME_HERE);
    expect(FastPlayerIntentRouter.classifyIntent('подбеги ко мне')).toBe(PlayerIntents.COME_HERE);
    expect(FastPlayerIntentRouter.classifyIntent('ребят, ко мне')).toBe(PlayerIntents.COME_HERE);
    expect(FastPlayerIntentRouter.classifyIntent('подойдите сюда')).toBe(PlayerIntents.COME_HERE);
  });

  it('correctly classifies Russian FOLLOW synonyms', () => {
    expect(FastPlayerIntentRouter.classifyIntent('Sam, пошли')).toBe(PlayerIntents.FOLLOW);
    expect(FastPlayerIntentRouter.classifyIntent('ребят, идём за мной')).toBe(PlayerIntents.FOLLOW);
    expect(FastPlayerIntentRouter.classifyIntent('поехали дальше')).toBe(PlayerIntents.FOLLOW);
    expect(FastPlayerIntentRouter.classifyIntent('продолжай следовать')).toBe(PlayerIntents.FOLLOW);
    expect(FastPlayerIntentRouter.classifyIntent('погнали со мной')).toBe(PlayerIntents.FOLLOW);
    expect(FastPlayerIntentRouter.classifyIntent('следуйте за мной')).toBe(PlayerIntents.FOLLOW);
  });

  it('correctly classifies Russian HELP synonyms', () => {
    expect(FastPlayerIntentRouter.classifyIntent('ребят, помогите!')).toBe(PlayerIntents.HELP);
    expect(FastPlayerIntentRouter.classifyIntent('спасай, тут крипер!')).toBe(PlayerIntents.HELP);
    expect(FastPlayerIntentRouter.classifyIntent('срочно на помощь')).toBe(PlayerIntents.HELP);
    expect(FastPlayerIntentRouter.classifyIntent('выручай, мало хп')).toBe(PlayerIntents.HELP);
  });

  it('returns NONE for normal conversation', () => {
    expect(FastPlayerIntentRouter.classifyIntent('что крафтим дальше?')).toBe(PlayerIntents.NONE);
    expect(FastPlayerIntentRouter.classifyIntent('как думаешь, где алмазы?')).toBe(PlayerIntents.NONE);
    expect(FastPlayerIntentRouter.classifyIntent('красивый закат')).toBe(PlayerIntents.NONE);
  });
});
