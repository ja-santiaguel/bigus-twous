import {
  CLASSES,
  EVENT_NAMES,
  eventOver,
  FERRYMAN_CALLS,
  haggleChance,
  MEDALLIONS,
  titheOf,
  type Coffer,
  type EventState,
  type FerrymanState,
  type ReliquaryState,
  type RunState,
  type TitheState,
} from '@big-two/campaign';
import { useCampaignStore } from '../../store/campaignStore.js';
import { CardBack, CardFace } from '../card/PixelCard.js';
import { GoldCoin } from '../GoldAmount.js';
import { medallionName } from './medallionText.js';
import { Terms } from '../Terms.js';

/**
 * A ? node: a short scene in the dark with one decision in it. Each is told
 * as the merchant's screen is — a name, a line of who is there and what they
 * want, the thing itself in the middle, and what you can do under it — and
 * says plainly, once it is over, what it cost or paid.
 */

const gold = (n: number) => Math.round(n).toLocaleString('en-GB');

export function EventScene({ run }: { run: RunState }) {
  const event = run.event;
  const leave = useCampaignStore((s) => s.leaveEvent);
  if (!event) return null;
  const over = eventOver(event);
  return (
    <div className="eventscene">
      <div className="panel__title">
        <h2>{EVENT_NAMES[event.id]}</h2>
      </div>
      <Scene run={run} event={event} />
      {over && (
        <div className="panel__start">
          <button className="btn btn--primary btn--wide" onClick={leave} autoFocus>
            Go on down
          </button>
        </div>
      )}
    </div>
  );
}

function Scene({ run, event }: { run: RunState; event: EventState }) {
  switch (event.id) {
    case 'ferryman':
      return <Ferryman run={run} event={event} />;
    case 'reliquary':
      return <Reliquary run={run} event={event} />;
    case 'tithe-taker':
      return <TitheTaker run={run} event={event} />;
  }
}

