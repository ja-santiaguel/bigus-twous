import { useEffect, useRef, useState } from 'react';
import { cardValue, isBombType, type Combo, type GameEvent, type PlayerId } from '@big-two/engine';

/**
 * The bomb, celebrated.
 *
 * Chopping a 2 is the moment Tiến Lên is built around — the highest card in the
 * game, answered by a hand saved for exactly this — and it used to land looking
 * like any other play with a "Four of a kind" caption. Now the table flashes,
 * shakes by a couple of art pixels, and says what happened in words.
 *
 * Read from the event log, like every other animation cue: the moment reacts to
 * what the table already decided, so it is identical whether the play came from
 * this tab or across a socket, and it can never hold the game up.
 *
 * Only moments that matter get one — a bomb on a 2, a bomb answering a bomb,
 * four 2s, the hand nothing beats, and a straight of five cards or more, which
 * empties a big part of somebody's hand at once. A bomb simply led onto an
 * empty table is a strong play, not an event.
 */

export interface BombMomentCue {
  /** The event index. A new one remounts the callout, restarting its animation. */
  key: number;
  tone: 'chop' | 'counter' | 'ceiling' | 'straight';
  title: string;
  detail: string;
}

/** How long the callout stays up, and how long the table shakes. */
const HOLD_MS = 1_800;
const SHAKE_MS = 360;

export function useBombMoment(
  history: GameEvent[],
  youId: PlayerId,
  labelFor: (id: PlayerId) => string,
): { moment: BombMomentCue | null; shaking: boolean } {
  const [moment, setMoment] = useState<BombMomentCue | null>(null);
  const [shaking, setShaking] = useState(false);
  /** How much of the log has been looked at. Null until the first look. */
  const seen = useRef<number | null>(null);
  const label = useRef(labelFor);
  label.current = labelFor;
  // Timers live in refs, not in the effect's cleanup: the log changes again on
  // the very next turn, and cleaning up then would strand the callout on screen.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const from = seen.current;
    seen.current = history.length;
    // Arriving at a table — a reload, a rejoin — replays nothing: a bomb from
    // five minutes ago is not news. A shorter log is a new round.
    if (from === null || history.length < from) return;

    let found: BombMomentCue | null = null;
    for (let i = from; i < history.length; i++) {
      found = readMoment(history, i, youId, label.current) ?? found;
    }
    if (!found) return;

    const cue = found;
    setMoment(cue);
    setShaking(true);
    timers.current.push(
      setTimeout(() => setShaking(false), SHAKE_MS),
      setTimeout(() => setMoment((current) => (current?.key === cue.key ? null : current)), HOLD_MS),
    );
  }, [history, youId]);

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );

  return { moment, shaking };
}

/** The shortest straight that gets a moment. */
export const MOMENT_STRAIGHT_LENGTH = 5;

/** Exported for tests: the moment, if any, that the play at `index` deserves. */
export function readMoment(
  history: GameEvent[],
  index: number,
  youId: PlayerId,
  labelFor: (id: PlayerId) => string,
): BombMomentCue | null {
  const event = history[index];
  if (!event || event.type !== 'CARDS_PLAYED') return null;

  const you = event.playerId === youId;
  const who = you ? 'You' : labelFor(event.playerId);
  const verb = (plain: string, third: string) => (you ? plain : third);

  const { combo } = event;
  if (combo.type === 'STRAIGHT' && combo.cards.length >= MOMENT_STRAIGHT_LENGTH) {
    const ordered = [...combo.cards].sort((a, b) => cardValue(a) - cardValue(b));
    return {
      key: index,
      tone: 'straight',
      title: `Straight of ${combo.cards.length}!`,
      detail: `${who} ${verb('run', 'runs')} ${ordered[0]!.rank} to ${ordered[ordered.length - 1]!.rank}`,
    };
  }
  if (!isBombType(combo.type)) return null;

  // What it landed on: the last play since the table last cleared.
  let beaten: Combo | null = null;
  for (let j = index - 1; j >= 0; j--) {
    const earlier = history[j]!;
    if (earlier.type === 'TRICK_RESET' || earlier.type === 'ROUND_ENDED') break;
    if (earlier.type === 'CARDS_PLAYED') {
      beaten = earlier.combo;
      break;
    }
  }

  if (event.combo.type === 'FOUR_OF_A_KIND' && event.combo.cards[0]?.rank === '2') {
    return {
      key: index,
      tone: 'ceiling',
      title: 'Four 2s!',
      detail: `${who} ${verb('play', 'plays')} the hand nothing beats`,
    };
  }
  const two = beaten ? twoName(beaten) : null;
  if (two) {
    return { key: index, tone: 'chop', title: 'Chopped!', detail: `${who} ${verb('bomb', 'bombs')} ${two}` };
  }
  if (beaten && isBombType(beaten.type)) {
    return { key: index, tone: 'counter', title: 'Counter-bomb!', detail: `${who} ${verb('beat', 'beats')} the bomb` };
  }
  return null;
}

function twoName(combo: Combo): string | null {
  if (!combo.cards.every((card) => card.rank === '2')) return null;
  if (combo.type === 'SINGLE') return 'a 2';
  if (combo.type === 'PAIR') return 'a pair of 2s';
  if (combo.type === 'TRIPLE') return 'three 2s';
  return null;
}

/**
 * The flash across the table and the callout over its middle. Positioned in
 * the table's box and out of its flow, so neither moves a card or a seat.
 */
export function BombCallout({ moment }: { moment: BombMomentCue | null }) {
  if (!moment) return null;
  return (
    <>
      <span key={`flash-${moment.key}`} className="bomb-flash" aria-hidden="true" />
      <div key={`callout-${moment.key}`} className={`bomb bomb--${moment.tone}`} role="status" aria-live="assertive">
        <span className="bomb__title">{moment.title}</span>
        <span className="bomb__detail">{moment.detail}</span>
      </div>
    </>
  );
}
