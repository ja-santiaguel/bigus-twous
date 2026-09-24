import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  DEPTHS,
  depthNumber,
  CLASS_IDS,
  CLASSES,
  levelOf,
  MEDALLIONS,
  medallionPrice,
  PASSIVE_COST_ANTES,
  SHOWDOWN_ANTE,
  WORLD_NAME,
  type ClassId,
  type MedallionId,
  type RunState,
} from '@big-two/campaign';
import { useCampaignStore } from '../store/campaignStore.js';
import { useGameStore } from '../store/gameStore.js';
import { ClassEmblem } from '../components/campaign/ClassArt.js';
import { IDENTITY, PROFILE_LABELS } from '../components/campaign/classIdentity.js';
import { TableMenu, type MenuItem } from '../components/TableMenu.js';
import { RunBar } from '../components/campaign/RunBar.js';
import { medallionName } from '../components/campaign/medallionText.js';
import { Descent } from '../components/campaign/Descent.js';
import { EventScene } from '../components/campaign/EventScene.js';
import { CompendiumSheet } from '../components/campaign/CompendiumSheet.js';
import { Terms } from '../components/Terms.js';
import { InfoTip } from '../components/InfoTip.js';

/**
 * The campaign between tables: choosing a class, the descent's map, the spoils
 * of a table won and the Bone Merchant.
 *
 * Every screen of a run sits above the same floating run bar — your class,
 * your gold, how deep you are, what you carry, the menu — and the map is where
 * every step between tables is chosen, so a run reads as one descent, not a
 * string of menus.
 *
 * Words are the plain ones: a table's *tribute* is the gold you must hold
 * before you can try to win it, and the *buy-in* is what you put up to sit.
 */

const gold = (n: number) => Math.round(n).toLocaleString('en-GB');

export function Campaign() {
  const run = useCampaignStore((s) => s.run);
  const welcoming = useCampaignStore((s) => s.welcoming);
  const over = run ? run.phase === 'won' || run.phase === 'lost' : false;
  if (run && welcoming) return <Welcome run={run} />;
  return (
    <CampaignFrame run={run} canEnd={run !== null && !over}>
      {run ? <Phase run={run} /> : <ClassPick />}
    </CampaignFrame>
  );
}

/**
 * The whole screen, as a game screen is: the Menu in the top-right corner, as
 * at the table, the screen's content across the width rather than in a box,
 * and during a run the run bar along the foot.
 */
