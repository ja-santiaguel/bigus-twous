import { create } from 'zustand';
import {
  cardId,
  type Card,
  type Combo,
  type PileClaim,
  type PlayerId,
  type PlayerView,
  type TurnConstraint,
} from '@big-two/engine';
import type { Difficulty } from '@big-two/ai';
import { randomName } from '../lib/names.js';
import {
  DEFAULT_MATCH,
  makePacer,
  makeSeed,
  normalizeSeed,
  SEAT_IDS,
  type MatchRule,
  type SeatConfig as SessionSeat,
  type SessionSave,
} from '@big-two/session';
import type { WireCeremony, WireClock, WireCountdown, WireMatch, WireMatchRule, WireSeat } from '@big-two/protocol';
import { createLocalTable } from '../table/localTable.js';
import { createRemoteTable } from '../table/remoteTable.js';
import type { SocketLike } from '../table/remoteTable.js';
import type { Hosting } from '../hosting/startHosting.js';
import { takeHostedLobby } from '../hosting/lobbyRestore.js';
import type { LobbySnapshot } from '@big-two/server/table';
import { httpBase, tableSocket, hostingMode } from '../lib/serverAddress.js';
import type { ConnectionStatus, TableClient, TableSnapshot, Fairness } from '../table/types.js';
import { applyOrder, moveCards, nextSortMode, sortCards, type SortMode } from '../lib/handOrder.js';
import { matchLegalMove } from '../lib/selection.js';

/**
 * The client store.
 *
 * It no longer runs the game. A `GameSession` does that — it owns the one true
 * `GameState`, advances it, and hands this store nothing but a redacted
 * `PlayerView` of the seat the person is sitting in. The store dispatches
 * intents (`playCards`, `pass`, `choosePile`) and re-reads its view when the
 * session says something changed.
 *
 * That is the whole point of the split. This file used to hold four hands
 * because it drove the orchestrator; now it holds one, because that is all it
 * is given. The session currently runs in this same process, which is a
 * deployment detail — when it moves behind a socket, what changes is where
 * `subscribe` and `submitMove` go, not what this store does with them.
 */

export type Screen = 'menu' | 'lobby' | 'table';

/**
 * The pile-selection ceremony (9.13), which runs before a round exists.
 *
 * The piles have to be dealt *before* the round is created, because a person
 * cannot click a pile that has not been dealt yet. So the store deals, collects
 * four claims, and only then asks the engine to build the round from them —
 * which is why `state` is null for the duration.
 */
export type CeremonyState =
  | { kind: 'idle' }
  | {
      kind: 'picking';
      /** Claims settled so far, in pick order. */
      claims: PileClaim[];
      /** Pile indexes still unclaimed. */
      remaining: number[];
      /** Seat currently choosing, or null during the beat between picks. */
      picker: PlayerId | null;
      /** True when this seat is a person and the ceremony is waiting on a click. */
      interactive: boolean;
    };

export interface SeatConfig {
  id: PlayerId;
  seat: number;
  occupant: 'human' | 'cpu';
  difficulty: Difficulty;
}

/**
 * Re-exported, not redefined. The session owns seat identity — it is the thing
 * that deals to them — and a second list here is a second list to disagree.
 */
export { SEAT_IDS };

/**
 * Which seat the human occupies. Chosen in the lobby rather than fixed: the
 * board always rotates so you are at the bottom, but *which numbered seat*
 * that is changes the deal order you sit in, and is the thing a shared table
 * has to agree on.
 */
export const DEFAULT_HUMAN_SEAT = 0;

function defaultSeats(humanSeat = DEFAULT_HUMAN_SEAT): SeatConfig[] {
  return SEAT_IDS.map((id, seat) => ({
    id,
    seat,
    occupant: seat === humanSeat ? 'human' : 'cpu',
    difficulty: 'medium',
  }));
}

interface GameStore {
  screen: Screen;
  seats: SeatConfig[];
  tableCode: string;
  seed: string;
  /**
   * Whether presentation pacing applies at all.
   *
   * Not a speed. A speed is a preference about how fast you want to watch the
   * table, and even the fastest one keeps a buffer so that a turn is never
   * over before you noticed it happened. This says nobody is watching: a
   * headless driver — the store tests, a bulk simulation — should not spend
   * seconds of wall clock waiting for animations that are not being drawn.
   */
  paced: boolean;

