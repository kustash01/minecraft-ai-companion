import { describe, expect, it, afterEach } from 'vitest';
import { CompanyMemory } from '../../../src/memory/company-memory.js';

describe('CompanyMemory social commitments', () => {
  let memory;
  afterEach(() => memory?.close());

  it('stores and fulfills promises', () => {
    memory = new CompanyMemory({ dbPath: ':memory:' });
    memory.init();
    const id = memory.recordPromise({ promise: 'Принесу тебе железо', madeBy: 'Max', madeTo: 'player' });
    expect(memory.getOpenPromises('player')).toHaveLength(1);
    expect(memory.fulfillPromise(id)).toBe(true);
    expect(memory.getOpenPromises('player')).toHaveLength(0);
  });

  it('keeps conflict history and resolution state', () => {
    memory = new CompanyMemory({ dbPath: ':memory:' });
    memory.init();
    const id = memory.recordConflict({ summary: 'Поспорили из-за маршрута', participants: ['Max', 'Lena'] });
    expect(memory.getRecentConflicts()).toMatchObject([{ summary: 'Поспорили из-за маршрута', participants: ['Max', 'Lena'], resolved_at: null }]);
    expect(memory.resolveConflict(id)).toBe(true);
    expect(memory.resolveConflict(id)).toBe(false);
  });
});
