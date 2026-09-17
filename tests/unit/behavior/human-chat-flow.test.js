import { describe, it, expect, vi } from 'vitest';
import { HumanChatFlow } from '../../../src/behavior/human-chat-flow.js';

describe('HumanChatFlow — симуляция человеческой печати и опечаток', () => {
  it('генерирует опечатки по смежным клавишам клавиатуры', () => {
    const word = 'шахта';
    const res = HumanChatFlow.injectTypo(word);
    if (res.hasTypo) {
      expect(res.typoWord).not.toBe(word);
      expect(res.typoWord.length).toBe(word.length);
      expect(res.originalWord).toBe(word);
    }
  });

  it('оставляет большинство опечаток без исправления (~65%) и лишь иногда шлет исправление', () => {
    let correctionsCount = 0;
    const trials = 300;

    for (let i = 0; i < trials; i++) {
      const { correction } = HumanChatFlow.prepareMessages('погнали скорее добывать алмазы в пещере', {
        health: 5,
        food: 5,
      });
      if (correction) correctionsCount++;
    }

    // Доля сообщений с исправлением должна быть умеренной (не на каждое слово)
    expect(correctionsCount).toBeLessThan(trials * 0.5);
  });

  it('симулирует физическую печать: сбрасывает бег и отправляет сообщение', async () => {
    const mockBot = {
      setControlState: vi.fn(),
      chat: vi.fn(),
    };
    const sent = [];

    await HumanChatFlow.typeAndSend(mockBot, 'привет', (msg) => sent.push(msg));

    expect(mockBot.setControlState).toHaveBeenCalledWith('forward', false);
    expect(mockBot.setControlState).toHaveBeenCalledWith('sprint', false);
    expect(sent.length).toBeGreaterThanOrEqual(1);
    expect(sent[0]).toContain('прив');
  });
});
