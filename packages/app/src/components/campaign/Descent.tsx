import { memo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ARCHETYPES,
  buyInFor,
  choices,
  CLASSES,
  entryCost,
  isShort,
  SHORT_SEAT_ANTES,
  tributeOf,
  nodeCost,
  TIERS,
  type MapNode,
  type RunState,
} from '@big-two/campaign';
import { pathsOf, type Drawing } from './ClassArt.js';
import { Terms } from '../Terms.js';
import { InfoTip } from '../InfoTip.js';
import { PersonaLine } from './PersonaLine.js';

/**
 * The descent, drawn: the run's map read from the top down, from the gate you
 * came in by to the Hollow Throne at the bottom.
 *
 * Every node is a small pixel picture of what waits there — a candle for an
 * ordinary table, a skull for an elite one, a purse for the Bone Merchant, a
 * question for something unknown, the throne itself — joined to the nodes below it by the paths you could
 * take. The way you came is drawn in bone; the ways open to you now in gold;
 * everything else dim. Pointing at a node previews everything it holds
 * beside the map — for a table, who sits there too. Clicking it selects it;
 * the button under what it holds is what commits: pays the buy-in and sits
 * you down, or takes you to the merchant.
 */

const ICONS: Record<'table' | 'elite' | 'merchant' | 'event' | 'throne' | 'gate', Drawing> = {
  table: {
    rows: [
      '....+....',
      '...+g+...',
      '....+....',
      '...fff...',
      '...fff...',
      '...fff...',
      '...fff...',
      '..#####..',
      '.#######.',
    ],
    palette: { '+': 'var(--gold)', g: 'var(--gold-hi)', f: 'currentColor', '#': 'currentColor' },
  },
  elite: {
    rows: [
      '..fffff..',
      '.fffffff.',
      '.foofoof.',
      '.foofoof.',
      '.fffofff.',
      '..fffff..',
      '..fdfdf..',
      '...fff...',
      '.........',
    ],
    palette: { f: 'currentColor', o: 'var(--ink)', d: 'var(--ink)' },
  },
  merchant: {
    rows: [
      '...#.#...',
      '....#....',
      '..#####..',
      '.#ggggg#.',
      '#ggg+ggg#',
      '#gg+++gg#',
      '#ggg+ggg#',
      '.#ggggg#.',
      '..#####..',
    ],
    palette: { '#': 'currentColor', g: 'var(--table-hi)', '+': 'var(--gold)' },
  },
  event: {
    rows: [
      '..#####..',
      '.##...##.',
      '.##...##.',
      '.....##..',
      '....##...',
      '....##...',
      '.........',
      '....++...',
      '....++...',
    ],
    palette: { '#': 'currentColor', '+': 'var(--gold)' },
  },
  throne: {
    rows: [
      '+.+.+.+.+',
      '#########',
      '#.......#',
      '#.......#',
      '#.ddddd.#',
      '#########',
      '#.#...#.#',
      '#.#...#.#',
      '#.#...#.#',
    ],
    palette: { '#': 'currentColor', '+': 'var(--gold)', d: 'var(--alert)' },
  },
  gate: {
    rows: ['...###...', '..#...#..', '.#.....#.', '.#.....#.', '.#.....#.'],
    palette: { '#': 'currentColor' },
  },
};

const ICON_PATHS = Object.fromEntries(Object.entries(ICONS).map(([id, drawing]) => [id, pathsOf(drawing)])) as Record<
  keyof typeof ICONS,
  { color: string; d: string }[]
>;

