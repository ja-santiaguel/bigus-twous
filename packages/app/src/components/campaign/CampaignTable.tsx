import { useEffect, useState } from 'react';
import type React from 'react';
import { m } from 'framer-motion';
import {
  anteFor,
  tributeOf,
  PAYOUT,
  CLASSES,
  canCallReckoning,
  swiftBounty,
  isLastCall,
  playCost,
  PLAYER_KEY,
  PLAYER_SEAT,
  MEDALLIONS,
  SHOWDOWN_ANTE,
  keyOf,
  inPlay,
  you,
  type HandOutcome,
  type TableSeat,
  type TableState,
} from '@big-two/campaign';
import type { PlayerId } from '@big-two/engine';
import { SETTLE } from '../../design/motion.js';
import { shownTable, useCampaignStore } from '../../store/campaignStore.js';
import { ClassEmblem } from './ClassArt.js';
import { InfoTip } from '../InfoTip.js';
import { GoldAmount } from '../GoldAmount.js';
import { Terms } from '../Terms.js';

/**
 * The campaign's gold, laid around an ordinary table.
 *
 * The table itself is the same one you play on your own at; these are the
 * pieces a campaign table adds to it: the read-out of the hand, the pot, your
 * gold and the target; the passive plays called out; and the reckoning at the
 * end of each hand.
 */

const gold = (n: number) => `${Math.round(n).toLocaleString('en-GB')}`;
const PLACES = ['1st', '2nd', '3rd', '4th'];

/** The pot this hand, and what you have in it. */
function potOf(table: TableState) {
  const contributions = table.hand?.pot.contributions ?? {};
  return {
    pot: Object.values(contributions).reduce((sum, n) => sum + n, 0),
    atRisk: contributions[PLAYER_SEAT] ?? 0,
  };
}

/**
 * The table's read-out, in the top bar: three instruments, each a label over a
 * line, balanced about the middle — Requiem in pressed to the right edge of
 * its gauge, the Pot centred, the Tribute to the left:
 *
 *   Requiem in — the count, then a block a hand, the last (the Requiem) ringed.
 *   At a Reckoning or the Requiem, its name and "Now".
 *   Pot — this hand's pot, and beside it the Table: the two things a seat can
 *   win here, paid the same way (70/25/5/0). "Pot" says what they are and what
 *   first place takes of each now; each amount says where its gold came from.
 *   Tribute — what you have won here, of what the table asks.
 *
 * Gold amounts are gold, with a coin; counts are bone. Your gold is in the run
 * bar.
 */
