import { describe, expect, it } from 'vitest';
import { cpuTurnDelay, SPEEDS, SPEED_LABELS } from '../src/pacing.js';

/**
 * Pacing is presentation, but it is the presentation people notice first: a
 * turn that goes by unseen reads as a bug in the rules, not as a fast
 * animation. These pin the two properties that matter and would otherwise
 * only be caught by watching the table.
 */
describe('cpu pacing', () => {
  it('offers exactly three speeds', () => {
    expect(SPEEDS).toEqual(['instant', 'fast', 'normal']);
    expect(Object.keys(SPEED_LABELS)).toEqual(['instant', 'fast', 'normal']);
  });

  it('gives a pass more time than a play, at both speeds', () => {
    // A pass moves no cards: the board is identical afterwards but for one
    // small badge, so there is nothing for the eye to catch and it needs
    // longer to register at all. Deciding you have nothing is not the quicker
    // decision either — you only know once you have looked at everything.
    expect(cpuTurnDelay('instant', 'pass')).toBeGreaterThan(cpuTurnDelay('instant', 'play'));

    const plays = Array.from({ length: 400 }, () => cpuTurnDelay('normal', 'play'));
    const passes = Array.from({ length: 400 }, () => cpuTurnDelay('normal', 'pass'));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(passes)).toBeGreaterThan(mean(plays));
    expect(Math.min(...passes)).toBeGreaterThanOrEqual(1200);
    expect(Math.max(...passes)).toBeLessThanOrEqual(2800);
  });

  it('never resolves a turn in zero time, even at instant', () => {
    // The whole point of the buffer: three CPU turns inside one frame is a
    // single flicker, and two of the plays are never drawn at all.
    for (let i = 0; i < 50; i++) {
      expect(cpuTurnDelay('instant', 'play')).toBeGreaterThan(0);
      expect(cpuTurnDelay('instant', 'pass')).toBeGreaterThan(0);
    }
    // ...and it still has to feel instant.
    expect(cpuTurnDelay('instant', 'play')).toBeLessThan(250);
  });

  it('lets every card land before the next moves, at fast', () => {
    // Fast plays a round out once you are no longer in it. A card's flight is
    // 220ms; a turn sooner than that would start the next card moving while the
    // last was still in the air.
    const CARD_FLIGHT_MS = 220;
    const plays = Array.from({ length: 400 }, () => cpuTurnDelay('fast', 'play'));
    const passes = Array.from({ length: 400 }, () => cpuTurnDelay('fast', 'pass'));
    expect(Math.min(...plays, ...passes)).toBeGreaterThan(CARD_FLIGHT_MS);
    // ...and it is quick: well under the quickest normal turn.
    expect(Math.max(...plays, ...passes)).toBeLessThan(900);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(passes)).toBeGreaterThan(mean(plays));
  });

  it('keeps normal inside a range you would sit through', () => {
    const samples = Array.from({ length: 400 }, () => cpuTurnDelay('normal'));
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(900);
    expect(Math.max(...samples)).toBeLessThanOrEqual(2400);
  });

  it('skews normal toward quick answers rather than spacing turns evenly', () => {
    // A flat distribution is the thing that reads as a machine — four turns
    // metronomically spaced is a progress bar. Most turns should come back
    // briskly, with the occasional longer think.
    const samples = Array.from({ length: 2000 }, () => cpuTurnDelay('normal')).sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)]!;
    const midpoint = (900 + 2400) / 2;

    expect(median).toBeLessThan(midpoint);
    // And genuinely varied, not a constant wearing a range.
    expect(new Set(samples).size).toBeGreaterThan(100);
  });
});