const Icon = memo(function Icon({ id }: { id: keyof typeof ICONS }) {
  const drawing = ICONS[id];
  return (
    <svg
      className="descent__icon"
      viewBox={`0 0 ${drawing.rows[0]!.length} ${drawing.rows.length}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PATHS[id].map(({ color, d }) => (
        <path key={color} d={d} fill={color} />
      ))}
    </svg>
  );
});

const iconOf = (node: MapNode): keyof typeof ICONS =>
  node.kind === 'table' ? (ARCHETYPES[node.archetype!].elite ? 'elite' : 'table') : node.kind;

/** A node's name, as the map labels it. */
export function nodeName(node: MapNode): string {
  if (node.kind === 'merchant') return 'The Bone Merchant';
  if (node.kind === 'event') return 'Something in the dark';
  if (node.kind === 'throne') return 'The Hollow Throne';
  return ARCHETYPES[node.archetype!].name;
}

const gold = (n: number) => Math.round(n).toLocaleString('en-GB');

type NodeState = 'passed' | 'open' | 'ahead' | 'behind';

function stateOf(run: RunState, node: MapNode, open: MapNode[]): NodeState {
  if (run.path.includes(node.id)) return 'passed';
  if (open.includes(node)) return 'open';
  return node.row < run.path.length ? 'behind' : 'ahead';
}

export function Descent({
  run,
  onTake,
  idle,
}: {
  run: RunState;
  onTake: (nodeId: string) => void;
  /** What the side panel holds while no node is selected or pointed at. */
  idle?: ReactNode;
}) {
  const open = choices(run);
  const [picked, setPicked] = useState<string | null>(null);
  const [pointed, setPointed] = useState<string | null>(null);
  const nodes = run.map.rows.flat();
  const shownId = pointed ?? picked;
  const shown = nodes.find((n) => n.id === shownId);

  // One slot for the gate, then one for each row; nodes sit in the middle of their slots.
  const slots = run.map.rows.length + 1;
  const y = (row: number) => ((row + 1.5) / slots) * 100;
  const x = (node: MapNode) => ((node.col + 0.5) / (run.map.rows[node.row]?.length ?? 1)) * 100;
  const at = (left: number, top: number) => ({ '--x': left / 100, '--y': top / 100 }) as CSSProperties;
  const last = run.path[run.path.length - 1];
  const gate = { x: 50, y: (0.5 / slots) * 100 };

  const paths: { key: string; from: { x: number; y: number }; to: { x: number; y: number }; state: string }[] = [];
  for (const node of run.map.rows[0] ?? []) {
    const state = run.path[0] === node.id ? 'passed' : last === undefined ? 'open' : 'ahead';
    paths.push({ key: `gate-${node.id}`, from: gate, to: { x: x(node), y: y(0) }, state });
  }
  for (const node of nodes) {
    for (const id of node.links) {
      const to = nodes.find((n) => n.id === id)!;
      const i = run.path.indexOf(node.id);
      const state = i >= 0 && run.path[i + 1] === id ? 'passed' : node.id === last ? 'open' : 'ahead';
      paths.push({
        key: `${node.id}-${id}`,
        from: { x: x(node), y: y(node.row) },
        to: { x: x(to), y: y(to.row) },
        state,
      });
    }
  }
  // Drawn dim first, so a lit path is never crossed by a dim one.
  const order = { ahead: 0, open: 1, passed: 2 } as Record<string, number>;
  paths.sort((a, b) => order[a.state]! - order[b.state]!);

  return (
    <section className="descent" aria-label="The descent" style={{ '--slots': slots } as CSSProperties}>
      <Legend />
      <div className="descent__map">
        <svg className="descent__paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {paths.map((p) => (
            <line
              key={p.key}
              className={`descent__path is-${p.state}`}
              x1={p.from.x}
              y1={p.from.y}
              x2={p.to.x}
              y2={p.to.y}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <span className="descent__node descent__node--gate is-passed" style={at(gate.x, gate.y)}>
          <Icon id="gate" />
        </span>
        {nodes.map((node) => {
          const state = stateOf(run, node, open);
          const here = node.id === last;
          return (
            <button
              key={node.id}
              type="button"
              className={`descent__node is-${state} ${node.id === picked ? 'is-picked' : ''} ${here ? 'is-here' : ''} ${
                node.kind === 'throne' ? 'descent__node--throne' : ''
              }`}
              style={at(x(node), y(node.row))}
              aria-label={`${nodeName(node)}, depth ${node.row + 1}${
                state === 'passed' ? ', passed' : state === 'open' ? ', open to you' : ''
              }`}
              aria-pressed={node.id === picked}
              onClick={() => setPicked(node.id)}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setPointed(node.id)}
              onPointerLeave={(e) => e.pointerType === 'mouse' && setPointed(null)}
            >
              <Icon id={iconOf(node)} />
            </button>
          );
        })}
      </div>
      {shown ? (
        <NodeDetail
          run={run}
          node={shown}
          state={stateOf(run, shown, open)}
          picked={shown.id === picked}
          onTake={onTake}
        />
      ) : (
        <div className="descent__detail descent__detail--empty">
          <p className="campaign__passive">Select a gold node on the map to see who waits there.</p>
          {idle}
        </div>
      )}
    </section>
  );
}

/** What the map's pictures and lines mean, beside it. */
function Legend() {
  return (
    <aside className="descent__legend" aria-label="Key">
      <h3 className="descent__label">Key</h3>
      <ul>
        <li>
          <span className="descent__node is-legend">
            <Icon id="table" />
          </span>
          A table
        </li>
        <li>
          <span className="descent__node is-legend">
            <Icon id="elite" />
          </span>
          An elite table
        </li>
        <li>
          <span className="descent__node is-legend">
            <Icon id="merchant" />
          </span>
          The Bone Merchant
        </li>
        <li>
          <span className="descent__node is-legend">
            <Icon id="event" />
          </span>
          Something unknown
        </li>
        <li>
          <span className="descent__node is-legend">
            <Icon id="throne" />
          </span>
          The Hollow Throne
        </li>
        <li>
          <span className="descent__legendline is-open" aria-hidden="true" />
          Ways open to you
        </li>
        <li>
          <span className="descent__legendline is-passed" aria-hidden="true" />
          The way you came
        </li>
      </ul>
    </aside>
  );
}

function NodeDetail({
  run,
  node,
  state,
  picked,
  onTake,
}: {
  run: RunState;
  node: MapNode;
  state: NodeState;
  /** Selected, rather than only pointed at: only a selected node can be taken. */
  picked: boolean;
  onTake: (nodeId: string) => void;
}) {
  const room = TIERS[node.tier]!;
  const cost = entryCost(run, node);
  const action =
    state === 'open' ? (
      picked ? (
        <button className="btn btn--primary btn--wide" onClick={() => onTake(node.id)}>
          {node.kind === 'merchant'
            ? 'Go down to the merchant'
            : node.kind === 'event'
              ? 'Go down into the dark'
              : `Pay ${gold(cost ?? 0)} and sit down`}
        </button>
      ) : (
        <p className="campaign__facts">Select it to go here.</p>
      )
    ) : (
      <p className="campaign__facts">
        {state === 'passed'
          ? 'Behind you.'
          : state === 'behind'
            ? 'A way you did not take.'
            : 'Not reachable from where you stand yet.'}
      </p>
    );

  if (node.kind === 'merchant') {
    return (
      <div className="descent__detail" key={node.id}>
        <p className="descent__where">Depth {node.row + 1}</p>
        <h2>The Bone Merchant</h2>
        <p className="campaign__passive">
          Medallions, for gold. No table here: you pass by, buy what you can afford, and go on down.
        </p>
        {action}
      </div>
    );
  }

  if (node.kind === 'event') {
    return (
      <div className="descent__detail" key={node.id}>
        <p className="descent__where">Depth {node.row + 1}</p>
        <h2>Something in the dark</h2>
        <p className="campaign__passive">
          A wager, a find, or a toll: you will not know which until you go down. No table here, and no buy-in.
        </p>
        {action}
      </div>
    );
  }

  const archetype = node.kind === 'throne' ? 'vestige' : node.archetype!;
  const kind = ARCHETYPES[archetype];
  const { ante } = nodeCost(node.tier, archetype);
  const yourAnte = Math.max(1, Math.round(ante * CLASSES[run.classId].anteMultiplier));
  const mark = tributeOf({ markAntes: Math.round(room.markAntes * kind.markMultiplier), ante }, run.classId);
  const offer = run.offers[node.id];
  const prize = (offer?.buyIn ?? nodeCost(node.tier, archetype).buyIn) * 4;
  const short = offer && isShort(offer, run);
  // A short seat shares only the part of the prize it paid into.
  const best = short && offer ? Math.min(prize, (cost ?? 0) * 4) * 0.7 : prize * 0.7;
  return (
    <div className="descent__detail" key={node.id}>
      <div className="descent__group descent__group--head">
        <p className="descent__where">Depth {node.row + 1}</p>
        <h2>
          {kind.elite && <span className="campaign__elite">Elite · </span>}
          {nodeName(node)}
        </h2>
        <p className="campaign__passive">{kind.blurb}</p>
      </div>
      <div className="descent__group descent__stats">
        <span className="stat">
          <span className="stat__label">
            <Terms>Buy-in</Terms>
          </span>
          <span className="stat__value">{gold(cost ?? 0)}</span>
        </span>
        <span className="stat">
          <span className="stat__label">
            <InfoTip label="How your ante here is set" word="Ante">
              <p>What you pay into the pot for each hand here:</p>
              <p className="hud__potline">
                <span>Depth {node.row + 1}</span>
                <span>{gold(room.ante)}</span>
              </p>
              {kind.anteMultiplier !== 1 && (
                <p className="hud__potline">
                  <span>{kind.name}</span>
                  <span>×{kind.anteMultiplier}</span>
                </p>
              )}
              <p className="hud__potline">
                <span>Your ante share, as {CLASSES[run.classId].name}</span>
                <span>×{CLASSES[run.classId].anteMultiplier}</span>
              </p>
              <p className="hud__potline">
                <span>Your ante</span>
                <span>{gold(yourAnte)}</span>
              </p>
            </InfoTip>
          </span>
          <span className="stat__value">{gold(yourAnte)}</span>
        </span>
        <span className="stat">
          <span className="stat__label">
            <Terms>Tribute</Terms>
          </span>
          <span className="stat__value">+{gold(mark)}</span>
        </span>
        <span className="stat">
          <span className="stat__label">Hands</span>
          <span className="stat__value">{room.hands}</span>
        </span>
      </div>
      <div className="descent__group">
        {node.kind === 'throne' ? (
          <p className="campaign__facts">The last table. Win its Requiem and the run is yours.</p>
        ) : (
          <>
            <p className="descent__win">
              Win it: <span className="descent__spoils">+{gold(best)} gold</span> and{' '}
              {kind.reward === 'elite' ? 'a rare Medallion or a level up' : 'a Medallion'}.
            </p>
            <p className="descent__note">
              The table holds {gold(prize)} gold, everyone&rsquo;s buy-in; its winner takes 70%.
            </p>
          </>
        )}
        {short && offer && (
          <p className="descent__short">
            Short seat: you cannot cover the {gold(buyInFor(offer, run.medallions))} buy-in. You put in{' '}
            {gold(cost ?? 0)} and keep {SHORT_SEAT_ANTES} antes to play with, so the prize can pay you at most{' '}
            {gold(best)}.
          </p>
        )}
      </div>
      {offer && (
        <div className="descent__group">
          <h3 className="descent__label">At the table</h3>
          <div className="campaign__lineup">
            {offer.lineup.map((p) => (
              <PersonaLine key={p.key} persona={p} />
            ))}
          </div>
        </div>
      )}
      <div className="descent__group descent__group--action">{action}</div>
    </div>
  );
}
