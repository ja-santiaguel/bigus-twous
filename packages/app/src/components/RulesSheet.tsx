import { useEffect, useRef } from 'react';

/** A rule the table can point at when it is the one that matters right now. */
export type RulesTopic = 'opening' | 'bombs';

/**
 * How to play, in one place, from the menu and from the table.
 *
 * Written from the locked ruleset (Section 9 of the architecture doc) and
 * nothing else. This is not the Big Two most people know — no five-card poker
 * hands, bombs that only beat 2s, passing that takes you out of the whole
 * trick — and a player who knows the other game will otherwise think this one
 * is broken the first time it disagrees with them.
 *
 * In a game it opens on the rule the table is enforcing at that moment: made
 * to bomb a 2, you land on bombs; on the opening play, on the opening rule.
 */
export function RulesSheet({
  open,
  onClose,
  focus,
}: {
  open: boolean;
  onClose: () => void;
  focus?: RulesTopic | undefined;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Held in a ref so a new function from each parent render does not re-run
  // the effect below, which moves focus and would yank it back every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    if (focus) bodyRef.current?.querySelector(`#rules-${focus}`)?.scrollIntoView({ block: 'start' });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      returnTo?.focus();
    };
  }, [open, focus]);

  if (!open) return null;

  const section = (topic: string) => `rules__section ${focus === topic ? 'is-highlight' : ''}`;

  return (
    <div
      className="rules"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="rules__box" role="dialog" aria-modal="true" aria-labelledby="rules-title">
        <header className="rules__head">
          <h2 id="rules-title">How to play</h2>
          <button ref={closeRef} type="button" className="btn btn--quiet" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="rules__body" ref={bodyRef}>
          <section className="rules__section">
            <h3>The goal</h3>
            <p>
              Get rid of every card in your hand. A round keeps going until three players are out, and where you finish
              decides your points.
            </p>
          </section>

          <section className="rules__section">
            <h3>Card order</h3>
            <p>3 is lowest, then 4 5 6 7 8 9 10 J Q K A, and 2 is highest.</p>
            <p>When ranks tie, the suit decides: ♠ lowest, then ♣, ♦, and ♥ highest.</p>
          </section>

          <section className="rules__section">
            <h3>Hands you can play</h3>
            <table className="rules__table">
              <tbody>
                <tr>
                  <th>Single</th>
                  <td>One card.</td>
                </tr>
                <tr>
                  <th>Pair</th>
                  <td>Two cards of the same rank.</td>
                </tr>
                <tr>
                  <th>Triple</th>
                  <td>Three cards of the same rank.</td>
                </tr>
                <tr>
                  <th>Straight</th>
                  <td>Three or more ranks in a row, like 7 8 9. No 2s, and no wrapping past A.</td>
                </tr>
                <tr>
                  <th>Four of a kind</th>
                  <td>All four cards of a rank. A bomb.</td>
                </tr>
                <tr>
                  <th>Pair chain</th>
                  <td>Three or more pairs in a row, like 5 5 6 6 7 7. A bomb.</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="rules__section">
            <h3>Beating the table</h3>
            <p>
              Play the same kind of hand with the same number of cards, and higher. Hands compare by their highest card,
              with suit breaking a tie.
            </p>
            <p>When everybody else has passed, whoever played last clears the table and leads anything they like.</p>
          </section>

          <section className="rules__section">
            <h3>Passing</h3>
            <p>
              Passing takes you out of the whole trick, not just this turn — even if a 2 is played that your bomb could
              chop. You are back in when the table clears.
            </p>
          </section>

          <section className={section('opening')} id="rules-opening">
            <h3>The opening play</h3>
            <p>First round: whoever holds the 3♠ leads, and their first play has to include it.</p>
            <p>Every round after: last round’s winner leads, and their first play has to include their lowest card.</p>
            <p>Any hand that includes that card is allowed — it does not have to be a single.</p>
          </section>

          <section className={section('bombs')} id="rules-bombs">
            <h3>Bombs</h3>
            <p>Bombs only beat 2s. They never beat an ordinary hand.</p>
            <table className="rules__table">
              <tbody>
                <tr>
                  <th>A single 2</th>
                  <td>Four of a kind, or a pair chain of 3 or more pairs.</td>
                </tr>
                <tr>
                  <th>A pair of 2s</th>
                  <td>A pair chain of 4 or more pairs.</td>
                </tr>
                <tr>
                  <th>Three 2s</th>
                  <td>A pair chain of 5 or more pairs.</td>
                </tr>
                <tr>
                  <th>Four 2s</th>
                  <td>Nothing. It cannot be beaten.</td>
                </tr>
              </tbody>
            </table>
            <p>
              A four of a kind and a pair chain never beat each other. Each only beats a higher one of its own kind — a
              pair chain only one of the same length.
            </p>
            <p>If a 2 is on the table and you hold a bomb that beats it, you must play it.</p>
          </section>

          <section className="rules__section">
            <h3>Scoring</h3>
            <p>1st place scores 5, 2nd scores 3, 3rd scores 1, and 4th scores nothing. Points add up across rounds.</p>
            <p>The round’s winner picks their pile first and leads the next round.</p>
            <p>
              A match is first to 15, 30 or 50 points — 30 unless the table chooses otherwise — or the most points after
              5 or 10 rounds. If the leaders are level, whoever won more rounds takes it; if that is level too, one more
              round is played.
            </p>
          </section>

          <section className="rules__section">
            <h3>The deal</h3>
            <p>
              Cards are dealt into four face-down piles, and each player takes one. The piles are random, so no pick is
              better than another.
            </p>
          </section>

          <section className="rules__section">
            <h3>Playing with friends</h3>
            <p>In the lobby, everybody readies up and the host starts the game.</p>
            <p>
              You have 15 seconds to pick a pile. If time runs out, one is picked for you — the piles are face down, so
              nothing is lost.
            </p>
            <p>
              You have 60 seconds for each turn. If time runs out, you pass — or, when you cannot pass, a play is made
              for you.
            </p>
            <p>
              Between rounds, once somebody is ready, the next round deals in 30 seconds. You can cancel ready until it
              deals. A computer plays for anybody who is not ready until they take their seat back.
            </p>
            <p>
              If you leave or lose your connection mid-game, a computer plays your seat and it is held for 2 minutes.
              Rejoin from the same browser tab to take it back.
            </p>
            <p>
              A shared table runs in the host’s browser. Every device adds its own part to each shuffle and replays each
              round when it ends, so the host cannot stack the deal or fake a move — the scores screen says when a round
              checks out. The host’s browser does hold every hand, so play with people you trust.
            </p>
            <p>
              If the host’s page reloads before the game starts, the table waits 60 seconds for them to come back. Once
              the game has started, the host leaving ends it.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