export function CampaignInfo() {
  const table = useCampaignStore(shownTable);
  if (!table) return null;
  const { pot } = potOf(table);
  const hands = table.option.hands;
  const hand = Math.min(table.handsPlayed + 1, hands);
  const showdown = table.hand?.showdown ?? false;
  const reckoning = table.hand?.reckoning ?? false;
  const left = hands - hand;
  const seat = you(table);
  // The tribute as gold won here: what it asks, and what you have won so far.
  const asks = tributeOf(table.option, seat.classId);
  const start = table.mark - asks;
  const won = Math.max(0, Math.min(asks, seat.worth - start));
  const ready = seat.worth >= table.mark;
  const contributions = table.hand?.pot.contributions ?? {};
  const prize = Object.values(table.stakes).reduce((sum, n) => sum + n, 0);
  const share = (amount: number, place: number) => Math.floor((amount * PAYOUT[place]!) / 100);
  const nameOf = (s: TableSeat) => (s.id === PLAYER_SEAT ? 'You' : (s.persona?.name ?? s.id));
  return (
    <div className="hud">
      <div className="stat hud__hand">
        <span className="stat__label">
          {showdown ? (
            <span className="campaign__showdown">
              <Terms>{reckoning ? 'Reckoning' : 'Requiem'}</Terms>
            </span>
          ) : (
            <Terms>Requiem in</Terms>
          )}
        </span>
        <span className="hud__line">
          <span className="hud__gauge">
            {Array.from({ length: hands }, (_, i) => {
              const state = `${i < hand - 1 ? 'is-lit' : i === hand - 1 ? 'is-now' : ''} ${i === hands - 1 ? 'is-final' : ''}`;
              return i === hands - 1 ? (
                <InfoTip key={i} label="The last hand" word={<span className={`hud__block ${state}`} />}>
                  <p>
                    The last hand is the Requiem: everyone antes three times, and whoever finishes it first wins the
                    table. Come to it holding the tribute and the table is already yours.
                  </p>
                </InfoTip>
              ) : (
                <span key={i} className={`hud__block ${state}`} aria-hidden="true" />
              );
            })}
          </span>
          <span className="stat__value">
            {showdown ? (
              'Now'
            ) : (
              <>
                {left}
                <small> {left === 1 ? 'hand' : 'hands'}</small>
              </>
            )}
          </span>
        </span>
      </div>
      <div className="stat hud__pot">
        <span className="stat__label">
          <InfoTip label="What can be won here" word="Pot">
            <p>
              Two amounts can be won at this table. The <strong>pot</strong> is this hand&rsquo;s antes and class plays,
              paid out when the hand ends. The <strong>table</strong> is everyone&rsquo;s buy-in, paid out when the
              table ends. Both pay 70% to first, 25% to second, 5% to third and nothing to last.
            </p>
            <p>At the amounts in them now:</p>
            <p className="hud__potline hud__potline--sub">
              <span>Finish this hand first</span>
              <span>{gold(share(pot, 0))} from the pot</span>
            </p>
            <p className="hud__potline hud__potline--sub">
              <span>Win the table</span>
              <span>{gold(share(prize, 0))} from the table</span>
            </p>
          </InfoTip>
        </span>
        <span className="stat__label hud__tablelabel">Table</span>
        <span className="hud__line">
          <InfoTip
            label="Where this pot came from"
            word={
              <GoldAmount value={pot} memory="hud:pot" from={0} className="stat__value hud__gold goldamount--below" />
            }
          >
            <p>This hand&rsquo;s pot, {gold(pot)} gold:</p>
            {inPlay(table).map((s) => {
              const paid = contributions[s.id] ?? 0;
              const antePaid = Math.min(paid, anteFor(table, s, showdown && !(reckoning && s.id === PLAYER_SEAT)));
              const plays = paid - antePaid;
              return (
                <p key={s.id} className="hud__potline hud__potline--sub">
                  <span>{nameOf(s)}</span>
                  <span>
                    {gold(antePaid)} ante{plays > 0 ? ` + ${gold(plays)} class play` : ''}
                  </span>
                </p>
              );
            })}
            <p>Paid out when the hand ends, by where each seat finishes.</p>
          </InfoTip>
        </span>
        <span className="hud__line hud__prize">
          <InfoTip
            label="Where the table's gold came from"
            word={
              <GoldAmount
                value={prize}
                memory={`hud:table:${table.option.id}`}
                from={0}
                className="goldamount--below"
              />
            }
          >
            <p>The table, {gold(prize)} gold: every buy-in paid to sit here.</p>
            {Object.entries(table.stakes).map(([key, staked]) => {
              const sat = table.seats.find((s) => keyOf(s) === key);
              const gone = !sat || sat.broke;
              const name = key === PLAYER_KEY ? 'You' : (sat?.persona?.name ?? personaName(table, key));
              return (
                <p key={key} className="hud__potline hud__potline--sub">
                  <span>
                    {name}
                    {gone ? ' (fallen)' : ''}
                  </span>
                  <span>{gold(staked)}</span>
                </p>
              );
            })}
            <p>Paid out when the table ends, by standing: first place is the richest seat, or you if you win it.</p>
          </InfoTip>
        </span>
      </div>
      <div className={`stat hud__target ${ready ? 'is-ready' : ''}`}>
        <span className="stat__label">{ready ? <Terms>Tribute paid</Terms> : <Terms>Tribute</Terms>}</span>
        <span className="hud__line">
          <span className="stat__value hud__gold">
            <GoldAmount value={won} memory={`hud:tribute:${table.option.id}`} coin={false} />
            <small> of {gold(asks)}</small>
          </span>
        </span>
      </div>
    </div>
  );
}

