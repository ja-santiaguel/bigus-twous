import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { cardId, type Combo, type ComboType, type GameEvent, type PlayerId } from '@big-two/engine';
import {
  buyMedallion,
  campaignTurnOptions,
  canPayForPlay,
  claimReward,
  cleanLoadout,
  passiveBeats,
  payForPlay,
  enterNode,
  endHand,
  leaveShop,
  actInEvent,
  inPlay,
  leaveEvent,
  type EventAction,
  phantomOf,
  PLAYER_SEAT,
  recordVictory,
  runName,
  SEAT_IDS,
  seatById,
  startHand,
  startRun,
  type ClassId,
  type HandResult,
  type MedallionId,
  type RunState,
  type VestigeRecord,
} from '@big-two/campaign';
import { makeSeed } from '@big-two/session';
import { campaignClient, useGameStore } from './gameStore.js';
import { forgetGold } from '../components/GoldAmount.js';

/**
 * The campaign, as the screens see it.
 *
 * The run itself is `@big-two/campaign`'s pure state; this holds it, saves it,
 * and connects it to the table. The cards are played by an ordinary local
 * table (gameStore), told the class passives through its turn options. Around
 * it this store does the gold: it opens each hand's pot with the ante and
 * settles it from the finishing order when the hand ends.
 *
 * Raising is set aside for now (the economy keeps its matched-raise maths,
 * unused): the basic loop — buy in, ante, play, settle, descend — comes first.
 *
 * Nothing here touches playing on your own or with friends.
 */

interface CampaignStore {
  run: RunState | null;
  vestiges: VestigeRecord[];
  /** The last play a class passive made possible, so the table can say so. */
  passivePlay: { seat: PlayerId; classId: ClassId; seq: number } | null;
  /** Cards on the table this trick that were played by a passive, and whose. */
  passiveCards: Record<string, ClassId>;
  /** A run just begun, being welcomed before its map is shown. */
  welcoming: boolean;
  /** Just fallen from the welcome to the map: the map rises into place. */
  arriving: boolean;

  begin(classId: ClassId): void;
  /** From the welcome to the map. */
  descend(): void;
  abandon(): void;
  /** Take a node on the map: sit down at its table, or go to its merchant. */
  choose(nodeId: string): void;
  /** Back to a table left mid-run: a new hand at the same seats. */
  rejoin(): void;
  /** Deal the next hand; `reckoning` calls a Reckoning. */
  deal(reckoning: boolean): void;
  /**
   * Settle a hand the table has finished but the campaign has not — a
   * safety net, so a round that ended unheard can never leave you stuck.
   */
  settleFinished(finishOrder: PlayerId[]): void;
  /** Take one of a won table's Medallions, or none (null). */
  claim(index: number | null): void;
  /** From a table that has ended, back to the run. */
  leaveTable(): void;
  /** End the run from the table: the table is left and the run is gone. */
  endRun(): void;
  buy(id: MedallionId): void;
  leaveShop(): void;
  /** One step of a ? event. */
  act(action: EventAction): void;
  /** From a ? event that is over, back to the map. */
  leaveEvent(): void;
}

const RUN_KEY = 'bigtwo:campaign';
const VESTIGES_KEY = 'bigtwo:vestiges';

/** What this hand has shown so far: who is out, and what each went out on. */
let handLog: { out: PlayerId[]; lastPlay: Partial<Record<PlayerId, ComboType>>; pile: Combo | null } = {
  out: [],
  lastPlay: {},
  pile: null,
};
/** Numbering for the table's flashes, so each is shown once. */
let flashes = 0;

/**
 * One store for the life of the page. In development, editing the campaign's
 * code re-runs this module; a fresh store would hold its own copy of the run
 * while the table still reported to the old one, so the hand you just played
 * would never be settled where the screen reads it. The first store is kept.
 */
const kept = import.meta.hot?.data['campaignStore'] as UseBoundStore<StoreApi<CampaignStore>> | undefined;

