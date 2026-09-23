import { enumerateCombos, isBombType, type Card, type Rng } from '@big-two/engine';
import type { Temperament } from './personas.js';

/**
 * How a computer bets.
 *
 * Deliberately simple and readable, so a player can learn a temperament by
 * watching it: a reckless player raises often and large, a cautious one
 * rarely, and every one of them raises more as its hand gets strong or nearly
 * empty. Card play is the AI's business; this only decides the gold.
 */

const RAISE_APPETITE: Record<Temperament, number> = { cautious: 0.08, steady: 0.18, reckless: 0.38 };

/**
 * How strong a hand is for betting, 0 to about 1: the 2s and bombs it holds,
 * and how close it is to going out.
 */
export function handStrength(hand: Card[]): number {
  const twos = hand.filter((c) => c.rank === '2').length;
  const bombs = enumerateCombos(hand).filter((c) => isBombType(c.type)).length;
  const aces = hand.filter((c) => c.rank === 'A').length;
  const nearlyOut = Math.max(0, 6 - hand.length) / 6;
  return Math.min(1, twos * 0.18 + Math.min(bombs, 2) * 0.22 + aces * 0.05 + nearlyOut * 0.5);
}

/**
 * Whether a computer raises with the play it has just made, and by how many
 * steps (0 for no raise). `steps` is the number of raise sizes its class and
 * Medallions allow.
 */
export function cpuRaise(options: {
  temperament: Temperament;
  /** The hand after the play. */
  hand: Card[];
  raisesLeft: number;
  steps: number;
  rng: Rng;
}): number {
  const { temperament, hand, raisesLeft, steps, rng } = options;
  if (raisesLeft <= 0 || steps <= 0) return 0;
  const strength = handStrength(hand);
  const chance = RAISE_APPETITE[temperament] * (0.4 + strength * 2);
  if (rng() >= chance) return 0;
  // Larger steps for a strong hand, and for a reckless one.
  const lean = temperament === 'reckless' ? 0.35 : temperament === 'cautious' ? -0.3 : 0;
  const size = Math.min(1, Math.max(0, strength + lean + (rng() - 0.5) * 0.3));
  return 1 + Math.min(steps - 1, Math.floor(size * steps));
}