  /**
   * This seat's redacted view, or null until the ceremony finishes and the
   * first round exists.
   *
   * The only hand in here is yours. That is not restraint on the store's part
   * — it is the only hand the session hands over.
   */
  view: PlayerView | null;
  roundNumber: number;
  roundsWon: Record<PlayerId, number>;
  /** Running match points (9.15) — 5/3/1/0 by finishing place. */
  points: Record<PlayerId, number>;
  /** Winner of the previous round — decides who leads (9.1). */
  previousWinner: PlayerId | null;

  /** Set while the engine is blocked on the human seat. */
  awaitingHuman: boolean;
  legalMoves: Combo[];
  canPass: boolean;
  constraint: TurnConstraint;
  /**
   * The cards you have picked out of your hand, in the order you picked them.
   *
   * One concept, not two. There used to be a *marked* set inside the fan and a
   * *staged* set in a holding tray, and every interaction had to say which one
   * it meant: tapping a marked card did one thing, tapping an unmarked one
   * another, and a card could be in the tray, in the fan, or in flight between
   * them. Selected cards now stay in the fan and lift out of it, which is both
   * what a person does with real cards and one less place for a card to be.
   */
  selection: Card[];
  error: string | null;

  /**
   * The player's own arrangement of their hand, as card ids.
   *
   * A new round deals thirteen different cards, so a literal order cannot
   * carry over — what persists is the *sort preference*, which is reapplied
   * to each fresh hand. Within a round, dragging rewrites this list and it
   * survives every turn.
   */
  handOrder: string[];
  sortMode: SortMode;
  /** Seat index the human occupies. The table renders this seat at the bottom. */
  humanSeat: number;
  /** Progress through the deal/pick ceremony. The table is not playable until it ends. */
  ceremony: CeremonyState;
  /** Which seat we are, once the table has said. */
  you: PlayerId | null;
  /** Everyone at the table, as everyone is allowed to see them. */
  seatsAtTable: WireSeat[];
  connection: ConnectionStatus;
  /** Who is on the clock and how long they had left when the table last said. */
  clock: WireClock | null;
  /** Time until a shared table deals the next round regardless. */
  nextRound: WireCountdown | null;
  /** The table's match rule and winner, as the table last said. */
  match: WireMatch;
  /** Who runs shared tables: a player's browser (the default) or a table server. */
  hosting: 'browser' | 'server';
  /** Whether the last round at a browser-hosted table passed its check. */
  fairness: Fairness | null;
  /** The match length chosen in the lobby when playing alone. */
  matchRule: MatchRule;
  /** True while an intent is in flight and the table has not answered. */
  pending: boolean;
  /** True when the table is somebody else's process rather than this tab. */
  online: boolean;

  // Lobby intents
  goToLobby(): void;
  goToMenu(): void;
  setSeatDifficulty(seat: number, difficulty: Difficulty): void;
  setSeed(seed: string): void;
  /** Deal a fresh random seed. */
  newSeed(): void;
  /** Headless seam — see `paced`. Off means turns resolve as fast as they can. */
  setPaced(paced: boolean): void;

  // Table intents
  startMatch(): void;
  /** A match played alone is saved in this browser, waiting to be continued. */
  savedGame: boolean;
  /** Carry on the saved match. */
  resumeMatch(): void;
  /** Attach to a table somebody else is running. */
  joinOnline(options: { url: string; table: string; name?: string; openSocket?: () => SocketLike }): void;
  /** Open a new shared table and sit down at it. */
  hostOnline(): Promise<void>;
  /** Reopen the lobby this tab was hosting before a reload, if it went away moments ago. True if there was one. */
  reopenHostedTable(): boolean;
  /** Sit down at a table whose code somebody gave you. */
  joinByCode(code: string): void;
  /** What to call yourself at a shared table. Remembered between visits. */
  playerName: string;
  setPlayerName(name: string): void;
  /** Set while opening a table, so the button can say so. */
  opening: boolean;
  /** Tell a shared table we are ready for it to deal. */
  ready(): void;
  /** Take back being ready at a shared table, before the game starts. */
  unready(): void;
  /** Start a shared table's game, as its host. */
  startGame(): void;
  /** Move to an empty seat at a shared table, before the first deal. */
  takeSeat(seat: number): void;
  /** Remove a person from a shared table. Host only, before the first deal. */
  kick(seat: number): void;
  /** Choose the match length: in the lobby alone, or as the host of a shared table. */
  setMatchRule(rule: WireMatchRule): void;
  /** Take your seat back from the computer standing in for you. */
  reclaimSeat(): void;
  startNextRound(): void;
  leaveTable(): void;
  /** Claims a pile during the ceremony. Ignored unless it is your pick and the pile is free. */
  choosePile(pileIndex: number): void;
  toggleCard(card: Card): void;
  clearSelection(): void;
  setSelection(cards: Card[]): void;
  playSelection(): void;
  /** Plays an explicit set of cards — used by drag-to-play. Returns whether it was accepted. */
  playCards(cards: Card[]): boolean;
  pass(): void;
  cycleSort(): void;
  reorderHand(cardId: string, toIndex: number): void;
}