export const useCampaignStore =
  kept ??
  create<CampaignStore>((set, get) => {
    /** The seats still in the table: everyone not broke, in seat order. */
    function stillIn(): string[] {
      const table = get().run?.table;
      return table ? inPlay(table).map((s) => s.id) : [...SEAT_IDS];
    }

    function save(run: RunState | null, vestiges = get().vestiges) {
      set({ run, vestiges });
      write(RUN_KEY, run);
      write(VESTIGES_KEY, vestiges);
    }

    /** The table's events, turn by turn: passive plays as they land, and the settlement when the hand ends. */
    function onTurn(events: GameEvent[]) {
      for (const event of events) {
        const run = get().run;
        if (!run?.table?.hand) return;
        if (event.type === 'TRICK_RESET') handLog.pile = null;
        if (event.type === 'CARDS_PLAYED') {
          handLog.lastPlay[event.playerId] = event.combo.type;
          const seat = seatById(run.table, event.playerId);
          // A play only a passive allowed: said at the table, and its cards marked.
          const beaten = handLog.pile;
          handLog.pile = event.combo;
          if (beaten && passiveBeats(seat.classId, beaten, event.combo, seat.medallions)) {
            // Bending the rules has a price, paid into the pot as the play lands.
            save({ ...run, table: payForPlay(run.table, event.playerId) });
            const marked = { ...get().passiveCards };
            for (const card of event.combo.cards) marked[cardId(card)] = seat.classId;
            set({ passivePlay: { seat: event.playerId, classId: seat.classId, seq: ++flashes }, passiveCards: marked });
          }
        }
        if (event.type === 'PLAYER_FINISHED' && !handLog.out.includes(event.playerId)) {
          handLog.out = [...handLog.out, event.playerId];
        }
        if (event.type === 'ROUND_ENDED') {
          const last = stillIn().filter((id) => !event.finishOrder.includes(id));
          settle({ placing: [...event.finishOrder, ...last], wentOutWith: { ...handLog.lastPlay } });
        }
      }
    }

    function settle(result: HandResult) {
      const run = get().run;
      if (!run?.table?.hand) return;
      // What each seat went out on: the last thing it played, for those who went out.
      const wentOutWith = Object.fromEntries(
        Object.entries(result.wentOutWith).filter(([id]) => result.placing.indexOf(id) < result.placing.length - 1),
      );
      const next = endHand(run, { ...result, wentOutWith }, get().vestiges);
      let vestiges = get().vestiges;
      if (next.phase === 'won' && next.table) {
        const phantom = phantomOf(
          {
            seed: next.seed,
            name: next.name,
            classId: next.classId,
            medallions: next.medallions,
            raises: next.stats.raises,
            handsPlayed: next.stats.handsPlayed,
          },
          vestiges.length,
          new Date().toISOString(),
        );
        vestiges = recordVictory(vestiges, next.table, phantom);
      }
      // New players who sat down play the cards at their own level.
      const client = campaignClient();
      for (const joined of next.lastHand?.joined ?? []) {
        client?.setOccupant(joined.seat, { kind: 'cpu', difficulty: joined.persona.difficulty });
      }
      // Anyone broke sits the rest of the table out: asked as each hand is dealt.
      save(next, vestiges);
      client?.refresh();
    }

    /** Walking out of a hand forfeits it: you finish last, the others in order of cards left. */
    function forfeit() {
      const run = get().run;
      if (!run?.table?.hand) return;
      const view = useGameStore.getState().view;
      const counts = new Map((view?.opponents ?? []).map((o) => [o.id, o.cardCount] as const));
      const finished = view?.finishOrder ?? [];
      const rest = stillIn()
        .filter((id) => id !== PLAYER_SEAT && !finished.includes(id))
        .sort((a, b) => (counts.get(a) ?? 13) - (counts.get(b) ?? 13));
      const placing = [...finished.filter((id) => id !== PLAYER_SEAT), ...rest, PLAYER_SEAT];
      settle({ placing, wentOutWith: {} });
    }

    function openTableScreen(run: RunState) {
      const table = run.table;
      if (!table) return;
      handLog = { out: [], lastPlay: {}, pile: null };
      set({ passivePlay: null, passiveCards: {} });
      useGameStore.getState().startCampaignTable({
        seats: table.seats.map((seat, index) => ({
          id: seat.id,
          seat: index,
          occupant: seat.persona ? { kind: 'cpu', difficulty: seat.persona.difficulty } : { kind: 'human' },
        })),
        seed: `${run.seed}:${table.option.id}:${run.draws}`,
        name: run.name,
        sittingOut: () => (get().run?.table?.seats ?? []).filter((s) => s.broke).map((s) => s.id),
        turnOptions: campaignTurnOptions((id) => {
          const current = get().run?.table;
          const seat = current?.seats.find((s) => s.id === id);
          return current && seat
            ? { classId: seat.classId, medallions: seat.medallions, canPay: canPayForPlay(current, seat) }
            : null;
        }),
        names: () =>
          Object.fromEntries(
            (get().run?.table?.seats ?? []).flatMap((s) => (s.persona ? [[s.id, s.persona.name]] : [])),
          ),
        onTurn,
        onLeave: forfeit,
      });
    }

    return {
      // A run saved before tables were dealt on arrival (version 4) is not resumed.
      run: named(read<RunState>(RUN_KEY, (v) => (v as RunState | null)?.version === 4)),
      vestiges: (read<VestigeRecord[]>(VESTIGES_KEY, Array.isArray) ?? []).map((v) => ({
        ...v,
        medallions: cleanLoadout(v.medallions),
      })),
      passivePlay: null,
      passiveCards: {},
      welcoming: false,
      arriving: false,

      begin: (classId) => {
        forgetGold();
        save(startRun(makeSeed(), classId, get().vestiges));
        set({ welcoming: true });
      },
      descend: () => {
        set({ welcoming: false, arriving: true });
        window.setTimeout(() => set({ arriving: false }), 1600);
      },
      abandon: () => save(null),
      choose: (nodeId) => {
        const run = get().run;
        if (!run) return;
        const next = enterNode(run, nodeId);
        if (next.phase !== 'table') {
          save(next);
          return;
        }
        const seated = startHand(next, false);
        save(seated);
        openTableScreen(seated);
      },
      rejoin: () => {
        let run = get().run;
        if (run?.phase !== 'table' || !run.table) return;
        // A hand still open was never finished — the page closed or reloaded
        // mid-hand. It counts as lost, as walking out does, or reloading would
        // be a way out of every bad hand.
        if (run.table.hand) {
          const others = stillIn().filter((id) => id !== PLAYER_SEAT);
          run = endHand(run, { placing: [...others, PLAYER_SEAT], wentOutWith: {} }, get().vestiges);
          save(run);
          if (run.phase !== 'table') return;
        }
        const next = startHand(run, false);
        save(next);
        openTableScreen(next);
      },
      settleFinished: (finishOrder) => {
        if (!get().run?.table?.hand) return;
        const last = stillIn().filter((id) => !finishOrder.includes(id));
        settle({ placing: [...finishOrder, ...last], wentOutWith: { ...handLog.lastPlay } });
      },
      deal: (showdown) => {
        const run = get().run;
        if (run?.phase !== 'table') return;
        // A hand still open here was played out but never settled: settle it
        // from where the table says everyone finished, and show that result
        // rather than dealing past it.
        if (run.table?.hand) {
          get().settleFinished(useGameStore.getState().view?.finishOrder ?? []);
          return;
        }
        handLog = { out: [], lastPlay: {}, pile: null };
        set({ passivePlay: null, passiveCards: {} });
        save(startHand(run, showdown));
        useGameStore.getState().startNextRound();
      },
      claim: (index) => {
        const run = get().run;
        if (run) save(claimReward(run, index, get().vestiges));
      },
      leaveTable: () => {
        useGameStore.getState().leaveTable();
      },
      endRun: () => {
        // Gone first, so leaving the table has no hand of this run to settle.
        save(null);
        useGameStore.getState().leaveTable();
      },
      buy: (id) => {
        const run = get().run;
        if (run) save(buyMedallion(run, id));
      },
      act: (action) => {
        const run = get().run;
        if (run) save(actInEvent(run, action));
      },
      leaveEvent: () => {
        const run = get().run;
        if (run) save(leaveEvent(run, get().vestiges));
      },
      leaveShop: () => {
        const run = get().run;
        if (run) save(leaveShop(run, get().vestiges));
      },
    };
  });

if (import.meta.hot) {
  import.meta.hot.dispose((data: Record<string, unknown>) => {
    data['campaignStore'] = useCampaignStore;
  });
}

/** A run saved before runs were named takes the name its seed gives it. */
function named(run: RunState | null): RunState | null {
  return run && !run.name ? { ...run, name: runName(run.seed) } : run;
}

function read<T>(key: string, valid: (value: unknown) => boolean): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as unknown;
    return valid(value) ? (value as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or disabled; the run lasts as long as the page does */
  }
}