/** A seat's name from its key, for one who has left the table. */
function personaName(table: TableState, key: string): string {
  const persona = [...table.option.lineup, ...table.option.rail].find((p) => p.key === key);
  return persona?.name ?? 'A player';
}

/** A box in the table's own coordinates. */
export interface TableRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * What just happened at the table, said where it happened: a play only a
 * class's passive allowed is named over the trick in the class's colour
 * ("Decree"), and its cards keep an edge of that colour while they stand, so
 * the one play that bent the rules is never mistaken for one that did not.
 * Keyed by its number, so a second passive play animates afresh.
 */
export function TableFlashes({ rectOf }: { rectOf: (zone: string) => TableRect | null }) {
  const passive = useCampaignStore((s) => s.passivePlay);
  const at = (rect: TableRect | null, above: number) =>
    rect ? { left: rect.x + rect.width / 2, top: rect.y + rect.height * above } : null;
  const passiveAt = passive ? at(rectOf('trick'), 0) : null;
  return (
    <>
      {passive && passiveAt && (
        <Flash
          key={`passive-${passive.seq}`}
          className={`tableflash tableflash--passive classtag--${passive.classId}`}
          style={passiveAt}
          ms={2000}
        >
          {CLASSES[passive.classId].passiveName}
          <small>{CLASSES[passive.classId].name}</small>
        </Flash>
      )}
    </>
  );
}

/**
 * Shown once, then gone. Taken off by a timer rather than left to its
 * animation, so it also leaves when reduced motion switches the animation off.
 */
function Flash({
  className,
  style,
  ms,
  children,
}: {
  className: string;
  style: React.CSSProperties;
  ms: number;
  children: React.ReactNode;
}) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setShown(false), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  if (!shown) return null;
  return (
    <span className={className} style={style} aria-hidden="true">
      {children}
    </span>
  );
}

/**
 * The end of a hand: what each seat paid and took, and what comes next —
 * another hand, a Reckoning once you hold the tribute, or the end of the table.
 */