/**
 * The table this client is attached to, and its subscription.
 *
 * Module-scoped rather than in React state: a client is a mutable,
 * non-serializable handle, and putting it in the store would re-render the
 * whole tree every time the table moved.
 */
let table: TableClient | null = null;
let unsubscribe: (() => void) | null = null;
/** The table this browser is hosting, when it is hosting one. */
let hostedTable: Hosting | null = null;

/**
 * Where a reclaimed seat's token is kept.
 *
 * `sessionStorage`, not `localStorage`, and the difference is the whole
 * behaviour. A seat belongs to a *tab*: reloading keeps it, and opening a
 * second tab gets a second seat. Kept in `localStorage` the token is shared
 * across every tab of the browser, so the second person to open the same link
 * on one machine reclaims the first person's chair and throws them out — which
 * is exactly what two people trying this out on one laptop would do first.
 */
const TOKEN_KEY = (code: string) => `bigtwo:seat:${code}`;

/**
 * Where a person's chosen name is kept, across every window they open.
 *
 * Declared up here, before the store, on purpose: the store reads it while it
 * is being created. Declared below, it was still in its temporal dead zone at
 * that moment — the read threw, the try/catch around it swallowed the error,
 * and every visit started with a new random name and no saved game.
 */
const NAME_KEY = 'bigtwo:name';

/** Where a match played alone is saved between visits. Read at store creation too. */
const SOLO_KEY = 'bigtwo:solo';
const seatStore = (): Storage | null => {
  try {
    return window.sessionStorage;
  } catch {
    // Private browsing, or storage disabled. A new seat every time, then.
    return null;
  }
};

