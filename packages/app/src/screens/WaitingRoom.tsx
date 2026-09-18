import { DIFFICULTIES } from '@big-two/ai';
import { useGameStore } from '../store/gameStore.js';
import { joinLinkFor } from '../lib/joinLink.js';
import { seatName } from '../lib/format.js';
import { Copyable } from '../components/Copyable.js';
import { copyWithNotice } from '../lib/copy.js';
import { HostOnly } from '../components/HostOnly.js';
import { LobbyLayout, SeatRow, SitButton } from '../components/LobbyLayout.js';
import { MatchField } from '../components/MatchField.js';
import { SeedField } from '../components/SeedField.js';
import { DIFFICULTY_LABELS, DIFFICULTY_SPOKEN } from './Lobby.js';

/**
 * A shared table before it deals.
 *
 * The same frame, labels and controls as playing alone — Leave, the seats with
 * each computer's difficulty, the match length, the button that starts — so
 * nothing is learned twice. What is genuinely particular to a shared table sits
 * around the common part: which chair you take, what the others call you, and
 * the link that brings them here.
 *
 * Starting is agreed rather than raced: each player readies up, their seat says
 * so, and the host starts the game once everyone is ready. The host sets
 * computer difficulty and the match length and may remove people; everyone
 * else sees those settings exactly as the host does, read-only.
 */