function CampaignFrame({
  run,
  canEnd,
  children,
}: {
  run: RunState | null;
  canEnd: boolean;
  children: React.ReactNode;
}) {
  const goToMenu = useGameStore((s) => s.goToMenu);
  const abandon = useCampaignStore((s) => s.abandon);
  const arriving = useCampaignStore((s) => s.arriving);
  const [ending, setEnding] = useState(false);
  const [compendiumOpen, setCompendiumOpen] = useState(false);
  const menu: MenuItem[] = [
    { label: 'Compendium', onSelect: () => setCompendiumOpen(true) },
    { label: run ? 'Save and quit to main menu' : 'Back to main menu', onSelect: goToMenu },
    ...(canEnd ? [{ label: 'End this run', onSelect: () => setEnding(true), quiet: true }] : []),
  ];
  return (
    <div className={`screen campaignscreen campaign ${run ? 'has-runbar' : ''} ${arriving ? 'is-arriving' : ''}`}>
      <TableMenu items={menu} />
      {run && (
        // The top bar, on the Menu's line: the world the run is in, and how
        // deep in it you are.
        <header className="worldbar">
          <h1>{WORLD_NAME}</h1>
          <span>
            Depth {depthNumber(run)} of {DEPTHS}
          </span>
        </header>
      )}
      {run && <RunBar run={run} />}
      <main className="campaignscreen__body">{children}</main>
      <CompendiumSheet open={compendiumOpen} onClose={() => setCompendiumOpen(false)} />
      {ending && (
        <div className="overlay overlay--confirm" onClick={(e) => e.target === e.currentTarget && setEnding(false)}>
          <div
            className="overlay__box overlay__box--confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="end-title"
          >
            <h2 id="end-title">End this run?</h2>
            <p className="overlay__note">Its gold and Medallions are lost, and you choose a class for a new one.</p>
            <div className="overlay__actions">
              <button className="btn btn--quiet" onClick={() => setEnding(false)} autoFocus>
                Keep playing
              </button>
              <button
                className="btn btn--pass"
                onClick={() => {
                  setEnding(false);
                  abandon();
                }}
              >
                End run
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The threshold of a run: before the map, a dark screen that names you. The
 * world's name, dim; "Welcome, Sunk Wake." large; one line saying who you are
 * and what the deep asks; and the way down. Each comes out of the dark in
 * turn, once, and anything — a click, a key — goes on.
 */
/** How long the fall from the welcome to the map takes. */
const FALL_MS = 1600;

function Welcome({ run }: { run: RunState }) {
  const descendNow = useCampaignStore((s) => s.descend);
  const c = CLASSES[run.classId];
  const [falling, setFalling] = useState(false);
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  // Going down is a fall: the welcome rushes up and away past you, streaked,
  // and only then does the map come up to meet you. Once, whatever is pressed.
  const descend = useCallback(() => {
    if (falling) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      descendNow();
      return;
    }
    setFalling(true);
    window.setTimeout(descendNow, FALL_MS);
  }, [falling, descendNow]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        descend();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [descend]);
  return (
    <div className={`screen welcome ${falling ? 'is-falling' : ''}`} onClick={descend}>
      <span className="welcome__streaks" aria-hidden="true" />
      <div className="welcome__body">
        <p className="welcome__world">{WORLD_NAME}</p>
        <h1 className="welcome__name">
          Welcome, <span className={`classtag--${run.classId} welcome__who`}>{run.name}</span>.
        </h1>
        <p className="welcome__line">
          A {c.name.toLowerCase()} with {gold(run.worth)} gold and nothing else. The deep takes its toll in gold; go
          down, and do not fall.
        </p>
      </div>
      {/* No button to aim for: the whole screen is the way down. The prompt
          says so, quietly, once the rest has been read — a line and a chevron
          drifting downward — and is itself a control for keys and readers. */}
      <button
        type="button"
        className="welcome__prompt"
        onClick={(e) => {
          e.stopPropagation();
          descend();
        }}
        autoFocus
      >
        <span>{touch ? 'Tap' : 'Click'} to descend</span>
        <svg className="welcome__chevron" viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true">
          <path fill="currentColor" d="M0 0h1v1H0zM6 0h1v1H6zM1 1h1v1H1zM5 1h1v1H5zM2 2h1v1H2zM4 2h1v1H4zM3 3h1v1H3z" />
          <path
            fill="currentColor"
            opacity="0.5"
            d="M0 3h1v1H0zM6 3h1v1H6zM1 4h1v1H1zM5 4h1v1H5zM2 5h1v1H2zM4 5h1v1H4zM3 6h1v1H3z"
          />
        </svg>
      </button>
    </div>
  );
}

function Phase({ run }: { run: RunState }) {
  switch (run.phase) {
    case 'map':
      return <MapStep run={run} />;
    case 'table':
      return <Rejoin />;
    case 'reward':
      return <Reward run={run} />;
    case 'shop':
      return <Shop run={run} />;
    case 'event':
      return <EventScene run={run} />;
    case 'won':
    case 'lost':
      return <RunOver run={run} />;
  }
}

/**
 * The four classes, dealt as a hand of cards. Each is a card of its own — its
 * ranks in the corner, its emblem at the centre, its name across the foot —
 * and the one you point at lifts out of the fan, as a card does in your hand.
 * What it does and how it plays is read under the hand, so the cards stay
 * cards. The fourth lies face down: a class not yet open to you.
 */
function ClassPick() {
  const begin = useCampaignStore((s) => s.begin);
  const vestiges = useCampaignStore((s) => s.vestiges);
  const [picked, setPicked] = useState<ClassId>('commoner');
  // The card under the pointer previews its class; letting go of it goes back
  // to the one picked. Beginning is always as the picked one.
  const [pointed, setPointed] = useState<ClassId | null>(null);
  const shown = pointed ?? picked;
  const c = CLASSES[shown];
  const who = IDENTITY[shown];
  // What a class play costs, in antes: every time it is made, at every table.
  const playPrice = anteWords(PASSIVE_COST_ANTES[shown]);
  return (
    <div className="classpick">
      <div className="classpick__hand">
        <header className="classpick__head">
          <h2>Choose who you are</h2>
          <p className="field__hint field__hint--lead">
            Descend through the Hollow Deep to the Hollow Throne, each depth crueller than the last. Your gold is your
            life: every hand costs an ante, the pot pays by where you finish, and the run ends when your gold does.
          </p>
        </header>

        <ul className="classhand" role="radiogroup" aria-label="Class">
          {CLASS_IDS.map((id) => (
            <li key={id}>
              <ClassCard
                id={id}
                picked={picked === id}
                onPick={() => setPicked(id)}
                onPoint={(on) => setPointed(on ? id : null)}
              />
            </li>
          ))}
          <li>
            <div
              className="classcard classcard--seer is-sealed"
              aria-label="A class not yet open to you"
              title="Sealed. Not yet at the table."
              role="img"
            >
              <span className="classcard__index" aria-hidden="true">
                ?
              </span>
              <span className="classcard__art" aria-hidden="true">
                <ClassEmblem id="seer" />
              </span>
              <span className="classcard__name" aria-hidden="true">
                Sealed
              </span>
            </div>
          </li>
        </ul>
      </div>

      {/* Keyed by the class, so switching fades the new one in; its groups keep
          fixed heights, so nothing on the screen moves as it does. */}
      <section key={shown} className={`classdetail classdetail--${shown}`} aria-live="polite">
        <div className="classdetail__title">
          <strong className={`classtag classtag--${shown}`}>{c.name}</strong>
          <span>Strength in {c.cards}</span>
        </div>
        <div className="classdetail__group">
          <h3>
            Class play · <span className={`classtag classtag--${shown}`}>{c.passiveName}</span>
          </h3>
          <p className="classdetail__rule">
            <Terms>{c.passive}</Terms>
          </p>
          <p className="classdetail__note">Costs {playPrice} each time you make it, paid into the pot.</p>
        </div>
        {/* No heading: each figure carries its own label. */}
        <div className="classdetail__group">
          <div className="classdetail__stats">
            <span className="stat">
              <span className="stat__label">Starting gold</span>
              <span className="stat__value">{gold(c.startingWorth)}</span>
            </span>
            <span className="stat">
              <span className="stat__label">
                <InfoTip label="What your ante share means" word="Ante share">
                  <p>
                    Every table sets an ante for the hand. The {c.name} pays ×{c.anteMultiplier} of it — at a table
                    asking 40, that is {gold(Math.max(1, Math.round(40 * c.anteMultiplier)))}.
                  </p>
                  <p>
                    You can win from each seat only as much as you put in, so a smaller share means cheaper hands and
                    smaller wins; a bigger one, dearer hands and bigger wins.
                  </p>
                  <p>The ante on a map node is already yours: the table&rsquo;s ante times this.</p>
                </InfoTip>
              </span>
              <span className="stat__value">×{c.anteMultiplier}</span>
            </span>
          </div>
          <p className="classdetail__note">{stakeNote(c.anteMultiplier)}</p>
        </div>
        <div className="classdetail__group">
          <h3>How it plays</h3>
          <p className="classdetail__style">{who.style}</p>
        </div>
        <div className="classdetail__profile">
          {PROFILE_LABELS.map(({ key, label, hint }) => (
            <span key={key} className="classcard__meter" title={hint}>
              <span>{label}</span>
              <span className="classcard__pips" aria-label={`${who.profile[key]} of 3`}>
                {[1, 2, 3].map((n) => (
                  <span key={n} className={n <= who.profile[key] ? 'is-on' : ''} />
                ))}
              </span>
            </span>
          ))}
        </div>
        {vestiges.length > 0 && (
          <p className="field__hint">
            {vestiges.length === 1
              ? 'One of your past victories waits'
              : `${vestiges.length} of your past victories wait`}{' '}
            on the Hollow Throne.
          </p>
        )}
      </section>

      {/* The way in, bottom right, apart from the reading: what you press once
          you have chosen, where a game puts its "embark". */}
      <button className="btn btn--primary classpick__begin" onClick={() => begin(picked)}>
        Begin as the {CLASSES[picked].name}
      </button>
    </div>
  );
}

function ClassCard({
  id,
  picked,
  onPick,
  onPoint,
}: {
  id: ClassId;
  picked: boolean;
  onPick: () => void;
  onPoint: (on: boolean) => void;
}) {
  const c = CLASSES[id];
  const who = IDENTITY[id];
  return (
    <button
      className={`classcard classcard--${id} ${picked ? 'is-picked' : ''}`}
      role="radio"
      aria-checked={picked}
      aria-label={`${c.name}: ${c.passiveName}`}
      onClick={onPick}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onPoint(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && onPoint(false)}
    >
      <span className="classcard__index" aria-hidden="true">
        {who.index}
      </span>
      <span className="classcard__art" aria-hidden="true">
        <ClassEmblem id={id} />
      </span>
      <span className="classcard__name" aria-hidden="true">
        {c.name}
      </span>
    </button>
  );
}

/** How a table works, in the order it happens. */
function HowATableWorks() {
  return (
    <ol className="campaign__steps">
      <li>
        <strong>Buy in</strong>
        <span>
          <Terms>Pay the table’s buy-in to take a seat. Everyone pays the same.</Terms>
        </span>
      </li>
      <li>
        <strong>Pay the tribute</strong>
        <span>
          <Terms>Win the tribute in hands, and hold it to the last hand: the table is yours.</Terms>
        </span>
      </li>
      <li>
        <strong>Or win a showdown</strong>
        <span>
          <Terms>{`Call a Reckoning once you hold the tribute, or play the Requiem, the last hand, at ${SHOWDOWN_ANTE} antes: finish first and the table is yours.`}</Terms>
        </span>
      </li>
    </ol>
  );
}

/** The map: where to go next. */
function MapStep({ run }: { run: RunState }) {
  const choose = useCampaignStore((s) => s.choose);
  return (
    <>
      <Descent key={`${run.path.length}-${run.round}`} run={run} onTake={choose} idle={<HowATableWorks />} />
    </>
  );
}

function Rejoin() {
  const rejoin = useCampaignStore((s) => s.rejoin);
  return (
    <>
      <p className="field__hint field__hint--lead">
        You left your table. Your seat is kept, and the next hand deals when you sit back down — a hand you left
        unfinished counts as finishing it last.
      </p>
      <div className="panel__start">
        <button className="btn btn--primary btn--wide" onClick={rejoin}>
          Back to the table
        </button>
      </div>
    </>
  );
}

function Shop({ run }: { run: RunState }) {
  const buy = useCampaignStore((s) => s.buy);
  const leave = useCampaignStore((s) => s.leaveShop);
  return (
    <>
      <div className="panel__title">
        <h2>The Bone Merchant</h2>
      </div>
      <p className="field__hint field__hint--lead">
        Medallions for a {CLASSES[run.classId].name}, and now and then one any class can carry. Gold spent here is gold
        you cannot lose at a table — or win with.
      </p>
      <ul className="campaign__choices campaign__choices--grid">
        {run.shopOffers.map((id) => {
          const price = medallionPrice(id, run.tier);
          const level = levelOf(run.medallions, id) + 1;
          return (
            <li key={id}>
              <div className="campaign__choice">
                <MedallionHead id={id} level={level} tag={level > 1 ? 'Level up' : undefined} />
                <span className="campaign__passive">
                  <Terms>{MEDALLIONS[id].levels[level - 1]!}</Terms>
                </span>
                <button
                  className="btn"
                  onClick={() => buy(id)}
                  disabled={run.worth <= price}
                  data-hint="Not enough gold"
                >
                  Buy for {gold(price)}
                </button>
              </div>
            </li>
          );
        })}
        {run.shopOffers.length === 0 && <li className="field__hint">Nothing left to buy.</li>}
      </ul>
      <div className="panel__start">
        <button className="btn btn--primary btn--wide" onClick={leave}>
          Go on down
        </button>
      </div>
    </>
  );
}

/** A Medallion's name at the level on offer, and its rarity — or what else to say of it. */
function MedallionHead({ id, level, tag }: { id: MedallionId; level: number; tag?: string | undefined }) {
  const rarity = MEDALLIONS[id].rarity;
  return (
    <span className="campaign__choicehead">
      <strong className={`rarity rarity--${rarity}`}>{medallionName(id, level)}</strong>
      <span>
        {tag ??
          `${rarity === 'legendary' ? 'Legendary' : rarity === 'rare' ? 'Rare' : 'Common'}${
            MEDALLIONS[id].classId === null ? ' · any class' : ''
          }`}
      </span>
    </span>
  );
}

/**
 * A table won: choose what it gives. A new Medallion, a level up for one you
 * carry, or — from a player of your class you beat — the one they carried.
 * Or nothing, which is sometimes the build.
 */
function Reward({ run }: { run: RunState }) {
  const claim = useCampaignStore((s) => s.claim);
  // An ordinary table leaves one Medallion, when it leaves any; an elite
  // offers a choice of two.
  const choice = run.rewards.length > 1;
  return (
    <>
      <div className="panel__title">
        <h2>{choice ? 'The spoils' : 'Among the winnings'}</h2>
      </div>
      <p className="field__hint field__hint--lead">
        {choice
          ? 'The elite table yields a choice of two. Take one; it stays with you for the rest of the descent.'
          : 'A Medallion was left on the table. Take it, and it stays with you for the rest of the descent.'}
      </p>
      <ul className="campaign__choices campaign__choices--grid">
        {run.rewards.map((offer, i) => (
          <li key={`${offer.id}-${offer.kind}`}>
            <div className="campaign__choice">
              <MedallionHead
                id={offer.id}
                level={offer.level}
                tag={offer.kind === 'upgrade' ? 'Level up' : offer.kind === 'loot' ? 'Spoils' : undefined}
              />
              <span className="campaign__passive">
                <Terms>{MEDALLIONS[offer.id].levels[offer.level - 1]!}</Terms>
              </span>
              <span className="campaign__facts">
                {offer.kind === 'loot'
                  ? `Carried by ${offer.from ?? 'a player you beat'}.`
                  : offer.kind === 'upgrade'
                    ? `You carry ${medallionName(offer.id, offer.level - 1)}.`
                    : 'New.'}
              </span>
              <button className="btn" onClick={() => claim(i)}>
                Take it
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="panel__start">
        <button className="btn btn--quiet" onClick={() => claim(null)}>
          {choice ? 'Take neither' : 'Leave it'}
        </button>
      </div>
    </>
  );
}

function RunOver({ run }: { run: RunState }) {
  const abandon = useCampaignStore((s) => s.abandon);
  const won = run.phase === 'won';
  return (
    <>
      <div className="panel__title">
        <h2>{won ? 'The throne is yours' : 'Fallen, and buried'}</h2>
      </div>
      <p className="field__hint field__hint--lead">
        {won
          ? 'You won the Hollow Throne. This run now waits there, a Vestige, for the runs that come after it.'
          : `Your gold ran out at depth ${depthNumber(run)} of ${DEPTHS}.`}
      </p>
      <p className="campaign__facts">
        Tables won {run.stats.tablesWon} · hands played {run.stats.handsPlayed} · most gold {gold(run.stats.bestWorth)}
      </p>
      <div className="panel__start">
        <button className="btn btn--primary btn--wide" onClick={abandon}>
          Start a new run
        </button>
      </div>
    </>
  );
}

/** What a class's share of the ante means at the table, in a line. */
function stakeNote(share: number): string {
  if (share < 1) return 'Pays less than the table asks: cheap hands, small wins.';
  if (share > 1) return 'Pays more than the table asks: dear hands, big wins.';
  return 'Pays what the table asks.';
}

/** A price in antes, as it is said: half your ante, one and a half antes. */
function anteWords(antes: number): string {
  if (antes === 0.5) return 'half your ante';
  if (antes === 0.75) return 'three quarters of your ante';
  if (antes === 1) return 'your ante';
  if (antes === 1.5) return 'one and a half antes';
  return `${antes} antes`;
}
