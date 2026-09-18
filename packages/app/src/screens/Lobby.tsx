import { DIFFICULTIES, type Difficulty } from '@big-two/ai';
import { useGameStore } from '../store/gameStore.js';
import { seatName } from '../lib/format.js';
import { LobbyLayout, SeatRow } from '../components/LobbyLayout.js';
import { MatchField } from '../components/MatchField.js';
import { SeedField } from '../components/SeedField.js';

/**
 * How each difficulty is announced.
 *
 * The chips carry the short label — three of them sit in a seat's row beside
 * the seat, who holds it and a button, and "Medium" is the word that made that
 * row too wide on a phone. A screen reader is told the whole word.
 */
export const DIFFICULTY_SPOKEN: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Med',
  hard: 'Hard',
};

/**
 * Setting up a game on your own.
 *
 * The same frame, labels and controls as a shared table — Leave, the seats with
 * each computer's difficulty, your name, the match length, the seed, Start game
 * — so the two lobbies teach each other. No seat choice here: alone at a table
 * there is nothing a seat decides, since the board always turns so you sit at
 * the bottom.
 */
export function Lobby() {
  const seats = useGameStore((s) => s.seats);
  const humanSeat = useGameStore((s) => s.humanSeat);
  const seed = useGameStore((s) => s.seed);
  const playerName = useGameStore((s) => s.playerName);
  const matchRule = useGameStore((s) => s.matchRule);
  const setMatchRule = useGameStore((s) => s.setMatchRule);
  const setPlayerName = useGameStore((s) => s.setPlayerName);
  const setSeatDifficulty = useGameStore((s) => s.setSeatDifficulty);
  const setSeed = useGameStore((s) => s.setSeed);
  const newSeed = useGameStore((s) => s.newSeed);
  const startMatch = useGameStore((s) => s.startMatch);
  const goToMenu = useGameStore((s) => s.goToMenu);

  return (
    <LobbyLayout
      back={
        <button className="btn btn--quiet" onClick={goToMenu}>
          Leave
        </button>
      }
      hint="Computers play the other three seats. Play passes clockwise."
      seats={seats.map((seat) => {
        const mine = seat.seat === humanSeat;
        return (
          <SeatRow
            key={seat.id}
            seat={seat.seat}
            role={mine ? 'you' : 'cpu'}
            detail={
              mine
                ? playerName.trim() && <span className="seats__player">{playerName.trim()}</span>
                : DIFFICULTIES.map((d) => (
                    <button
                      key={d}
                      className="chip"
                      aria-pressed={seat.difficulty === d}
                      aria-label={`${seatName(seat.seat)} difficulty: ${DIFFICULTY_SPOKEN[d]}`}
                      onClick={() => setSeatDifficulty(seat.seat, d)}
                    >
                      {DIFFICULTY_LABELS[d]}
                    </button>
                  ))
            }
          />
        );
      })}
      primary={
        <button className="btn btn--primary btn--wide" onClick={startMatch}>
          Start game
        </button>
      }
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

      <MatchField rule={matchRule} onChange={setMatchRule} editable />

      <SeedField seed={seed} onChange={setSeed} onNew={newSeed} />
    </LobbyLayout>
  );
}