export const useGameStore = create<GameStore>((set, get) => {
  /**
   * Take a snapshot from the table and unpack it into the shape the screen
   * reads.
   *
   * Everything below this line is presentation. The snapshot is the same
   * object whether the table is running in this tab or across the internet,
   * which is the whole reason the store no longer knows which it is.
   */
  function apply(snapshot: TableSnapshot) {
    const view = snapshot.view;
    set({
      view,
      you: snapshot.you,
      ceremony: toAppCeremony(snapshot.ceremony, snapshot.you),
      seatsAtTable: snapshot.seats,
      ...(snapshot.seed ? { seed: snapshot.seed } : {}),
      clock: snapshot.clock,
      nextRound: snapshot.nextRound,
      match: snapshot.match,
      fairness: snapshot.fairness,
      connection: snapshot.status,
      pending: snapshot.pending,
      awaitingHuman: snapshot.prompt !== null,
      legalMoves: snapshot.prompt?.legalMoves ?? [],
      canPass: snapshot.prompt?.canPass ?? false,
      constraint: snapshot.prompt?.constraint ?? { kind: 'NONE' },
      error: snapshot.error,
      ...(view ? { points: view.points, roundsWon: view.roundsWon } : {}),
      // The seat index the board rotates around, taken from the seat the table
      // says we are in rather than by looking our id up in a list. Which chair
      // you are in is the table's decision once more than one person is
      // sitting at it, and it already says so in the message.
      ...seatIndexOf(snapshot),
    });

    // A fresh deal arrives as the first snapshot carrying a hand. Arranged as
    // dealt, in shuffle order — you arrange your own hand, and a deal that
    // hands you a tidy one has taken the first decision of the round away.
    const dealt = view?.hand ?? [];
    if (dealt.length > 0 && get().handOrder.length === 0) {
      set({ handOrder: dealt.map(cardId), roundNumber: view!.roundNumber });
    }
    if (view && view.roundNumber !== get().roundNumber) {
      set({ roundNumber: view.roundNumber, handOrder: dealt.map(cardId), selection: [] });
    }
    // A card that is no longer in hand cannot stay selected.
    const held = new Set(dealt.map(cardId));
    const selection = get().selection.filter((card) => held.has(cardId(card)));
    if (selection.length !== get().selection.length) set({ selection });
  }

  /**
   * Pacing for a local table.
   *
   * Read at call time, so changing the speed mid-round takes effect on the
   * next turn. A shared table paces itself instead — four clients have to see
   * the same game at the same time, which is not a thing any one of them can
   * decide.
   */
  // One pace, everywhere. Computers always take a natural moment to decide:
  // the same experience alone at a table as with three friends at one, and no
  // setting whose only effect is to make turns go past unseen.
  const pacer = makePacer({ speed: () => 'normal', paced: () => get().paced });

  /** Keep the latest save of a match played alone, so a reload loses nothing. */
  function persistSolo(you: PlayerId, seats: SessionSeat[], save: SessionSave | null) {
    if (!save) return;
    writeSolo({ version: 1, you, seats, save });
    if (!get().savedGame) set({ savedGame: true });
  }

  function attach(client: TableClient, options: { readyNow: boolean }) {
    detach();
    table = client;
    unsubscribe = client.subscribe(apply);
    apply(client.snapshot());
    if (options.readyNow) client.ready();
    return client;
  }

  function detach() {
    unsubscribe?.();
    unsubscribe = null;
    table?.dispose();
    table = null;
    // Leaving a table this browser hosts closes it for everyone.
    hostedTable?.close();
    hostedTable = null;
  }

  /** Run a table in this browser — a new one, or the lobby it ran before a reload — and sit down at it. */
  async function openHosted(restore?: LobbySnapshot) {
    set({ opening: true, error: null });
    try {
      // PeerJS and the worker load only now, so playing alone never pays for either.
      const { startHosting } = await import('../hosting/startHosting.js');
      const hosting = await startHosting(restore);
      set({ opening: false });
      const name = get().playerName.trim();
      get().joinOnline({
        url: `peer:${hosting.code}`,
        table: hosting.code,
        openSocket: hosting.openLocalSocket,
        ...(name ? { name } : {}),
      });
      hostedTable = hosting;
    } catch (err) {
      const reason = err instanceof Error ? err.message : '';
      const lead = restore ? 'Could not reopen your table.' : 'Could not open a table.';
      set({ opening: false, error: `${lead} ${reason}`.trim() });
    }
  }

  return {
    screen: 'menu',
    seats: defaultSeats(),
    tableCode: '',
    seed: makeSeed(),
    paced: true,

    view: null,
    roundNumber: 0,
    roundsWon: {},
    points: {},
    previousWinner: null,

    awaitingHuman: false,
    legalMoves: [],
    canPass: false,
    constraint: { kind: 'NONE' },
    selection: [],
    error: null,
    handOrder: [],
    sortMode: 'rank',
    humanSeat: DEFAULT_HUMAN_SEAT,
    ceremony: { kind: 'idle' },
    you: null,
    seatsAtTable: [],
    connection: 'connected',
    pending: false,
    online: false,
    clock: null,
    nextRound: null,
    match: { rule: DEFAULT_MATCH, winner: null },
    fairness: null,
    hosting: hostingMode(),
    matchRule: DEFAULT_MATCH,
    playerName: readName(),
    opening: false,
    savedGame: readSolo() !== null,

    // A new seed every time you sit down alone, so no two games start the same
    // by accident — and it stays editable, so one can start the same on purpose.
    //
    // Playing alone starts you at seat 1, and you can move from there. Which
    // chair you took at a shared table is a choice made there, for that table,
    // and should not follow you back here — the humanSeat a shared table sets is
    // reset on the way in.
    goToLobby: () =>
      set((s) => ({
        screen: 'lobby',
        seed: makeSeed(),
        humanSeat: DEFAULT_HUMAN_SEAT,
        seats: s.seats.map((seat) => ({
          ...seat,
          occupant: seat.seat === DEFAULT_HUMAN_SEAT ? ('human' as const) : ('cpu' as const),
        })),
      })),
    goToMenu: () => set({ screen: 'menu' }),

    setSeatDifficulty: (seat, difficulty) => {
      // At a shared table the computers belong to the table, so the change goes
      // there and every seat hears about it.
      if (get().online) {
        table?.setDifficulty(seat, difficulty);
        return;
      }
      set((s) => ({ seats: s.seats.map((x) => (x.seat === seat ? { ...x, difficulty } : x)) }));
    },

    // One seed, one format, alone or together. At a shared table the seed
    // belongs to the table, so a change goes there and returns to everybody in
    // the next snapshot.
    setSeed: (input) => {
      const seed = normalizeSeed(input);
      set({ seed });
      if (get().online && seed.length > 0) table?.setSeed(seed);
    },
    newSeed: () => get().setSeed(makeSeed()),

    setPaced: (paced) => set({ paced }),

    startMatch: () => {
      set({
        screen: 'table',
        view: null,
        roundsWon: {},
        points: {},
        previousWinner: null,
        roundNumber: 0,
        selection: [],
        handOrder: [],
        awaitingHuman: false,
        legalMoves: [],
        canPass: false,
        constraint: { kind: 'NONE' },
        ceremony: { kind: 'picking', claims: [], remaining: [0, 1, 2, 3], picker: null, interactive: false },
        error: null,
        connection: 'connected',
        pending: false,
        online: false,
      });

      const { seats, seed, humanSeat, playerName } = get();
      const you = SEAT_IDS[humanSeat]!;
      const sessionSeats = seats.map((seat): SessionSeat => ({
        id: seat.id,
        seat: seat.seat,
        occupant: seat.occupant === 'human' ? { kind: 'human' } : { kind: 'cpu', difficulty: seat.difficulty },
      }));
      attach(
        createLocalTable({
          you,
          seed,
          pacer,
          seats: sessionSeats,
          name: playerName,
          match: get().matchRule,
          onSave: (save) => persistSolo(you, sessionSeats, save),
        }),
        { readyNow: true },
      );
    },

    resumeMatch: () => {
      const saved = readSolo();
      if (!saved) {
        set({ savedGame: false });
        return;
      }
      set({
        screen: 'table',
        view: null,
        roundsWon: {},
        points: {},
        previousWinner: null,
        roundNumber: 0,
        selection: [],
        handOrder: [],
        awaitingHuman: false,
        legalMoves: [],
        canPass: false,
        constraint: { kind: 'NONE' },
        ceremony: { kind: 'idle' },
        error: null,
        connection: 'connected',
        pending: false,
        online: false,
        seed: saved.save.seed,
        humanSeat: saved.seats.find((seat) => seat.id === saved.you)?.seat ?? DEFAULT_HUMAN_SEAT,
      });
      attach(
        createLocalTable({
          you: saved.you,
          seed: saved.save.seed,
          pacer,
          seats: saved.seats,
          name: get().playerName,
          resume: saved.save,
          onSave: (save) => persistSolo(saved.you, saved.seats, save),
        }),
        { readyNow: false },
      );
    },

    /**
     * Sit down at a table somebody else is running.
     *
     * The seat token is kept per table code, so a reload or a dropped
     * connection comes back to the same chair rather than being treated as a
     * new arrival — which, at a four-seat table, would mean finding it full.
     */
    joinOnline: ({ url, table: code, name, openSocket }) => {
      set({
        screen: 'table',
        view: null,
        selection: [],
        handOrder: [],
        roundNumber: 0,
        error: null,
        tableCode: code,
        connection: 'connecting',
        ceremony: { kind: 'idle' },
        online: true,
      });

      const stored = seatStore()?.getItem(TOKEN_KEY(code)) ?? undefined;

      attach(
        createRemoteTable({
          url,
          table: code,
          ...(openSocket ? { openSocket } : {}),
          ...(name ? { name } : {}),
          ...(stored ? { token: stored } : {}),
          onToken: (issued) => {
            try {
              seatStore()?.setItem(TOKEN_KEY(code), issued);
            } catch {
              /* nothing to do; the seat just will not survive a reload */
            }
          },
        }),
        { readyNow: false },
      );
    },

    /** Say we are ready for the table to deal. */
    ready: () => table?.ready(),
    unready: () => table?.unready(),
    startGame: () => table?.start(),
    takeSeat: (seat) => {
      if (get().online) {
        table?.takeSeat(seat);
        return;
      }
      // Alone, the lobby is the table: moving is swapping chairs with the
      // computer that had this one. Each seat keeps the difficulty it was set
      // to, so the computer that moves into your old chair plays as that chair
      // was set to play.
      set((s) => ({
        humanSeat: seat,
        seats: s.seats.map((x) => ({ ...x, occupant: x.seat === seat ? ('human' as const) : ('cpu' as const) })),
      }));
    },
    kick: (seat) => table?.kick(seat),
    setMatchRule: (rule) => {
      // A shared table's length is the table's, and the host's to set; the
      // server refuses anybody else. Alone, it is simply what the next match uses.
      if (get().online) table?.setMatch(rule);
      else set({ matchRule: rule });
    },
    // Saying you are ready is how a seat a computer took over comes back —
    // the same message, because it is the same answer the table was waiting for.
    reclaimSeat: () => table?.ready(),

    setPlayerName: (name) => {
      const trimmed = name.slice(0, 24);
      set({ playerName: trimmed });
      // Tell the table too, if we are sitting at one. A name changed from
      // inside the room is the normal case, not the exception.
      if (trimmed.trim().length > 0) table?.setName(trimmed.trim());
      try {
        // A name belongs to the person, not to the tab — so unlike the seat
        // token, this one is worth keeping across every window they open.
        window.localStorage.setItem(NAME_KEY, trimmed);
      } catch {
        /* storage disabled; the name lasts as long as the page does */
      }
    },

    /**
     * Open a table and sit down at it.
     *
     * Opening is a plain request rather than a socket message: there is no
     * table to connect to yet, and needing a connection in order to ask for
     * one is a chicken-and-egg that shows up as a confusing error the first
     * time a server is unreachable.
     */
    hostOnline: async () => {
      if (get().hosting === 'browser') {
        await openHosted();
        return;
      }
      set({ opening: true, error: null });
      try {
        const response = await fetch(`${httpBase()}/tables`, { method: 'POST' });
        if (!response.ok) throw new Error(`The server said ${response.status}.`);
        const { code } = (await response.json()) as { code: string };
        set({ opening: false });
        get().joinByCode(code);
      } catch (err) {
        set({
          opening: false,
          error: err instanceof Error ? `Could not open a table. ${err.message}` : 'Could not open a table.',
        });
      }
    },

    reopenHostedTable: () => {
      if (get().hosting !== 'browser') return false;
      const restore = takeHostedLobby();
      if (!restore) return false;
      void openHosted(restore);
      return true;
    },

    joinByCode: (code) => {
      const table = code.trim().toUpperCase();
      if (!/^[A-Z0-9]{1,16}$/.test(table)) {
        set({ error: 'That does not look like a table code.' });
        return;
      }
      const name = get().playerName.trim();
      if (get().hosting === 'browser') {
        void import('../hosting/peerSocket.js').then(({ openPeerSocket }) =>
          get().joinOnline({
            url: `peer:${table}`,
            table,
            // A host who drops out of the lobby may be reloading, and is worth
            // waiting for; once the game has started, nothing brings it back.
            openSocket: () =>
              openPeerSocket(table, { mayWaitForHost: () => get().view === null && get().ceremony.kind === 'idle' }),
            ...(name ? { name } : {}),
          }),
        );
        return;
      }
      get().joinOnline({ url: tableSocket(table), table, ...(name ? { name } : {}) });
    },

    /**
     * The same session plays every round of a match, so points and the pick
     * order carry forward inside it rather than being threaded back in from
     * here on each deal.
     */
    startNextRound: () => {
      set({ selection: [], handOrder: [], error: null });
      table?.ready();
    },

    leaveTable: () => {
      // Leaving a match played alone ends it — the confirmation said so — and a
      // save left behind would offer to continue a game the player walked out of.
      if (!get().online) {
        writeSolo(null);
        set({ savedGame: false });
      }
      detach();
      set({
        screen: 'menu',
        view: null,
        awaitingHuman: false,
        selection: [],
        ceremony: { kind: 'idle' },
        error: null,
      });
    },

    choosePile: (pileIndex) => {
      // The table decides whether this pick is allowed. Its answer arrives as
      // the next snapshot, carrying a reason if it refused.
      table?.claimPile(pileIndex);
    },

    // Clicking a card picks it up or puts it back. Nothing else — there is no
    // second state for it to mean.
    toggleCard: (card) =>
      set((s) => {
        const id = cardId(card);
        const chosen = s.selection.some((c) => cardId(c) === id);
        return {
          selection: chosen ? s.selection.filter((c) => cardId(c) !== id) : [...s.selection, card],
        };
      }),

    clearSelection: () => set({ selection: [] }),

    setSelection: (cards) => set({ selection: cards }),

    /**
     * Send a play.
     *
     * The local legality check is a *courtesy* — it keeps the UI from asking
     * for something it already knows will be refused, and it is how drag-to-
     * play knows to send the cards home instead. The session re-validates
     * regardless, which is what actually makes the rule true.
     */
    playCards: (cards) => {
      if (!table) return false;
      const match = matchLegalMove(cards, get().legalMoves);
      if (!match) return false;
      // Only the cards go: what they amount to is the table's conclusion, and
      // asking it to take ours would be asking it to trust us.
      table.play(match.cards);
      return true;
    },

    playSelection: () => {
      get().playCards(get().selection);
    },

    pass: () => {
      if (!get().canPass) return;
      table?.pass();
    },

    cycleSort: () => {
      const mode = nextSortMode(get().sortMode);
      const hand = get().view?.hand ?? [];
      set({ sortMode: mode, handOrder: sortCards(hand, mode).map(cardId) });
    },

    reorderHand: (id, toIndex) => {
      const { handOrder, selection } = get();
      const hand = get().view?.hand ?? [];
      // Reconcile first: the stored order may still name cards already played.
      const current = applyOrder(hand, handOrder).map(cardId);
      // Dragging one of a selected group carries the whole group, so a run of
      // cards you have picked out stays together when you rearrange it.
      const ids = selection.map(cardId);
      const group = ids.includes(id) ? ids : [id];
      set({ handOrder: moveCards(current, group, toIndex) });
    },
  };
});