export function CampaignHandEnd({
  nameOf,
  finishOrder,
}: {
  nameOf: (id: PlayerId) => string;
  finishOrder: PlayerId[];
}) {
  const run = useCampaignStore((s) => s.run);
  const deal = useCampaignStore((s) => s.deal);
  const leave = useCampaignStore((s) => s.leaveTable);
  const settleFinished = useCampaignStore((s) => s.settleFinished);
  // The round is over; if its hand was never settled, settle it now.
  const unsettled = Boolean(run?.table?.hand);
  useEffect(() => {
    if (unsettled) settleFinished(finishOrder);
  }, [unsettled, settleFinished, finishOrder]);
  const outcome: HandOutcome | null = run?.lastHand ?? null;
  const table = run ? shownTable({ run }) : null;
  if (!run || !table || !outcome) return null;

  const end = outcome.end;
  const mine = outcome.ledger[PLAYER_SEAT];
  const ready = !end && canCallReckoning(table);
  const bounty = swiftBounty(table);
  const lastCall = !end && isLastCall(table);
  const headline = end
    ? end.kind === 'won'
      ? 'You win the table'
      : end.kind === 'broke'
        ? 'You have fallen'
        : 'You lose the table'
    : mine && mine.net >= 0
      ? `You take ${gold(mine.net)}`
      : `You lose ${gold(-(mine?.net ?? 0))}`;
  // In finishing order, as the pot paid them.
  // (A result saved before placings were recorded falls back to seat order.)
  const placing = outcome.placing ?? table.seats.map((s) => s.id);
  const rows = placing.flatMap((id) => {
    const seat = table.seats.find((s) => s.id === id);
    return seat ? [{ seat, line: outcome.ledger[id], place: placing.indexOf(id) }] : [];
  });
  const fallen = outcome.left.flatMap((l) => (l.persona ? [l.persona.name] : []));
  // The tribute as gold won here: what it asks, and what you have won so far.
  const asks = tributeOf(table.option, you(table).classId);
  const won = Math.max(0, Math.min(asks, you(table).worth - (table.mark - asks)));
  const held = you(table).worth >= table.mark;
  const handsLeft = table.option.hands - table.handsPlayed;

  return (
    <m.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={SETTLE}>
      <m.div
        className="overlay__box campaign__handend"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...SETTLE, delay: 0.12 }}
      >
        <h2>{headline}</h2>
        <ul className="overlay__scores handend__scores">
          {rows.map(({ seat, line, place }) => (
            <li key={seat.id} className={seat.id === PLAYER_SEAT ? 'is-you' : ''}>
              <span className="overlay__place">{PLACES[place] ?? ''}</span>
              <span>{seat.id === PLAYER_SEAT ? 'You' : nameOf(seat.id)}</span>
              <span className={`overlay__gain ${line && line.net < 0 ? 'is-loss' : ''}`}>
                {line ? `${line.net >= 0 ? '+' : '−'}${gold(Math.abs(line.net))}` : ''}
              </span>
              <strong>{gold(seat.worth)}</strong>
            </li>
          ))}
        </ul>

        {/* What happened besides the cards, as tagged lines: a Medallion that
            moved gold, a player who fell, a bounty. */}
        {(outcome.effects.length > 0 || fallen.length > 0 || (outcome.swift ?? 0) > 0) && (
          <ul className="handend__events">
            {outcome.effects.map((e, i) => (
              <li key={`e${i}`}>
                <span className="handend__tag">{MEDALLIONS[e.medallion].name}</span>
                <span>{e.seat === PLAYER_SEAT ? 'You' : nameOf(e.seat)}</span>
                <span className="handend__amount">+{gold(e.amount)}</span>
              </li>
            ))}
            {fallen.map((name) => (
              <li key={`f${name}`} className="is-fallen">
                <span className="handend__tag">Fallen</span>
                <span>{name}</span>
                <span className="handend__amount">chair empty</span>
              </li>
            ))}
            {(outcome.swift ?? 0) > 0 && (
              <li className="is-gain">
                <span className="handend__tag">Bounty</span>
                <span>Reckoning won early</span>
                <span className="handend__amount">+{gold(outcome.swift!)}</span>
              </li>
            )}
          </ul>
        )}

        {end ? (
          <TableEarnings
            table={table}
            end={end}
            swift={outcome.swift ?? 0}
            spoils={
              end.kind !== 'won'
                ? 'None'
                : run.phase === 'reward'
                  ? run.rewards.length > 1
                    ? 'A choice of two'
                    : 'A Medallion'
                  : table.option.reward === 'none'
                    ? 'The run'
                    : 'None this time'
            }
          />
        ) : (
          <>
            <div className="handend__status">
              <div className={`handend__stat ${held ? 'is-held' : ''}`}>
                <span className="handend__label">{held ? 'Tribute held' : 'Tribute'}</span>
                <span className="handend__value">
                  {gold(won)}
                  <small> / {gold(asks)}</small>
                </span>
                <span className="handend__bar" aria-hidden="true">
                  <span style={{ width: `${Math.round((won / Math.max(1, asks)) * 100)}%` }} />
                </span>
              </div>
              <div className="handend__stat">
                <span className="handend__label">Hands left</span>
                <span className="handend__value">{handsLeft}</span>
                <span className="handend__pips" aria-hidden="true">
                  {Array.from({ length: table.option.hands }, (_, i) => (
                    <span
                      key={i}
                      className={`${i < table.handsPlayed ? 'is-played' : ''} ${i === table.option.hands - 1 ? 'is-final' : ''}`}
                    />
                  ))}
                </span>
              </div>
              <div className="handend__stat">
                <span className="handend__label">Next</span>
                <span className="handend__value">{lastCall ? 'Requiem' : 'A hand'}</span>
                <span className="handend__sub">{lastCall ? 'the last' : `Requiem in ${handsLeft - 1}`}</span>
              </div>
            </div>
            {lastCall && (
              <div className="handend__offer is-requiem">
                <span className="handend__offername">Requiem</span>
                <span className="handend__chips">
                  <span>Everyone ×{SHOWDOWN_ANTE}</span>
                  <span>First wins the table</span>
                </span>
              </div>
            )}
            {ready && (
              <div className="handend__offer">
                <span className="handend__offername">Reckoning</span>
                <span className="handend__chips">
                  <span>They ×{SHOWDOWN_ANTE}</span>
                  <span>You ×1</span>
                  <span>Whole pot</span>
                  <span className="is-gold">+{gold(bounty)} bounty</span>
                  <span>Once</span>
                </span>
              </div>
            )}
          </>
        )}

        <div className="overlay__actions">
          {end ? (
            <button className="btn btn--primary" onClick={leave}>
              {end.kind === 'won' ? 'Leave the table' : run.phase === 'lost' ? 'See how it went' : 'Go on down'}
            </button>
          ) : lastCall ? (
            <button className="btn btn--primary" onClick={() => deal(true)}>
              Play the Requiem
            </button>
          ) : (
            <>
              {ready && (
                <button className="btn btn--primary" onClick={() => deal(true)}>
                  Call a Reckoning
                </button>
              )}
              <button className={ready ? 'btn' : 'btn btn--primary'} onClick={() => deal(false)}>
                Next hand
              </button>
            </>
          )}
        </div>
      </m.div>
    </m.div>
  );
}

