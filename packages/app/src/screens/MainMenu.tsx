import { useState } from 'react';
import { CLASSES, depthNumber, MEDALLIONS, you } from '@big-two/campaign';
import { useGameStore } from '../store/gameStore.js';
import { useCampaignStore } from '../store/campaignStore.js';
import { CardFace } from '../components/card/PixelCard.js';
import { RulesSheet } from '../components/RulesSheet.js';
import { CompendiumSheet } from '../components/campaign/CompendiumSheet.js';
import { PixelTitle } from '../components/PixelTitle.js';

/**
 * The hero is a single oversized 2 of Hearts: the highest card in the game,
 * and the reason the whole bomb system exists. It carries the rules in one
 * image better than any amount of explanatory copy.
 */
export function MainMenu() {
  const goToLobby = useGameStore((s) => s.goToLobby);
  const goToCampaign = useGameStore((s) => s.goToCampaign);
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
  const [compendiumOpen, setCompendiumOpen] = useState(false);
  const discovered = useCampaignStore((s) => s.discovered);
  // A campaign run in progress: carried on from here, or given up for a new one.
  const run = useCampaignStore((s) => s.run);
  const abandon = useCampaignStore((s) => s.abandon);
  const liveRun = run && run.phase !== 'won' && run.phase !== 'lost' ? run : null;
  const [replacing, setReplacing] = useState(false);
  const runLine = liveRun
    ? `${CLASSES[liveRun.classId].name} · depth ${depthNumber(liveRun)} · ${(liveRun.table
        ? you(liveRun.table).worth
        : liveRun.worth
      ).toLocaleString('en-GB')} gold`
    : null;

  return (
    <div className="screen">
      <div className="menu">
        <div>
          <h1 className="menu__title">
            <PixelTitle text="Big Two" />
          </h1>
          <p className="menu__blurb">
            Four seats, thirteen cards each. Beat what is on the table or pass. First to empty their hand wins the
            round.
          </p>

          {/* Grouped by who you play with, most-wanted first: carrying on,
              then the ways to play alone, then the ways to play together.
              Every option is the same width and left-aligned — a column to
              read down, not a row of buttons to compare. */}
          <div className="menu__groups">
            {/* Two games under one roof: Mythic, the descent — classes,
                Medallions, gold as your life — and Classic, Big Two as it is
                played, alone or with friends. */}
            <div className="menu__group">
              <h2 className="menu__heading menu__heading--mode">Mythic</h2>
              {liveRun ? (
                <>
                  <MenuOption label="Continue run" note={runLine} primary onClick={goToCampaign} />
                  <MenuOption label="Start a new run" onClick={() => setReplacing(true)} />
                </>
              ) : (
                <MenuOption label="Start a run" primary={!savedGame} onClick={goToCampaign} />
              )}
              <MenuOption
                label="Compendium"
                note={`${discovered.filter((id) => id in MEDALLIONS).length} of ${Object.keys(MEDALLIONS).length} Medallions found`}
                onClick={() => setCompendiumOpen(true)}
              />
            </div>

            <div className="menu__group">
              <h2 className="menu__heading menu__heading--mode">Classic</h2>
              {savedGame && <MenuOption label="Continue game" primary={!liveRun} onClick={resumeMatch} />}
              <MenuOption label="Play on your own" onClick={goToLobby} />
              <MenuOption
                label={opening ? 'Opening…' : 'Play with friends'}
                disabled={opening}
                onClick={() => void hostOnline()}
              />
              {/* Opening a table and joining one are the same act from
                  opposite ends, so they share a group. */}
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
                <button
                  className="btn"
                  type="submit"
                  disabled={code.trim().length === 0}
                  data-hint="Enter a table code first"
                >
                  Join
                </button>
              </form>
            </div>

            {/* Reference, apart from the ways to play, so it never reads as a
                fourth one. */}
            <div className="menu__group menu__group--more">
              <button className="btn btn--quiet" onClick={() => setRulesOpen(true)}>
                How to play
              </button>
            </div>
          </div>

          {error && <p className="menu__error">{error}</p>}
        </div>

        <div className="menu__hero">
          <CardFace card={{ rank: '2', suit: 'HEART' }} />
        </div>
      </div>

      <RulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <CompendiumSheet open={compendiumOpen} onClose={() => setCompendiumOpen(false)} />

      {replacing && (
        <div className="overlay overlay--confirm" onClick={(e) => e.target === e.currentTarget && setReplacing(false)}>
          <div
            className="overlay__box overlay__box--confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="replace-title"
          >
            <h2 id="replace-title">Start a new run?</h2>
            <p className="overlay__note">
              Your run in progress{runLine ? ` (${runLine})` : ''} ends, with its gold and Medallions.
            </p>
            <div className="overlay__actions">
              <button className="btn btn--quiet" onClick={() => setReplacing(false)} autoFocus>
                Keep my run
              </button>
              <button
                className="btn btn--pass"
                onClick={() => {
                  setReplacing(false);
                  abandon();
                  goToCampaign();
                }}
              >
                Start a new run
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** One way to play: a button the same width as every other, its label at the left edge. */
function MenuOption({
  label,
  note,
  onClick,
  primary = false,
  disabled = false,
}: {
  label: string;
  /** A line under the option saying what it carries on: a run's class, room and gold. */
  note?: string | null;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="menu__option">
      <button
        className={primary ? 'btn btn--primary' : 'btn'}
        onClick={onClick}
        disabled={disabled}
        aria-busy={disabled}
      >
        {label}
      </button>
      {note && <span className="menu__note">{note}</span>}
    </div>
  );
}
