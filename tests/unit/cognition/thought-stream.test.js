import { describe, it, expect, vi } from 'vitest';
import { ThoughtStream } from '../../../src/cognition/thought-stream.js';

describe('ThoughtStream — поток мыслей и внутреннего монолога', () => {
  it('эмитит и сохраняет недавние мысли', () => {
    const stream = new ThoughtStream();
    stream.emit('Ого, какая глубокая пещера...');
    stream.emit('Надо бы скрафтить факелы');

    const recent = stream.getRecent(5);
    expect(recent.length).toBe(2);
    expect(recent[0].text).toBe('Ого, какая глубокая пещера...');
    expect(recent[1].text).toBe('Надо бы скрафтить факелы');
  });

  it('уведомляет подписчиков о новых мыслях', () => {
    const stream = new ThoughtStream();
    const listener = vi.fn();
    const unsubscribe = stream.subscribe(listener);

    stream.emit('Слышу зомби неподалёку');
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ text: 'Слышу зомби неподалёку' }));

    unsubscribe();
    stream.emit('Тишина');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