export function WaitingRoom() {
  const seats = useGameStore((s) => s.seatsAtTable);
  const you = useGameStore((s) => s.you);
  const code = useGameStore((s) => s.tableCode);
  const connection = useGameStore((s) => s.connection);
  const hosting = useGameStore((s) => s.hosting);
  const ready = useGameStore((s) => s.ready);
  const unready = useGameStore((s) => s.unready);
  const startGame = useGameStore((s) => s.startGame);
  const takeSeat = useGameStore((s) => s.takeSeat);
  const kick = useGameStore((s) => s.kick);
  const match = useGameStore((s) => s.match);
  const setMatchRule = useGameStore((s) => s.setMatchRule);
  const setSeatDifficulty = useGameStore((s) => s.setSeatDifficulty);
  const seed = useGameStore((s) => s.seed);
  const setSeed = useGameStore((s) => s.setSeed);
  const newSeed = useGameStore((s) => s.newSeed);
  const playerName = useGameStore((s) => s.playerName);
  const setPlayerName = useGameStore((s) => s.setPlayerName);
  const leaveTable = useGameStore((s) => s.leaveTable);
  const error = useGameStore((s) => s.error);

  // The site's own address, subfolder included: on a GitHub project site the
  // game lives at /<repository>/, and a link to the bare domain finds nothing.
  const link = joinLinkFor(code, new URL(import.meta.env.BASE_URL, window.location.origin).href);
  const here = seats.filter((s) => s.connected).length;
  const connected = connection === 'connected';
  const me = seats.find((s) => s.id === you);
  const iAmHost = me?.host ?? false;
  const iAmReady = me?.ready ?? false;
  const canSet = iAmHost && connected;
  const guests = seats.filter((s) => s.connected && !s.host);
  const waitingOn = guests.filter((s) => !s.ready).length;

  const hint = connected
    ? `${here} ${here === 1 ? 'person' : 'people'} here. Computers play any empty seat.`
    : connection === 'reconnecting'
      ? // A guest's line at a browser-hosted table is the host's page, which
        // may be reloading — and a reloaded lobby comes back (9.18).
        hosting === 'browser' && !iAmHost
        ? 'Lost the host. Waiting for them to come back…'
        : 'Reconnecting…'
      : connection === 'closed'
        ? (error ?? 'This table has closed.')
        : 'Connecting…';

  const status = !connected
    ? null
    : iAmHost
      ? guests.length === 0
        ? 'Start whenever you like. Computers play the empty seats.'
        : waitingOn === 0
          ? 'Everyone is ready.'
          : `Waiting for ${waitingOn === 1 ? 'one player' : `${waitingOn} players`} to ready up.`
      : iAmReady
        ? 'You are ready. Waiting for the host to start the game.'
        : 'Ready up so the host can start the game.';

  const primary = iAmHost ? (
    <button
      className="btn btn--primary btn--wide"
      onClick={startGame}
      disabled={!connected || waitingOn > 0}
      data-hint={!connected ? 'Not connected to the table' : 'Everyone else must ready up first'}
    >
      Start game
    </button>
  ) : iAmReady ? (
    // Named for what pressing it does. "Not ready" would read as your state —
    // the opposite of the truth, since you are ready while it shows.
    <button className="btn btn--wide" onClick={unready} disabled={!connected} data-hint="Not connected to the table">
      Cancel ready
    </button>
  ) : (
    <button
      className="btn btn--primary btn--wide"
      onClick={ready}
      disabled={!connected}
      data-hint="Not connected to the table"
    >
      Ready up
    </button>
  );

  return (
    <LobbyLayout
      back={
        <button className="btn btn--quiet" onClick={leaveTable}>
          Leave
        </button>
      }
      aside={
        // One way to share, shown once. The code is for saying aloud or typing
        // into the join box, and copies on click; the link is for sending in a
        // message, and one button beneath the code copies it. A separate
        // invite-link field said the same thing twice.
        <div className="tablecode">
          <span className="tablecode__label">Table code</span>
          <Copyable className="tablecode__value" value={code} message="Code copied" label="Table code" />
          <button
            type="button"
            className="seats__sit tablecode__link"
            onClick={(event) => void copyWithNotice(link, 'Link copied', event)}
          >
            Copy invite link
          </button>
        </div>
      }
      seatsAside={!iAmHost && seats.length > 0 ? <HostOnly label="Host sets difficulty" /> : undefined}
      seatsLocked={!canSet}
      hint={hint}
      seats={seats.map((seat) => {
        const cpu = seat.occupant === 'cpu';
        const mine = seat.id === you;
        // A seat nobody has named still carries its seat name on the wire.
        // Printing that again on the right would say "Seat 2" twice.
        const named = seat.name !== seatName(seat.seat);
        return (
          <SeatRow
            key={seat.id}
            seat={seat.seat}
            role={mine ? 'you' : cpu ? 'cpu' : seat.host ? 'host' : 'player'}
            action={
              // Only a chair nobody has sat in is free. A seat marked `away` is
              // being held for somebody who is coming back — which the host may
              // still clear, so a friend who has gone home is not a seat lost.
              cpu ? (
                <SitButton seat={seat.seat} onSit={takeSeat} disabled={!connected} hint="Not connected to the table" />
              ) : iAmHost && !mine ? (
                <button
                  className="seats__sit"
                  aria-label={`Remove ${named ? seat.name : seatName(seat.seat)} from the table`}
                  onClick={() => kick(seat.seat)}
                  disabled={!connected}
                  data-hint="Not connected to the table"
                >
                  Remove
                </button>
              ) : undefined
            }
            detail={
              cpu ? (
                DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    className="chip"
                    aria-pressed={seat.difficulty === d}
                    aria-label={`${seatName(seat.seat)} difficulty: ${DIFFICULTY_SPOKEN[d]}`}
                    onClick={() => setSeatDifficulty(seat.seat, d)}
                    disabled={!canSet}
                    data-hint={iAmHost ? 'Not connected to the table' : 'Only the host can change this'}
                  >
                    {DIFFICULTY_LABELS[d]}
                  </button>
                ))
              ) : (
                <span className="seats__player">
                  {/* The host starts the game rather than readying up, so only
                      the other players carry a ready state. */}
                  {seat.connected && !seat.host && (
                    <span className={`seats__ready ${seat.ready ? 'is-ready' : ''}`}>
                      {seat.ready ? 'Ready' : 'Not ready'}
                    </span>
                  )}
                  {named ? seat.name : <span className="seats__role">Unnamed</span>}
                  {!seat.connected && <span className="seats__role">{' (Away)'}</span>}
                </span>
              )
            }
          />
        );
      })}
      error={connection === 'closed' ? null : error}
      status={status}
      primary={primary}
    >
      <div className="field">
        <label htmlFor="player-name">Your name</label>
        <input
          id="player-name"
          value={playerName}
          maxLength={24}
          placeholder="Type a name"
          onChange={(e) => setPlayerName(e.target.value)}
        />
      </div>

      <MatchField rule={match.rule} onChange={setMatchRule} editable={canSet} hostOnly={!iAmHost} />

      {/* At a browser-hosted table every device adds to the shuffle, so there
          is no single seed to show or set. */}
      {hosting !== 'browser' && <SeedField seed={seed} onChange={setSeed} onNew={newSeed} disabled={!connected} />}
    </LobbyLayout>
  );
}