/**
 * A table's end, told as a ledger: what you paid to sit, what the hands
 * brought, what the table's gold paid you by standing, any bounty — and the
 * net, with your gold before and after. Then the spoils.
 */
function TableEarnings({
  table,
  end,
  swift,
  spoils,
}: {
  table: TableState;
  end: NonNullable<HandOutcome['end']>;
  swift: number;
  spoils: string;
}) {
  const stake = end.stakes[PLAYER_KEY] ?? { staked: 0, got: 0 };
  // Gold on sitting down, after the buy-in: where the tribute was counted from.
  const seated = table.mark - tributeOf(table.option, you(table).classId);
  const before = seated + stake.staked;
  const after = you(table).worth;
  const hands = after - stake.got - swift - seated;
  const net = after - before;
  const line = (label: string, amount: number, className = '') => (
    <li className={className}>
      <span>{label}</span>
      <span className={amount < 0 ? 'is-loss' : 'is-gain'}>
        {amount >= 0 ? '+' : '−'}
        {gold(Math.abs(amount))}
      </span>
    </li>
  );
  return (
    <div className="handend__earnings">
      <h3>The table</h3>
      <ul className="handend__ledger">
        {line('Buy-in', -stake.staked)}
        {line('Hands', hands)}
        {line(end.kind === 'won' ? 'Table, first' : 'Table, by standing', stake.got)}
        {swift > 0 && line('Bounty', swift)}
        {line('Net', net, 'is-total')}
      </ul>
      <p className="handend__journey">
        <span>{gold(before)}</span>
        <span className="handend__arrow" aria-hidden="true">
          →
        </span>
        <strong className={net < 0 ? 'is-loss' : 'is-gain'}>{gold(after)}</strong>
        <small>gold</small>
      </p>
      <p className="handend__spoils">
        <span className="handend__label">Spoils</span> {spoils}
      </p>
    </div>
  );
}

/**
 * Who you are at this table: your class's emblem and name in its colour, and
 * its rule — the one thing you can do that the others cannot, kept in sight
 * rather than remembered from the class screen. On a phone, where the row is
 * narrow, the emblem and name alone, with the rule on hover or long-press.
 */
export function ClassBadge({ compact = false }: { compact?: boolean }) {
  const classId = useCampaignStore((s) => s.run?.classId ?? null);
  const table = useCampaignStore(shownTable);
  if (!classId) return null;
  const c = CLASSES[classId];
  const cost = table ? playCost(table, you(table)) : 0;
  const price = cost > 0 ? `${gold(cost)} gold` : 'free';
  return (
    <span
      className={`classbadge classbadge--${classId}`}
      title={`${c.passiveName}, a class play (${price}): ${c.passive}`}
    >
      <ClassEmblem id={classId} className="classbadge__emblem" />
      <span className="classbadge__name">{c.name}</span>
      {!compact && (
        <span className="classbadge__rule">
          <span className="classbadge__rulename">{c.passiveName}</span>{' '}
          <span className="classbadge__cost">
            (<Terms>class play</Terms>, {price})
          </span>{' '}
          <Terms>{c.passive}</Terms>
        </span>
      )}
    </span>
  );
}
