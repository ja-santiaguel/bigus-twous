import { useEffect, useRef, useState } from 'react';
import { isBombType, type Combo, type GameEvent } from '@big-two/engine';
import { SUIT_NAME } from '../../lib/format.js';

/**
 * The big plays, celebrated — in proportion.
 *
 * Chopping a 2 is the moment Tiến Lên is built around, and it used to land
 * looking like any other play with a "Four of a kind" caption. Now the table
 * answers the play with a flash, a shake and its name — and how hard it answers
 * depends on how rare and how decisive the play is, in three levels:
 *
 *   1  A 2 laid down, a straight of four or five. Strong, and seen most rounds:
 *      the name, a light flash, no shake.
 *   2  A chop (a bomb on a single 2), a pair of 2s, a straight of six or seven.
 *      A turn that swings the round: flash, a short shake, the name large.
 *   3  A bomb on a pair or three of 2s, a bomb answering a bomb, three or four
 *      2s, a straight of eight or more. Once in many games: the strongest flash,
 *      a longer shake, the name largest and held longest.
 *
 * Straights are placed by how often a thirteen-card hand holds one, against
 * the 2s that anchor each level (400,000 simulated deals): a hand holds a 2
 * 70% of the time, two 2s 26%, three 2s 4.4%. A straight of four is held 74% of
 * the time and five 47% — a single 2's company; six 27% and seven 14% — a pair
 * of 2s'; eight 7%, nine 3%, ten 1% — three 2s' and rarer. A straight of three,
 * held 95% of the time, is commoner than anything here and is not a moment.
 *
 * Only the kind of play is named. Who made it is already on the table — the
 * cards are in front of their seat, and the log says it in words — and the
 * callout is read in a glance, not a sentence. A single 2 names the card —
 * "2 of Spades!" — because which 2 it is matters: the 2 of Hearts beats every
 * other card in the deck. Several Twos are spelled out: in the pixel face a
 * "2" directly beside an "S" reads as one smudged glyph ("THREE 2S"). A
 * straight from 3 to the ace is a Dragon, as the players call it.
 *
 * Read from the event log, like every other animation cue: the moment reacts to
 * what the table already decided, so it is identical whether the play came from
 * this tab or across a socket, and it can never hold the game up. A bomb led
 * onto an empty table is a strong play, not an event.
 */

export type MomentLevel = 1 | 2 | 3;

export interface BombMomentCue {
  /** The event index. A new one remounts the callout, restarting its animation. */
  key: number;
  level: MomentLevel;
  title: string;
}

/** How long the callout stays up, and how long the table shakes, by level. */
const HOLD_MS: Record<MomentLevel, number> = { 1: 1_100, 2: 1_600, 3: 2_200 };
const SHAKE_MS: Record<MomentLevel, number> = { 1: 0, 2: 360, 3: 560 };

export function useBombMoment(history: GameEvent[]): { moment: BombMomentCue | null; shaking: MomentLevel | null } {
  const [moment, setMoment] = useState<BombMomentCue | null>(null);
  const [shaking, setShaking] = useState<MomentLevel | null>(null);
  /** How much of the log has been looked at. Null until the first look. */
  const seen = useRef<number | null>(null);
  // Timers live in refs, not in the effect's cleanup: the log changes again on
  // the very next turn, and cleaning up then would strand the callout on screen.
  // Each one takes itself out when it fires, so a long match does not keep a
  // list of every big play it ever had.
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const from = seen.current;
    seen.current = history.length;
    // Arriving at a table — a reload, a rejoin — replays nothing: a bomb from
    // five minutes ago is not news. A shorter log is a new round.
    if (from === null || history.length < from) return;

    // Several plays can arrive at once; the biggest of them is the one shown.
    let found: BombMomentCue | null = null;
    for (let i = from; i < history.length; i++) {
      const cue = readMoment(history, i);
      if (cue && (!found || cue.level >= found.level)) found = cue;
    }
    if (!found) return;

    const later = (run: () => void, ms: number) => {
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        run();
      }, ms);
      timers.current.add(timer);
    };
    const cue = found;
    setMoment(cue);
    if (SHAKE_MS[cue.level] > 0) {
      setShaking(cue.level);
      later(() => setShaking(null), SHAKE_MS[cue.level]);
    }
    later(() => setMoment((current) => (current?.key === cue.key ? null : current)), HOLD_MS[cue.level]);
  }, [history]);

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );

  return { moment, shaking };
}

