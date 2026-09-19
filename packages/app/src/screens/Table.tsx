import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { cardId, PLACEMENT_POINTS, type Card, type Combo, type GameEvent, type TurnConstraint } from '@big-two/engine';
import { useGameStore, SEAT_IDS } from '../store/gameStore.js';
import { buildTableView } from '../lib/tableView.js';
import { evaluateSelection, turnPrompt } from '../lib/selection.js';
import { cardSpoken, cardsLabel, personName, seatPosition } from '../lib/format.js';
import { useSeatNames } from '../lib/useSeatNames.js';
import { OpponentSeat } from '../components/board/OpponentSeat.js';
import { PlaceBadge } from '../components/board/PlaceBadge.js';
import { TableCentre } from '../components/board/TableCentre.js';
import { Hand } from '../components/hand/Hand.js';
import { EventLog } from '../components/EventLog.js';
import { SortControl } from '../components/hand/SortControl.js';
import { PileCeremony } from '../components/board/PileCeremony.js';
import { applyOrder } from '../lib/handOrder.js';
import { buildScene } from '../lib/cardScene.js';
import { DRAG_Z, HOVER_Z, openTrickLayout, type SceneMetrics } from '../lib/zoneGeometry.js';
import { useZoneRects } from '../lib/useZoneRects.js';
import { CardLayer, type CardVisual } from '../components/table/CardLayer.js';
import { TurnDot } from '../components/board/TurnDot.js';
import { TurnClock } from '../components/board/TurnClock.js';
import { Copyable } from '../components/Copyable.js';
import { PixelIcon } from '../components/PixelIcon.js';
import { RulesSheet } from '../components/RulesSheet.js';
import { useCountdown } from '../lib/useCountdown.js';
import { matchSummary } from '../components/MatchField.js';
import { BombCallout, useBombMoment } from '../components/board/BombMoment.js';
import { useTableDrag } from '../lib/useTableDrag.js';
import { useSweepSelect, sweepStyle } from '../lib/useSweepSelect.js';
import { CARD_SCALE } from '../design/cardScale.js';
import { SETTLE } from '../design/motion.js';
import { TableMenu } from '../components/TableMenu.js';
import { COMPACT_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';

const NO_HISTORY: GameEvent[] = [];

export function Table() {
  const playerView = useGameStore((s) => s.view);
  const online = useGameStore((s) => s.online);
  const connection = useGameStore((s) => s.connection);
  const clock = useGameStore((s) => s.clock);
  const selection = useGameStore((s) => s.selection);
  const legalMoves = useGameStore((s) => s.legalMoves);
  const canPass = useGameStore((s) => s.canPass);
  const constraint = useGameStore((s) => s.constraint);
  const awaitingHuman = useGameStore((s) => s.awaitingHuman);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const seed = useGameStore((s) => s.seed);
  const error = useGameStore((s) => s.error);
  const toggleCard = useGameStore((s) => s.toggleCard);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const playSelection = useGameStore((s) => s.playSelection);
  const pass = useGameStore((s) => s.pass);
  const startNextRound = useGameStore((s) => s.startNextRound);
  const leaveTable = useGameStore((s) => s.leaveTable);
  const handOrder = useGameStore((s) => s.handOrder);
  const sortMode = useGameStore((s) => s.sortMode);
  const cycleSort = useGameStore((s) => s.cycleSort);
  const reorderHand = useGameStore((s) => s.reorderHand);
  const setSelection = useGameStore((s) => s.setSelection);
  const handRef = useRef<HTMLDivElement>(null);
  const ceremony = useGameStore((s) => s.ceremony);
  const humanSeat = useGameStore((s) => s.humanSeat);
  const points = useGameStore((s) => s.points);
  const choosePile = useGameStore((s) => s.choosePile);
  const seatsAtTable = useGameStore((s) => s.seatsAtTable);
  const nextRound = useGameStore((s) => s.nextRound);
  const match = useGameStore((s) => s.match);
  const tableCode = useGameStore((s) => s.tableCode);
  const fairness = useGameStore((s) => s.fairness);
  const hosting = useGameStore((s) => s.hosting);
  const reclaimSeat = useGameStore((s) => s.reclaimSeat);
  const unready = useGameStore((s) => s.unready);
  const nextRoundIn = useCountdown(nextRound?.remainingMs ?? null);
  const [rulesOpen, setRulesOpen] = useState(false);
  /** Leaving asks first: one click was enough to end a whole match. */
  const [confirmLeave, setConfirmLeave] = useState(false);
  useEffect(() => {
    if (!confirmLeave) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmLeave(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmLeave]);
  // Opened from the table, the rules land on whichever one is being enforced
  // right now — the question is almost always "why can't I do that?".
  const rulesFocus =
    constraint.kind === 'FORCED_TWO_BUST' ? 'bombs' : constraint.kind === 'FORCED_OPENING' ? 'opening' : undefined;
  const playCards = useGameStore((s) => s.playCards);

  const HUMAN_ID = SEAT_IDS[humanSeat]!;
  const mine = seatsAtTable.find((seat) => seat.id === HUMAN_ID);
  const iAmReady = online && (mine?.ready ?? false);
  /** Where a seat stands on the next round, at a shared table. Computers are not asked. */
  const readiness = (id: string): string | null => {
    const seat = seatsAtTable.find((s) => s.id === id);
    if (!seat || seat.occupant === 'cpu') return null;
    if (seat.occupant === 'away') return 'Away';
    if (seat.standIn) return 'Computer playing';
    return seat.ready ? 'Ready' : 'Waiting';
  };
  /** A seat a computer holds for the whole game — every other seat when playing alone. */
  const isComputer = (id: string): boolean => {
    const seat = seatsAtTable.find((s) => s.id === id);
    return seat ? seat.occupant === 'cpu' : !online && id !== HUMAN_ID;
  };
  const seatNames = useSeatNames();
  // Stable, like the view below, so the seats and the middle of the table can
  // skip the renders a finger sliding along the hand causes: those change what
  // is picked, never who is sitting where.
  const labelFor = useCallback(
    (id: string | null) => (id ? personName(SEAT_IDS.indexOf(id), humanSeat, seatNames) : 'Nobody'),
    [humanSeat, seatNames],
  );
  const bomb = useBombMoment(playerView?.history ?? NO_HISTORY);
  // A pass changes nothing in the middle of the table, so the announcement of
  // plays there never mentioned it. Said separately, for screen readers.
  const lastEvent = (playerView?.history ?? NO_HISTORY).at(-1);
  const passAnnouncement =
    lastEvent?.type === 'PLAYER_PASSED' && lastEvent.playerId !== HUMAN_ID
      ? `${labelFor(lastEvent.playerId)} passed.`
      : '';
  // Derived before any hook reads it, so the hook order never depends on
  // whether a round happens to exist yet.
  const view = useMemo(() => (playerView ? buildTableView(playerView) : null), [playerView]);
  const self = view?.self ?? null;
  const isMyTurn = awaitingHuman && !(view?.isRoundOver ?? true);
  // The engine hands back a rank-sorted hand; the player's own arrangement
  // wins. Every card stays in the fan whether or not it is picked — a selected
  // card lifts out of the row rather than leaving for somewhere else, which is
  // what your hands do with real cards and leaves a card only ever in one
  // place.
  const handCards = self ? applyOrder(self.hand, handOrder) : [];
  const byId = new Map((self?.hand ?? []).map((c) => [cardId(c), c]));
  const selectedIds = new Set(selection.map(cardId));
  const handIds = handCards.map(cardId);
  /** Ids → cards, keeping the order given. Used by every gesture that selects. */
  const toCards = (ids: string[]) => ids.map((id) => byId.get(id)).filter((c): c is Card => Boolean(c));

  // Zones report their boxes; the card layer positions every card from them.
  const zones = useZoneRects();
  const [trickOpen, setTrickOpen] = useState(false);
  /** How far the opened trick is scrolled back from its newest play. */
  const [trickScroll, setTrickScroll] = useState(0);
  // Every opening, and every new trick, starts at the newest plays.
  useEffect(() => setTrickScroll(0), [trickOpen, view?.trickId]);
  /** How far the opened trick can scroll: set once the layout is known, below. */
  const maxTrickScroll = useRef(0);
  const scrollTrick = useCallback(
    (by: number) => setTrickScroll((current) => Math.min(Math.max(current + by, 0), maxTrickScroll.current)),
    [],
  );
  /** The phone layout: a few controls are arranged differently there, not only styled differently. */
  const compact = useMediaQuery(COMPACT_QUERY);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  /**
   * The authored card size in device pixels. Media queries change `--scale`
   * and nothing else, so one read of it gives every zone its geometry.
   */
  const [cardSize, setCardSize] = useState({ width: 66, height: 93 });
  useEffect(() => {
    const read = () => {
      const scale = Number(getComputedStyle(document.documentElement).getPropertyValue('--scale')) || 3;
      setCardSize({ width: 22 * scale, height: 31 * scale });
    };
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);

  const cardBox = (id: string) => {
    const el = document.querySelector<HTMLElement>(`.cardlayer__card[data-id="${CSS.escape(id)}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.x };
  };

  const [drag, dragHandlers] = useTableDrag({
    zones: {
      hand: zones.rects[`hand:${humanSeat}`] ?? null,
      // The whole middle band of the table takes a drop, not just the trick's box.
      trick: zones.rects['drop'] ?? zones.rects['trick'] ?? null,
    },
    handIds,
    selectedIds,
    cardBox,
    hoveredId,
    actions: {
      // One meaning, always: a click picks a card up or puts it back. Picking
      // is allowed off-turn too, so a combo can be lined up while the CPUs
      // think — it is the *play* that has to wait for your turn, not the
      // making up of your mind.
      onTap: (id) => {
        const card = byId.get(id);
        if (card) toggleCard(card);
      },
      // Dropping on the table means "play exactly what I am holding". The
      // cards being dragged *are* the selection whenever a selected card was
      // grabbed, so there is nothing else to fold in.
      onPlay: (ids) => playCards(toCards(ids)),
      onReorder: (id, toIndex) => reorderHand(id, toIndex),
      // A finger sliding along the hand picks up (or puts back) every card it passes.
      onSelect: (ids) => setSelection(toCards(ids)),
    },
  });

  /**
   * Sweep-selection belongs to the table, not to the fan. The cards are not
   * children of the hand any more, so confining the box you drag to that one
   * rectangle was an arbitrary limit rather than a boundary anything real sat
   * behind.
   */
  const [sweep, sweepHandlers] = useSweepSelect({
    enabled: true,
    selectedIds: selection.map(cardId),
    onSelect: (ids) => setSelection(toCards(ids)),
  });

  const draggingSet = new Set(drag.draggingIds);

  // The round does not exist until the piles have been claimed, because the
  // claims are an input to it — so the ceremony is the whole screen, not an
  // overlay on top of a table that has not been dealt yet.
  if (ceremony.kind === 'picking') {
    return (
      <div className="screen">
        <div className="overlay overlay--ceremony">
          <PileCeremony
            claims={ceremony.claims}
            remaining={ceremony.remaining}
            picker={ceremony.picker}
            interactive={ceremony.interactive}
            seatIds={SEAT_IDS}
            humanSeat={humanSeat}
            clock={clock && ceremony.picker && clock.playerId === ceremony.picker ? clock : null}
            onChoose={choosePile}
          />
        </div>
      </div>
    );
  }

  if (!view || !self) return null;

  const status = evaluateSelection(selection, legalMoves, self.pile, constraint);
  // The scene: every card that should be on screen, and where it belongs.
  // Derived from the redacted view plus local intent — never from anything
  // only this client could know about another player.
  const opponentCounts = new Map<number, number>(self.opponents.map((o) => [o.seat, o.cardCount] as const));
  const entities = buildScene({
    humanSeat,
    seatIds: SEAT_IDS,
    handCards,
    opponentCounts,
    trickPlays: view.trickPlays,
    mound: view.moundCards,
  });

  const metrics: SceneMetrics = {
    layer: zones.rects['layer'] ?? { x: 0, y: 0, width: 0, height: 0 },
    hands: new Map(
      SEAT_IDS.map((_, seat) => [seat, zones.rects[`hand:${seat}`] ?? null] as const).filter(
        (entry): entry is readonly [number, NonNullable<(typeof entry)[1]>] => entry[1] !== null,
      ),
    ),
    trick: zones.rects['trick'] ?? null,
    discard: zones.rects['discard'] ?? null,
    cardWidth: cardSize.width,
    cardHeight: cardSize.height,
    viewerSeat: humanSeat,
    trickOpen,
    trickScroll,
    compact,
  };

  // The opened trick's window, measured as it would be open, so the play area
  // knows whether there is anything to scroll before it is opened.
  const trickCardCount = view.trickPlays.reduce((n, play) => n + play.combo.cards.length, 0);
  const trickLayout = openTrickLayout(trickCardCount, view.trickPlays.length, { ...metrics, trickOpen: true });
  maxTrickScroll.current = trickLayout.maxScroll;

  /**
   * What the drop under the pointer would do, and whether the table would
   * accept it.
   *
   * Answered before the release rather than after, so the boundary that lights
   * up is telling you the outcome instead of confirming it. The play is
   * assembled exactly as `onPlay` assembles it, or the highlight would be
   * judging a different set of cards from the one that would be played.
   */
  const dropValid =
    drag.over === 'trick'
      ? isMyTurn && evaluateSelection(toCards(drag.draggingIds), legalMoves, self.pile, constraint).kind === 'LEGAL'
      : drag.over !== null;

  // Hover is state, not CSS: the layer owns each card's transform, so `:hover`
  // cannot move a card without the two fighting each other.

  /** Local state laid over each card's derived placement. */
  const visuals = new Map<string, CardVisual>();
  for (const entity of entities) {
    const mine = entity.placement.zone === 'hand' && entity.placement.seat === humanSeat;
    if (!mine) continue;
    const dragging = draggingSet.has(entity.id);
    const hovered = hoveredId === entity.id && !dragging;
    // The card under a finger pressing the hand: raised clear of the fingertip
    // that covers it, so you can see which card you are about to pick.
    const previewed = drag.previewId === entity.id;
    const chosen = selectedIds.has(entity.id);
    visuals.set(entity.id, {
      interactive: true,
      marked: chosen,
      ...(entity.card ? { label: cardSpoken(entity.card) } : {}),
      ...(dragging ? { dx: drag.dx, dy: drag.dy, z: DRAG_Z } : {}),
      ...(hovered || previewed ? { z: HOVER_Z } : {}),
      ...(dragging || hovered || previewed ? { scale: CARD_SCALE.raised } : {}),
      // A picked card stands clear of the row; hovering nudges one that is
      // not picked, so the two cues never add up into one taller lift that
      // means neither thing on its own.
      // On a phone a picked card rises a little less: the read-out sits close
      // over the hand there, and a picked card should not cover it.
      lift: previewed ? 40 : chosen ? (compact ? 18 : 26) : hovered ? 14 : 0,
      raised: dragging || hovered || previewed || chosen,
    });
  }

  /**
   * One caption per combo, positioned by the same geometry as its cards.
   *
   * Closed, only the standing combo is named. The beaten combos are stacked
   * half a card apart, so their captions were stacked half a card apart too
   * and overprinted each other into an unreadable smear — and they were
   * naming cards you cannot see the faces of anyway. Open the trick and every
   * combo gets its name back, which is what opening it is for.
   */
  const labels = view.trickPlays
    .map((play, group) => {
      const inGroup = entities.filter((e) => e.placement.zone === 'trick' && e.placement.group === group);
      const first = inGroup[0]?.placement;
      const size = inGroup.length;
      /*
       * The exact middle of the combo, which for an even number of cards falls
       * *between* two of them. This used to pick the nearest real card, and
       * `Math.floor((n - 1) / 2)` on a pair is index 0 — so a pair's caption sat
       * under its left-hand card rather than under the pair. A fractional slot
       * resolves through the same geometry as a real one and lands dead centre
       * for any size.
       */
      const middle = first
        ? {
            ...first,
            slot: (size - 1) / 2,
            ...(first.trickIndex !== undefined ? { trickIndex: first.trickIndex + (size - 1) / 2 } : {}),
          }
        : undefined;
      return {
        id: `trick-${group}`,
        text: labelFor(play.playerId),
        placement: middle ?? { zone: 'trick' as const, slot: 0, count: 1, faceUp: true },
        standing: group === view.trickPlays.length - 1,
      };
    })
    .filter((label) => trickOpen || label.standing);

  /**
   * The one line of feedback above the fan, and the colour it carries.
   *
   * Ordered by specificity, not by category: a refused play is the most
   * specific thing that can be true, then the cards you are holding, then
   * whose turn it is. Only one of them can be the most useful sentence at any
   * moment, so only one is shown.
   */
  const myPlace = placeOf(self.finishOrder, HUMAN_ID);
  const [message, tone] = feedback({
    error,
    selection,
    status,
    isMyTurn,
    constraint,
    pile: self.pile,
    waitingFor: labelFor(self.turnPlayerId),
    hasPassed: view.passedThisTrick.has(HUMAN_ID),
    finished: myPlace !== null,
  });

  /* Pieces of the controls, arranged one way on a wide screen and another on a
     phone (see the hand zone below). */
  const placeBadge = myPlace !== null && (
    <>
      {/* The same medal an opponent's seat shows when they finish, so going out
          first looks like the win it is from your side too. */}
      <PlaceBadge place={myPlace} />{' '}
    </>
  );
  const myClock =
    clock && clock.playerId === HUMAN_ID ? (
      <span className="controls__clock">
        <TurnClock remainingMs={clock.remainingMs} totalMs={clock.totalMs} />
      </span>
    ) : null;
  const clearButton = (
    <button className="btn" onClick={clearSelection} disabled={selection.length === 0} data-hint="No cards picked">
      Clear
    </button>
  );
  const passButton = (
    <button
      className="btn btn--pass"
      onClick={pass}
      disabled={!isMyTurn || !canPass}
      data-hint={isMyTurn ? 'You lead, so play something' : 'Wait for your turn'}
    >
      Pass
    </button>
  );
  const playButton = (
    <button
      className="btn btn--primary"
      onClick={playSelection}
      disabled={!isMyTurn || status.kind !== 'LEGAL'}
      data-hint={
        !isMyTurn
          ? 'Wait for your turn'
          : status.kind === 'EMPTY'
            ? 'Pick cards to play'
            : status.kind === 'NOT_A_COMBO'
              ? 'Those cards are not a combination'
              : 'Those cards cannot be played now'
      }
    >
      Play cards
    </button>
  );
  const handElement = (
    <Hand
      containerRef={handRef}
      anchorRef={zones.anchor(`hand:${humanSeat}`)}
      cardCount={handCards.length}
      dropActive={drag.over === 'hand'}
    />
  );
  /* Your running score, said the way each seat's is under its fan. Every other
     seat's points were on the table and yours were nowhere until the round
     ended. */
  const myPoints = points[HUMAN_ID] ?? 0;
  const myScore = (
    <span className="myscore">
      You · <span className="myscore__points">{myPoints}</span> {myPoints === 1 ? 'pt' : 'pts'}
    </span>
  );
  /* The round and the seed that dealt it, as one line of text: the seed reads
     the same whether this table is yours alone or shared, so a deal can be
     carried from one to the other. */
  /* Two parts: what the game is, and what identifies it. On a wide screen they
     share one line; on a phone, where the bar between the corner buttons is too
     narrow for one, the second takes a line of its own instead of wrapping
     wherever the text happens to run out. */
  const codes = (
    <>
      {/* At a shared table, the code to give somebody who wants in. */}
      {online && (
        <span className="gameinfo__part">
          Table <Copyable value={tableCode} message="Code copied" label="Table code" />
        </span>
      )}
      {online && hosting !== 'browser' && <span className="gameinfo__sep"> · </span>}
      {/* A browser-hosted table deals from everyone's shuffle, so its seed
          would not repeat the deal and is not shown. */}
      {online && hosting === 'browser' ? null : (
        <span className="gameinfo__part">
          <Copyable value={seed} message="Seed copied" label="Seed" />
        </span>
      )}
    </>
  );
  const gameInfo = (
    <span className="gameinfo">
      <span className="gameinfo__line">
        Round {roundNumber}
        {match.rule.kind === 'rounds' ? ` of ${match.rule.count}` : ` · first to ${match.rule.target}`}
      </span>
      <span className="gameinfo__sep gameinfo__sep--lines"> · </span>
      <span className="gameinfo__line">{codes}</span>
    </span>
  );

  return (
    <div className="screen screen--table">
      {/* A dropped connection has to be visible, because from inside the game
          it looks exactly like three people thinking for a very long time.
          The seat is not lost while this is up — the table holds it, and a
          computer covers it — so the message says that rather than alarming. */}
      {online && connection !== 'connected' && (
        <div className={`link link--${connection}`} role="status" aria-live="polite">
          {connection === 'reconnecting'
            ? 'Connection lost — reconnecting. Your seat is being held.'
            : connection === 'closed'
              ? (error ?? 'This table has closed.')
              : 'Connecting…'}
        </div>
      )}

      <div
        className={`table ${bomb.shaking ? `is-shaking is-shaking--l${bomb.shaking}` : ''}`}
        ref={zones.anchor('layer')}
        {...sweepHandlers}
      >
        {self.opponents.map((opponent) => (
          <OpponentSeat
            key={opponent.id}
            name={personName(opponent.seat, humanSeat, seatNames)}
            position={seatPosition(opponent.seat, humanSeat)}
            cardCount={opponent.cardCount}
            points={points[opponent.id] ?? 0}
            place={placeOf(self.finishOrder, opponent.id)}
            isTurn={self.turnPlayerId === opponent.id}
            hasPassed={view.passedThisTrick.has(opponent.id)}
            clock={clock && clock.playerId === opponent.id ? clock : null}
            fanRef={zones.anchor(`hand:${opponent.seat}`)}
            cpu={isComputer(opponent.id)}
          />
        ))}

        <TableCentre
          trickPlays={view.trickPlays}
          moundCount={view.moundCount}
          labelFor={labelFor}
          dropRef={zones.anchor('drop')}
          trickRef={zones.anchor('trick')}
          discardRef={zones.anchor('discard')}
          open={trickOpen}
          onOpenChange={setTrickOpen}
          onScroll={trickLayout.maxScroll > 0 ? scrollTrick : undefined}
          scrollStep={trickLayout.step}
          dropActive={drag.over === 'trick'}
          dropValid={dropValid}
        />

        {/* Every card on the table, in one layer. Zones say where they are;
            this draws what is in them. */}
        <CardLayer
          instant={zones.resizing}
          entities={entities}
          metrics={metrics}
          labels={labels}
          visuals={visuals}
          handlers={{
            ...dragHandlers,
            onActivate: (id) => {
              const card = byId.get(id);
              if (card) toggleCard(card);
            },
            // Hover goes by the nearest card centreline, not by the element under
            // the pointer: taken from the element, a hovered card grew over its
            // right-hand neighbour and that neighbour could never be reached.
            onPointerMove: (e) => {
              if (e.pointerType === 'mouse' && !drag.grabbedId) {
                setHoveredId((current) => dragHandlers.cardAt(e.clientX, current));
              }
              dragHandlers.onPointerMove(e);
            },
            onPointerEnter: (e) => setHoveredId((current) => dragHandlers.cardAt(e.clientX, current)),
            onPointerLeave: (e) => {
              // Moving from one card onto the next is not leaving the hand.
              const next =
                e.relatedTarget instanceof Element ? e.relatedTarget.closest('.cardlayer__card.is-live') : null;
              if (!next) setHoveredId(null);
            },
          }}
        />

        <p className="sr-only" aria-live="polite">
          {passAnnouncement}
        </p>

        <div className="handzone">
          {compact ? (
            <>
              {/* A phone: what is true right now, then your hand, then what you
                  can do about it — the actions under the hand, where a thumb
                  rests, with the one that plays largest and furthest right. */}
              <div className={`controls controls--compact ${tone}`} aria-live="polite">
                <TurnDot on={isMyTurn} />
                <span className="controls__read">
                  {placeBadge}
                  {message}
                </span>
                {myClock}
              </div>
              {handElement}
              <div className="actionbar">
                <SortControl mode={sortMode} onCycle={cycleSort} />
                {/* Between Sort and Clear, in the row's own gap. */}
                <span className="actionbar__spacer">{myScore}</span>
                {clearButton}
              </div>
              <div className="actionbar actionbar--primary">
                {passButton}
                {playButton}
              </div>
            </>
          ) : (
            <>
              {/* One line of chrome above the fan, not two boxes. The line always
                  shows the most specific thing true right now — an error, then
                  what you have picked, then whose turn it is — and the actions
                  sit on the same row because they are what you do about it. */}
              <div className={`controls ${tone}`} aria-live="polite">
                {/* The same marker every other seat carries. */}
                <TurnDot on={isMyTurn} />
                <span className="controls__read">
                  {placeBadge}
                  {message}
                </span>
                <div className="controls__actions">
                  {/* The clock hangs off the actions, not the sentence: it
                      constrains the decision those buttons make. Out of flow
                      above them, so nothing beside it wraps or shifts. */}
                  {myClock}
                  {clearButton}
                  {playButton}
                  {passButton}
                </div>
              </div>

              {/* The fan is an anchor. Its cards belong to the card layer, which
                  is what lets one of them travel to the table as one object. */}
              {handElement}

              <div className="utility">
                <SortControl mode={sortMode} onCycle={cycleSort} />
                <span className="utility__seed">{myScore}</span>
                <button className="btn btn--quiet" onClick={() => setConfirmLeave(true)}>
                  Leave table
                </button>
              </div>
            </>
          )}
        </div>

        <BombCallout moment={bomb.moment} />

        {sweep && <span className="table__marquee" style={sweepStyle(sweep)} aria-hidden="true" />}
      </div>

      <EventLog history={self.history} />

      {/* What this game is — the round, the match, and the seed or table code —
          at the top of the screen, centred between the corner buttons, on
          every screen. It is read at a glance and never acted on during a
          turn, so it sits with the other chrome rather than beside the hand. */}
      <div className="tablebar">{gameInfo}</div>

      {/* Top left, mirroring the log in the top right: reference you reach for,
          not part of playing a turn. On a phone the corner holds the menu, and
          How to play, the round and Leave table live inside it. */}
      {compact ? (
        <TableMenu onRules={() => setRulesOpen(true)} onLeave={() => setConfirmLeave(true)} />
      ) : (
        <button
          type="button"
          className="helpbtn"
          onClick={() => setRulesOpen(true)}
          aria-label="How to play"
          title="How to play"
        >
          <PixelIcon name="help" />
        </button>
      )}

      {/* A computer took this seat when the countdown between rounds ran out.
          Said at the top of the screen, out of the board's flow, with the one
          thing to do about it. */}
      {online && mine?.standIn && !view.isRoundOver && (
        <div className="standin" role="status">
          <span>A computer is playing your seat.</span>
          <button className="btn btn--primary btn--small" onClick={reclaimSeat}>
            Take my seat back
          </button>
        </div>
      )}

      <RulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} focus={rulesFocus} />

      <AnimatePresence>
        {confirmLeave && (
          <m.div
            className="overlay overlay--confirm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SETTLE}
            onClick={(event) => {
              if (event.target === event.currentTarget) setConfirmLeave(false);
            }}
          >
            <div
              className="overlay__box overlay__box--confirm"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="leave-title"
              aria-describedby="leave-body"
            >
              <h2 id="leave-title">Leave this game?</h2>
              <p className="overlay__note" id="leave-body">
                {!online
                  ? 'This ends the match, and its points are not kept.'
                  : hosting === 'browser' && mine?.host
                    ? 'Your browser is hosting this table, so leaving closes it for everyone.'
                    : 'A computer plays your seat while you are gone. Rejoin within 2 minutes to take it back.'}
              </p>
              <div className="overlay__actions">
                <button className="btn btn--quiet" onClick={() => setConfirmLeave(false)} autoFocus>
                  Stay
                </button>
                <button className="btn btn--pass" onClick={leaveTable}>
                  Leave table
                </button>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {view.isRoundOver && (
          <m.div
            className="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SETTLE}
          >
            {/* The one orchestrated moment on the board. Everything else is a
                response to something the player did; this is the payoff. */}
            <m.div
              className="overlay__box"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...SETTLE, delay: 0.12 }}
            >
              <h2>
                {match.winner
                  ? match.winner === HUMAN_ID
                    ? 'You win the match'
                    : `${labelFor(match.winner)} wins the match`
                  : view.winner === HUMAN_ID
                    ? 'You win the round'
                    : `${labelFor(view.winner)} wins the round`}
              </h2>
              {/* Standings are ordered by match points, not by seat — the whole
                point of a points table is to answer "who is winning" at a
                glance, and a fixed seat order buries that. */}
              <ul className="overlay__scores">
                {standings(SEAT_IDS, points, self.finishOrder).map((row) => (
                  <li key={row.id} className={row.id === HUMAN_ID ? 'is-you' : ''}>
                    <span className="overlay__place">{PLACE_LABELS[row.place] ?? '—'}</span>
                    <span>
                      {personName(SEAT_IDS.indexOf(row.id), humanSeat, seatNames)}
                      {online && readiness(row.id) && (
                        <span className={`overlay__ready ${readiness(row.id) === 'Ready' ? 'is-ready' : ''}`}>
                          {` · ${readiness(row.id)}`}
                        </span>
                      )}
                    </span>
                    <span className="overlay__gain">+{row.gained}</span>
                    <strong>{row.total}</strong>
                  </li>
                ))}
              </ul>
              {/* Where the match stands, or how it was decided. */}
              <p className="overlay__match">
                {match.winner
                  ? `${matchSummary(match.rule)} Play again for a new match.`
                  : match.rule.kind === 'rounds'
                    ? `Round ${roundNumber} of ${match.rule.count}. ${matchSummary(match.rule)}`
                    : matchSummary(match.rule)}
              </p>
              {!match.winner && (
                <p className="overlay__note">
                  {view.winner === HUMAN_ID
                    ? 'You pick your pile first and lead the next round.'
                    : `${labelFor(view.winner)} picks first and leads the next round.`}
                </p>
              )}
              {online &&
                hosting === 'browser' &&
                fairness &&
                fairness.round === roundNumber &&
                fairness.status !== 'unchecked' && (
                  <p className={`overlay__fair is-${fairness.status}`} role="status">
                    {fairness.status === 'verified'
                      ? 'Deal and every move checked.'
                      : fairness.status === 'checking'
                        ? 'Checking the deal and every move…'
                        : `This round failed its check: ${fairness.status === 'failed' ? fairness.reason : ''}.`}
                  </p>
                )}
              {online && nextRoundIn !== null && (
                <p className="overlay__countdown" aria-live="polite">
                  {iAmReady ? 'You are ready. ' : ''}
                  {match.winner ? 'Next match' : 'Next round'} deals in {nextRoundIn}s
                </p>
              )}
              <div className="overlay__actions">
                {/* The label is always the action. Once you are ready the button
                  offers the way back, and the line above says you are ready.
                  Both labels share one cell, so swapping them moves nothing. */}
                <button className={iAmReady ? 'btn' : 'btn btn--primary'} onClick={iAmReady ? unready : startNextRound}>
                  <span className="btn__labels">
                    <span className={iAmReady ? 'is-hidden' : ''} aria-hidden={iAmReady}>
                      {match.winner ? 'Play again' : 'Play another round'}
                    </span>
                    <span className={iAmReady ? '' : 'is-hidden'} aria-hidden={!iAmReady}>
                      Cancel ready
                    </span>
                  </span>
                </button>
                <button className="btn btn--quiet" onClick={() => setConfirmLeave(true)}>
                  Leave table
                </button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const PLACE_LABELS = ['1st', '2nd', '3rd', '4th'];

/**
 * Where a seat finished, or null if they are still holding cards.
 *
 * `finishOrder` only lists seats that emptied their hand, and the round ends
 * as soon as three have — so the fourth is absent from it and has no placement
 * to show while the round is still running.
 */
function placeOf(finishOrder: string[], id: string): number | null {
  const index = finishOrder.indexOf(id);
  return index === -1 ? null : index;
}

/**
 * Match standings, richest first, with each seat's placement this round.
 *
 * `finishOrder` only lists the players who went out — the round ends as soon
 * as three have, so the one still holding cards is absent and placed last.
 */
function standings(
  seatIds: string[],
  points: Record<string, number>,
  finishOrder: string[],
): { id: string; place: number; gained: number; total: number }[] {
  return seatIds
    .map((id) => {
      const place = finishOrder.indexOf(id);
      return {
        id,
        place: place === -1 ? seatIds.length - 1 : place,
        gained: PLACEMENT_POINTS[place === -1 ? seatIds.length - 1 : place] ?? 0,
        total: points[id] ?? 0,
      };
    })
    .sort((a, b) => b.total - a.total || a.place - b.place);
}

/**
 * The most specific sentence that is true right now, and how to colour it.
 *
 * **Gold means the move is yours.** It appears the moment your turn starts and
 * stays for as long as what you are holding could be played — so the signal
 * you are watching for is the one that arrives, rather than one you have to
 * assemble a legal combo to earn. The inverse carries the problem: losing the
 * gold is what tells you something is wrong.
 *
 * Four tones, and the split between the last two is the point:
 *   gold   your turn — the prompt, or a selection that will play
 *   red    these cards cannot go, the table refused a play, or you have
 *          passed out of the trick — the same red a passed seat's name takes
 *   dim    not your turn; nothing here is actionable yet
 *   bone   your hand is empty, beside the medal for where you finished
 *
 * A half-built combo is **not** an error and is not coloured like one. You are
 * mid-thought: two cards into a straight, or holding a pair while a triple is
 * on the table. Painting that red the instant a second card is picked nags at
 * ordinary use and, worse, spends the alarm colour so thoroughly that a real
 * rejection has nothing left to say. Red stays for the table actually saying
 * no. The neutral tone still reads as "not yet" because it is the one state
 * where the gold has gone but the turn marker beside it is still lit.
 */
function feedback({
  error,
  selection,
  status,
  isMyTurn,
  constraint,
  pile,
  waitingFor,
  hasPassed,
  finished,
}: {
  error: string | null;
  selection: Card[];
  status: { kind: string; message: string };
  isMyTurn: boolean;
  constraint: TurnConstraint;
  pile: Combo | null;
  waitingFor: string;
  /** Passed out of the current trick (9.7): nothing to do until it clears. */
  hasPassed: boolean;
  /** Emptied their hand this round; the medal beside the line says where. */
  finished: boolean;
}): [string, string] {
  const chosen = selection.length > 0 ? `${cardsLabel(selection)} — ${status.message}` : null;

  if (error) return [error, 'is-error'];
  if (finished) return ['Your hand is empty', 'is-finished'];
  // Passing takes you out of the whole trick, so "waiting for" undersold it —
  // it read as though your turn was coming round again. Red like a passed
  // seat's name, and it says when you are back in.
  if (hasPassed && !isMyTurn) return ['Passed — out until the table clears', 'is-passed'];
  // Picking cards off-turn is allowed, so the line still reports what you are
  // holding — but nothing about it is live yet, and colouring it as though it
  // were would promise a move you cannot make.
  if (!isMyTurn) return [chosen ?? `Waiting for ${waitingFor}`, 'is-waiting'];
  if (chosen && status.kind !== 'LEGAL') return [chosen, 'is-blocked'];
  return [chosen ?? turnPrompt(constraint, pile), 'is-live'];
}
