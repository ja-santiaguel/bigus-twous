import { useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { CardFace } from '../components/card/PixelCard.js';
import { RulesSheet } from '../components/RulesSheet.js';

/**
 * The hero is a single oversized 2 of Hearts: the highest card in the game,
 * and the reason the whole bomb system exists. It carries the rules in one
 * image better than any amount of explanatory copy.
 */
export function MainMenu() {
  const goToLobby = useGameStore((s) => s.goToLobby);
  const savedGame = useGameStore((s) => s.savedGame);
  const resumeMatch = useGameStore((s) => s.resumeMatch);
  const hostOnline = useGameStore((s) => s.hostOnline);
  const joinByCode = useGameStore((s) => s.joinByCode);
  const playerName = useGameStore((s) => s.playerName);
  const setPlayerName = useGameStore((s) => s.setPlayerName);
  const opening = useGameStore((s) => s.opening);
  const error = useGameStore((s) => s.error);

  const [code, setCode] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);

  return (
    <div className="screen">
      <div className="menu">
        <div>
          <h1 className="menu__title">BIG TWO</h1>
          <p className="menu__blurb">
            Four seats, thirteen cards each. Beat what is on the table or pass. First to empty their hand wins the
            round.
          </p>

          <div className="menu__actions">
            {/* A match left mid-way is the most likely thing to want next, so it
                takes the primary slot while it exists. */}
            {savedGame && (
              <button className="btn btn--primary" onClick={resumeMatch}>
                Continue game
              </button>
            )}
            <button className={savedGame ? 'btn' : 'btn btn--primary'} onClick={goToLobby}>
              Play on your own
            </button>
            {/* Opening a table and joining one are the same act from opposite
                ends, so they sit together rather than behind a mode switch. */}
            <button className="btn" onClick={() => void hostOnline()} disabled={opening} aria-busy={opening}>
              {/* Both labels share one cell, so the button is always as wide as
                  the longer of them and nothing beside it moves while opening. */}
              <span className="btn__labels">
                <span className={opening ? 'is-hidden' : ''} aria-hidden={opening}>
                  Play with friends
                </span>
                <span className={opening ? '' : 'is-hidden'} aria-hidden={!opening}>
                  Opening…
                </span>
              </span>
            </button>
            {/* Quiet, not default: reference beside the ways in, and a different
                surface from Play with friends so the two do not read as a pair. */}
            <button className="btn btn--quiet" onClick={() => setRulesOpen(true)}>
              How to play
            </button>
          </div>

          <form
            className="menu__join"
            onSubmit={(event) => {
              event.preventDefault();
              joinByCode(code);
            }}
          >
            <label className="menu__field">
              <span>Your name</span>
              <input
                value={playerName}
                maxLength={24}
                placeholder="Type a name"
                onChange={(e) => setPlayerName(e.target.value)}
              />
            </label>
            <label className="menu__field">
              <span>Table code</span>
              <input
                value={code}
                maxLength={16}
                placeholder="ABC123"
                // Codes are read aloud and typed by hand; case is not part of
                // one, so correcting it here saves a pointless rejection.
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </label>
            <button className="btn" type="submit" disabled={code.trim().length === 0}>
              Join
            </button>
          </form>

          {error && <p className="menu__error">{error}</p>}
        </div>

        <div className="menu__hero">
          <CardFace card={{ rank: '2', suit: 'HEART' }} />
        </div>
      </div>

      <RulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
