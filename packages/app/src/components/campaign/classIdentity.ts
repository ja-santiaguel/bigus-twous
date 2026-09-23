import type { ClassId } from '@big-two/campaign';

/**
 * How each class plays, in words and as a profile.
 *
 * The profile is the point: every class scores the same total across the
 * three and leads on exactly one, so none reads as the "bigger number"
 * choice. The Tyrant's purse is the largest and its antes the heaviest — it
 * climbs fastest and breaks easiest. The Commoner is the reverse. The
 * Courtier gives up some of each for plays that reward reading the table.
 */

export interface ClassIdentity {
  /** One line on how a run as this class goes. */
  style: string;
  /** 1 to 3 on each, adding up to the same for every class. */
  profile: { staying: number; ceiling: number; finesse: number };
  /** The playing-card corner: the ranks the class is about. */
  index: string;
}

export const PROFILE_LABELS: { key: keyof ClassIdentity['profile']; label: string; hint: string }[] = [
  { key: 'staying', label: 'Fortitude', hint: 'How hard a run is to break' },
  { key: 'ceiling', label: 'Avarice', hint: 'How fast gold can grow' },
  { key: 'finesse', label: 'Guile', hint: 'How much reading the table pays' },
];

export const IDENTITY: Record<ClassId, ClassIdentity> = {
  commoner: {
    style: 'Small antes and a small purse. Slow to grow rich, hard to break — and a long straight can topple a 2.',
    profile: { staying: 3, ceiling: 1, finesse: 2 },
    index: '3–10',
  },
  courtier: {
    style:
      'Moderate stakes and precise plays. A court card outranks its own suit: a Queen of hearts takes the Ace of hearts.',
    profile: { staying: 2, ceiling: 1, finesse: 3 },
    index: 'J–A',
  },
  tyrant: {
    style:
      'The largest purse and the heaviest antes. Grows rich fastest, falls hardest; a 2 answers any short straight.',
    profile: { staying: 1, ceiling: 3, finesse: 2 },
    index: '2',
  },
};