/** The shortest straight that gets a moment, and where the next levels start. */
export const MOMENT_STRAIGHT_LENGTH = 4;
const STRAIGHT_LEVEL_2 = 6;
const STRAIGHT_LEVEL_3 = 8;
/** Every rank a straight can use, 3 to the ace: the Dragon. */
const DRAGON_LENGTH = 12;

/** Exported for tests: the moment, if any, that the play at `index` deserves. */
export function readMoment(history: GameEvent[], index: number): BombMomentCue | null {
  const event = history[index];
  if (!event || event.type !== 'CARDS_PLAYED') return null;
  const { combo } = event;
  const moment = (level: MomentLevel, title: string): BombMomentCue => ({ key: index, level, title });

  if (combo.type === 'STRAIGHT' && combo.cards.length >= MOMENT_STRAIGHT_LENGTH) {
    const length = combo.cards.length;
    const level = length >= STRAIGHT_LEVEL_3 ? 3 : length >= STRAIGHT_LEVEL_2 ? 2 : 1;
    return moment(level, length === DRAGON_LENGTH ? 'Dragon!' : `Straight of ${length}!`);
  }

  const allTwos = combo.cards.every((card) => card.rank === '2');
  if (combo.type === 'FOUR_OF_A_KIND' && allTwos) return moment(3, 'Four Twos!');

  if (isBombType(combo.type)) {
    const beaten = lastPlayBefore(history, index);
    if (!beaten) return null;
    const twos = twoCount(beaten);
    // A bomb on one 2 is the chop the game is built around; on two or three
    // it takes a bigger bomb, and a bigger bomb is rarer.
    if (twos === 1) return moment(2, 'Chopped!');
    if (twos === 2) return moment(3, 'Double chop!');
    if (twos === 3) return moment(3, 'Triple chop!');
    if (isBombType(beaten.type)) return moment(3, 'Counter-bomb!');
    return null;
  }

  if (allTwos) {
    if (combo.type === 'SINGLE') return moment(1, `2 of ${capitalise(SUIT_NAME[combo.cards[0]!.suit])}!`);
    if (combo.type === 'PAIR') return moment(2, 'Pair of Twos!');
    if (combo.type === 'TRIPLE') return moment(3, 'Three Twos!');
  }
  return null;
}

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** What a play landed on: the last play since the table last cleared. */
function lastPlayBefore(history: GameEvent[], index: number): Combo | null {
  for (let j = index - 1; j >= 0; j--) {
    const earlier = history[j]!;
    if (earlier.type === 'TRICK_RESET' || earlier.type === 'ROUND_ENDED') return null;
    if (earlier.type === 'CARDS_PLAYED') return earlier.combo;
  }
  return null;
}

/** How many 2s a single, pair or three of 2s holds; zero for anything else. */
function twoCount(combo: Combo): number {
  if (!combo.cards.every((card) => card.rank === '2')) return 0;
  return combo.type === 'SINGLE' || combo.type === 'PAIR' || combo.type === 'TRIPLE' ? combo.cards.length : 0;
}

/**
 * The flash across the table and the callout over its middle. Positioned in
 * the table's box and out of its flow, so neither moves a card or a seat.
 */
export function BombCallout({ moment }: { moment: BombMomentCue | null }) {
  if (!moment) return null;
  return (
    <>
      <span key={`flash-${moment.key}`} className={`bomb-flash bomb-flash--l${moment.level}`} aria-hidden="true" />
      <div
        key={`callout-${moment.key}`}
        className={`bomb bomb--l${moment.level}`}
        role="status"
        aria-live={moment.level === 1 ? 'polite' : 'assertive'}
      >
        <span className="bomb__title">{moment.title}</span>
      </div>
    </>
  );
}