/**
 * The session's ceremony, plus the one thing only a client can answer.
 *
 * `interactive` is not a property of the ceremony — the session is running it
 * for four seats and has no opinion about which of them is looking at this
 * screen. Whether the pile buttons are live is a question about *you*, so it
 * is answered here.
 */
function toAppCeremony(ceremony: WireCeremony, viewerId: PlayerId | null): CeremonyState {
  if (ceremony.kind !== 'picking') return { kind: 'idle' };
  return {
    kind: 'picking',
    claims: ceremony.claims,
    remaining: ceremony.remaining,
    picker: ceremony.picker,
    interactive: ceremony.picker === viewerId,
  };
}

/** The viewer's seat index, if the table has said which seat that is. */
function seatIndexOf(snapshot: TableSnapshot): { humanSeat?: number } {
  if (!snapshot.you) return {};
  const seat = snapshot.seats.find((s) => s.id === snapshot.you);
  return seat ? { humanSeat: seat.seat } : {};
}

interface SoloSave {
  version: 1;
  you: PlayerId;
  seats: SessionSeat[];
  save: SessionSave;
}

function readSolo(): SoloSave | null {
  try {
    const raw = window.localStorage.getItem(SOLO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SoloSave>;
    // A save from a version this build does not understand is not a game to
    // continue; offering one that then fails to load is worse than not.
    if (parsed.version !== 1 || parsed.save?.version !== 1 || !Array.isArray(parsed.seats) || !parsed.you) return null;
    return parsed as SoloSave;
  } catch {
    return null;
  }
}

function writeSolo(value: SoloSave | null): void {
  try {
    if (value) window.localStorage.setItem(SOLO_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(SOLO_KEY);
  } catch {
    /* storage full or disabled; the match lasts as long as the page does */
  }
}

/**
 * The name you last used — or, the first time, a common name picked for you and
 * kept, so the field is filled in from the start and stays the same across
 * reloads until you change it.
 */
function readName(): string {
  try {
    const stored = window.localStorage.getItem(NAME_KEY);
    if (stored !== null) return stored;
    const picked = randomName();
    window.localStorage.setItem(NAME_KEY, picked);
    return picked;
  } catch {
    return randomName();
  }
}
