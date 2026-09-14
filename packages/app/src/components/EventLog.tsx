import { useState } from 'react';
import type { GameEvent } from '@big-two/engine';
import { SEAT_IDS, useGameStore } from '../store/gameStore.js';
import { cardsLabel, comboLabel, personName } from '../lib/format.js';
import { useSeatNames } from '../lib/useSeatNames.js';

/**
 * The engine's event log, rendered.
 *
 * This is the ground truth for any rules dispute, and it is the exact data
 * source Phase 5 animations will consume — a networked client receives this
 * same stream. Building it now means the animation layer has something real to
 * read from on day one, rather than being retrofitted onto state diffing.
 *
 * Collapsed by default: it is a debugging and verification tool, not part of
 * the table.
 */
export function EventLog({ history }: { history: GameEvent[] }) {
  const [open, setOpen] = useState(false);
  const humanSeat = useGameStore((s) => s.humanSeat);
  const seatNames = useSeatNames();
  const who = (id: string) => personName(SEAT_IDS.indexOf(id), humanSeat, seatNames);

  return (
    <aside className={`log ${open ? 'log--open' : ''}`}>
      <button className="log__toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? 'Hide log' : 'Log'}
      </button>
      {open && (
        <ol className="log__list">
          {history.map((event, i) => {
            const line = describe(event, who);
            if (line === null) return null;
            return (
              <li key={i} className="log__line">
                {line}
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}

const PLACES = ['1st', '2nd', '3rd', '4th'];

/** Returns null for events that are real state changes but not worth a line. */
function describe(event: GameEvent, who: (id: string) => string): string | null {
  switch (event.type) {
    case 'PILE_CLAIMED':
      return event.pickIndex === 0
        ? `${who(event.playerId)} picked first`
        : `${who(event.playerId)} picked a pile`;
    case 'HAND_DEALT':
      // Every seat gets thirteen, every round. The pile claims above already
      // say who ended up with what, so these four lines are pure noise.
      return null;
    case 'CARDS_PLAYED':
      return `${who(event.playerId)} · ${comboLabel(event.combo)} · ${cardsLabel(event.combo.cards)}`;
    case 'PLAYER_PASSED':
      // Passing forfeits the rest of the trick (9.7), not just this turn, so
      // the log says so — "passed" alone reads as "skipped a go".
      return `${who(event.playerId)} passed — out of the trick`;
    case 'PLAYER_FINISHED':
      return `${who(event.playerId)} went out — ${PLACES[event.place] ?? `place ${event.place + 1}`}`;
    case 'TRICK_RESET':
      // The winner usually leads next; they differ only when taking the trick
      // emptied their hand, and that is exactly when the log should say both.
      return event.wonBy === event.leader
        ? `Trick to ${who(event.wonBy)} — they lead`
        : `Trick to ${who(event.wonBy)}, who is out — ${who(event.leader)} leads`;
    case 'ROUND_ENDED':
      return `Round over — ${event.finishOrder.map(who).join(', then ')}`;
  }
}