/** The Ferryman's Wager: a stake, a turned card, higher or lower. */
function Ferryman({ run, event }: { run: RunState; event: FerrymanState }) {
  const act = useCampaignStore((s) => s.act);
  const showing = event.turned[event.turned.length - 1];
  const callsLeft = FERRYMAN_CALLS - event.calls;
  return (
    <>
      <p className="field__hint field__hint--lead">
        A hooded figure at the water&rsquo;s edge, a deck in one hand and an oar in the other. &ldquo;Two of your antes,
        and call my cards. Each one right doubles it. Three at most &mdash; or take it when you like.&rdquo; Cards rank
        as at the table: 3 lowest, 2 highest, and suits break a tie.
      </p>
      <div className="eventscene__cards" aria-label="The Ferryman's cards">
        {event.turned.length === 0 ? (
          <span className="eventscene__card">
            <CardBack />
          </span>
        ) : (
          event.turned.map((card, i) => (
            <span
              key={`${card.rank}${card.suit}`}
              className={`eventscene__card ${i < event.turned.length - 1 ? 'is-past' : ''} ${
                i === event.turned.length - 1 && event.over === 'lost' ? 'is-lost' : ''
              }`}
            >
              <CardFace card={card} />
            </span>
          ))
        )}
      </div>
      <p className="eventscene__stakes">
        {event.turned.length === 0 ? (
          <>
            Stake <GoldCoin /> {gold(event.stake)}
          </>
        ) : event.over === 'lost' ? (
          <span className="eventscene__loss">Wrong. The Ferryman keeps the {gold(event.pot)}.</span>
        ) : event.over === 'taken' ? (
          <span className="eventscene__gain">
            You take <GoldCoin /> {gold(event.pot)}.
          </span>
        ) : (
          <>
            Riding on the next card <GoldCoin /> {gold(event.pot)}
            <small> · {callsLeft === 1 ? 'one call left' : `${callsLeft} calls left`}</small>
          </>
        )}
      </p>
      {event.over === 'declined' && <p className="field__hint">You leave him to the water.</p>}
      {!event.over && (
        <div className="eventscene__actions">
          {event.turned.length === 0 ? (
            <>
              <button
                className="btn btn--primary"
                onClick={() => act({ kind: 'stake' })}
                disabled={run.worth <= event.stake}
                data-hint="Not enough gold"
              >
                Stake {gold(event.stake)}
              </button>
              <button className="btn" onClick={() => act({ kind: 'decline' })}>
                Walk on
              </button>
            </>
          ) : (
            <>
              <button className="btn btn--primary" onClick={() => act({ kind: 'call', higher: true })}>
                Higher than the {showing?.rank}
              </button>
              <button className="btn btn--primary" onClick={() => act({ kind: 'call', higher: false })}>
                Lower than the {showing?.rank}
              </button>
              {event.calls > 0 && (
                <button className="btn" onClick={() => act({ kind: 'take' })}>
                  Take {gold(event.pot)}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

const WEIGHTS: Record<Coffer['weight'], string> = { light: 'Light', between: 'Weighty', heavy: 'Heavy' };

/** The Drowned Reliquary: three coffers by weight; open one, then see the others. */
function Reliquary({ event }: { run: RunState; event: ReliquaryState }) {
  const act = useCampaignStore((s) => s.act);
  const opened = event.opened;
  return (
    <>
      <p className="field__hint field__hint--lead">
        A chapel sunk to its eaves, and on its altar three sealed coffers, dripping. You have hands for one. The lighter
        rattle like a Medallion might; the heavier sit like gold.
      </p>
      <ul className="eventscene__coffers">
        {event.coffers.map((coffer, i) => {
          const shown = opened !== null;
          return (
            <li key={coffer.weight}>
              <button
                type="button"
                className={`eventscene__coffer is-${coffer.weight} ${opened === i ? 'is-opened' : ''} ${
                  shown && opened !== i ? 'is-left' : ''
                }`}
                onClick={() => act({ kind: 'open', coffer: i })}
                disabled={shown}
              >
                <span className="eventscene__weight">{WEIGHTS[coffer.weight]}</span>
                {shown ? (
                  <span className="eventscene__holds">
                    {coffer.holds.kind === 'gold' ? (
                      <>
                        <GoldCoin /> {gold(coffer.holds.amount)}
                      </>
                    ) : (
                      <strong className={`rarity rarity--${MEDALLIONS[coffer.holds.id].rarity}`}>
                        {medallionName(coffer.holds.id, 1)}
                      </strong>
                    )}
                  </span>
                ) : (
                  <span className="eventscene__holds">Sealed</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {opened !== null && (
        <p className="field__hint">
          {event.coffers[opened]!.holds.kind === 'gold' ? 'Gold, and yours.' : 'A Medallion, and yours to carry.'} The
          others sink back under the water with what they held.
        </p>
      )}
    </>
  );
}

/** The Tithe-Taker: pay his cut, haggle it down, or give a Medallion instead. */
function TitheTaker({ run, event }: { run: RunState; event: TitheState }) {
  const act = useCampaignStore((s) => s.act);
  const due = titheOf(run.worth, event.rate);
  const chance = haggleChance(event);
  return (
    <>
      <p className="field__hint field__hint--lead">
        A clerk of the deep with a ledger and a lantern, blocking the only stair down. &ldquo;A tithe for passage. A
        quarter of what you carry.&rdquo; He will bargain, each time a little less gladly &mdash; and a bargain that
        insults him costs more.
      </p>
      <p className="eventscene__stakes">
        {event.over?.kind === 'paid' ? (
          <span className="eventscene__loss">
            You pay <GoldCoin /> {gold(event.over.amount)}.
          </span>
        ) : event.over?.kind === 'pardoned' ? (
          <span className="eventscene__gain">He closes the ledger. You pass for nothing.</span>
        ) : event.over?.kind === 'medallion' ? (
          <span className="eventscene__loss">He takes your {MEDALLIONS[event.over.id].name} and stands aside.</span>
        ) : (
          <>
            His tithe: {event.rate}% · <GoldCoin /> {gold(due)}
            {event.last === 'down' && <small> · he comes down</small>}
            {event.last === 'up' && (
              <small className="eventscene__loss"> · insulted, he goes up, and stops listening</small>
            )}
          </>
        )}
      </p>
      {!event.over && (
        <div className="eventscene__actions">
          <button className="btn btn--primary" onClick={() => act({ kind: 'pay' })}>
            Pay {gold(due)}
          </button>
          {chance !== null && (
            <button className="btn" onClick={() => act({ kind: 'haggle' })}>
              Haggle · {Math.round(chance * 100)}% he comes down
            </button>
          )}
          {run.medallions.map((m) => (
            <button key={m.id} className="btn btn--quiet" onClick={() => act({ kind: 'offer', id: m.id })}>
              Give {medallionName(m.id, m.level)} instead
            </button>
          ))}
        </div>
      )}
      {!event.over && run.medallions.length === 0 && (
        <p className="field__hint">
          A <Terms>Medallion</Terms> would pay him instead; you carry none. As a {CLASSES[run.classId].name}, gold it
          is.
        </p>
      )}
    </>
  );
}
