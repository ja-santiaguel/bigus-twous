import type React from 'react';
import { seatName } from '../lib/format.js';

/**
 * The frame both lobbies share.
 *
 * Playing alone and playing with friends are the same act with different
 * company, so their lobbies are one layout: a way back, the seats, whatever is
 * particular to that kind of game, and the button that deals. Somebody who has
 * set up one has already learned where everything is in the other. Only the
 * options genuinely unique to a mode differ — a seed alone, a name and an
 * invite link together — and they sit in the same slot in both.
 */
export function LobbyLayout({
  back,
  aside,
  seatsAside,
  seatsLocked = false,
  hint,
  seats,
  children,
  error,
  status,
  primary,
}: {
  /** Leaving this screen. Always top left, always raised. */
  back: React.ReactNode;
  /** What this table is, when that means something — a shared table's code. */
  aside?: React.ReactNode;
  /** Beside the Seats heading — at a shared table, who may change what is in them. */
  seatsAside?: React.ReactNode;
  /** The seat settings are read-only for this person. */
  seatsLocked?: boolean;
  hint: React.ReactNode;
  seats: React.ReactNode;
  /** The options unique to this mode. */
  children?: React.ReactNode;
  error?: string | null;
  /** Where starting stands — who is ready, who we are waiting on. Just above the button. */
  status?: React.ReactNode;
  /** The action that starts. Always last, always full width. */
  primary: React.ReactNode;
}) {
  return (
    <div className="screen">
      <div className="panel">
        <header className="panel__head">
          {back}
          {aside}
        </header>

        <div className="panel__title">
          <h2>Seats</h2>
          {seatsAside}
        </div>
        <p className="field__hint field__hint--lead">{hint}</p>
        <ul className={`seats ${seatsLocked ? 'is-locked' : ''}`}>{seats}</ul>

        {children}

        {error && <p className="panel__error">{error}</p>}
        {status && (
          <p className="panel__status" role="status">
            {status}
          </p>
        )}
        {primary}
      </div>
    </div>
  );
}

export type SeatRole = 'you' | 'cpu' | 'host' | 'player';

const ROLE_LABELS: Record<SeatRole, string> = { you: 'You', cpu: 'CPU', host: 'Host', player: 'Player' };

/**
 * One seat. The same row in both lobbies, always in the same order:
 *
 *   Seat 2 (CPU)   [Sit here]              [Easy][Medium][Hard]
 *   Seat 3 (You)                                          Jason
 *
 * The seat and who holds it, said the same quiet way for everyone; what you can
 * do about it; and on the right, the seat's detail — a computer's difficulty,
 * or a person's name.
 */
export function SeatRow({
  seat,
  role,
  action,
  detail,
}: {
  seat: number;
  role: SeatRole;
  /** Something you can do to this seat — taking it, when it is free. */
  action?: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <li className={`seats__row ${role === 'you' ? 'is-mine' : ''}`}>
      <span className="seats__who">
        <span className="seats__name">
          {seatName(seat)}
          <span className="seats__role">{` (${ROLE_LABELS[role]})`}</span>
        </span>
        {action}
      </span>
      <span className="seats__diff">{detail}</span>
    </li>
  );
}
