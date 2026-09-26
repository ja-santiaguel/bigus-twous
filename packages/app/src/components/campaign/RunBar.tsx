import { CLASSES, DEPTHS, depthNumber, PLAYER_SEAT, playCost, you, type RunState } from '@big-two/campaign';
import { ClassEmblem } from './ClassArt.js';
import { medallionEffect, medallionName } from './medallionText.js';
import { InfoTip } from '../InfoTip.js';
import { IDENTITY } from './classIdentity.js';
import { Terms } from '../Terms.js';
import { shownTable } from '../../store/campaignStore.js';
import { GoldAmount } from '../GoldAmount.js';
import { MedallionSprite } from './MedallionArt.js';

const gold = (n: number) => Math.round(n).toLocaleString('en-GB');

/**
 * The run bar: what a run is, always in the same place — who you are, how deep
 * you are and what you carry — on every screen of a run, the table included.
 * (The Menu stays in the top-right corner, where it is on every played screen.)
 *
 * A floating bar along the foot of the screen, inset from it by the same
 * distance as the chrome at the top, so the screens between read as framed.
 * Between tables its largest figure is your gold, as it is your life and your
 * stake at once. At a table it carries your class play beside your gold too — its name, its
 * price now, and its rule on point or tap — and sits between Sort and Clear
 * (`inline`: laid out by the table's foot rather than floating on its own).
 */
export function RunBar({
  run,
  atTable = false,
  inline = false,
  dealt = true,
}: {
  run: RunState;
  atTable?: boolean;
  inline?: boolean;
  /**
   * Whether the hand's cards are out. While the piles are being picked your
   * gold is shown before this hand's ante, which is taken — and seen leaving —
   * as the cards are dealt.
   */
  dealt?: boolean;
}) {
  const c = CLASSES[run.classId];
  const worth = run.table ? you(run.table).worth : run.worth;
  const count = run.medallions.length;
  const table = shownTable({ run });
  const price = table ? playCost(table, you(table)) : 0;
  const inPot = dealt ? (run.table?.hand?.pot.contributions[PLAYER_SEAT] ?? 0) : 0;
  return (
    <nav className={`runbar ${atTable ? 'runbar--table' : ''} ${inline ? 'runbar--inline' : ''}`} aria-label="Your run">
      <span className={`runbar__class classtag--${run.classId}`}>
        <ClassEmblem id={run.classId} className="runbar__emblem" />
        <InfoTip
          label={c.name}
          word={
            <span className="runbar__who">
              <span className="runbar__runname">{run.name}</span>
              <span className="runbar__name">{c.name}</span>
            </span>
          }
        >
          <p>
            <strong>{run.name}</strong>, a {c.name.toLowerCase()} — strength in {c.cards}.
          </p>
          <p>
            <strong>{c.passiveName}</strong> (class play{price > 0 ? `, ${gold(price)} gold` : ''}): {c.passive}
          </p>
          <p>{IDENTITY[run.classId].style}</p>
        </InfoTip>
      </span>
      <span className="runbar__cell runbar__gold">
        <span className="runbar__label">Gold</span>
        <GoldAmount value={worth - inPot} memory="run:gold" className="runbar__amount" />
      </span>
      {atTable && (
        <span className="runbar__cell runbar__play">
          <span className="runbar__label">
            <Terms>Class play</Terms>
          </span>
          <InfoTip
            label={c.passiveName}
            word={
              <span>
                <span className={`classtag classtag--${run.classId}`}>{c.passiveName}</span> ·{' '}
                {price > 0 ? `${gold(price)} gold` : 'free'}
              </span>
            }
          >
            <p>{c.passive}</p>
          </InfoTip>
        </span>
      )}
      <span className="runbar__cell">
        <span className="runbar__label">Depth</span>
        <span>
          {depthNumber(run)} of {DEPTHS}
        </span>
      </span>
      <span className="runbar__cell">
        <span className="runbar__label">Medallions</span>
        {count === 0 ? (
          <span className="runbar__none">None yet</span>
        ) : (
          <span className="runbar__medals">
            {run.medallions.map((m) => (
              <InfoTip
                key={m.id}
                label={medallionName(m.id, m.level)}
                word={
                  <span className="runbar__medal">
                    <MedallionSprite id={m.id} />
                  </span>
                }
              >
                <p>
                  <strong>{medallionName(m.id, m.level)}</strong>
                </p>
                <p>{medallionEffect(m.id, m.level)}</p>
              </InfoTip>
            ))}
          </span>
        )}
      </span>
    </nav>
  );
}
