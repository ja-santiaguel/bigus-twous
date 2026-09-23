import { describe, expect, it } from 'vitest';
import { createRng } from '@big-two/engine';
import { arrive, makePersona, startRun, TIERS } from '../src/index.js';

/** The computers you meet: names that fit a phone's seat, and one person per table. */
describe('personas', () => {
  it('keeps every name to ten letters, so it fits above a fan on a phone', () => {
    const rng = createRng('names');
    for (let i = 0; i < 400; i++) {
      const persona = makePersona(rng, `p${i}`, { difficulty: 'easy', worthFactor: [1, 1] });
      expect(persona.name.length).toBeLessThanOrEqual(10);
    }
  });

  it('never seats the same person twice at one table', () => {
    for (let n = 0; n < 50; n++) {
      const run = startRun(`seat-${n}`, 'tyrant');
      for (const option of Object.values(run.offers)) {
        const names = [...option.lineup, ...option.rail].map((p) => p.name);
        expect(new Set(names).size).toBe(names.length);
      }
    }
  });

  it('sits the throne with names that fit too', () => {
    const run = startRun('finale-names', 'commoner');
    expect(TIERS.at(-1)!.name).toBe('The Hollow Throne');
    const at = arrive({ ...run, worth: 5000, path: [run.map.rows.at(-2)![0]!.id] });
    expect(at.offers.throne!.lineup.every((p) => p.name.length <= 10)).toBe(true);
  });
});
