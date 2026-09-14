# Tiến Lên (Vietnamese Big Two) — Architecture Proposal

**Status:** Proposal — no application code has been written. Awaiting approval.
**Scope of v1:** 1 human player + 3 CPU players, full playable game, polished browser UI.
**Design constraint:** multiplayer (lobby-code based) must be addable later *without rewriting the rules engine*.

---

## 1. Repository state

No existing repository, package manifest, or prior project files were found. This is a **greenfield build**. Everything below is a proposed structure, not a description of existing code.

---

## 2. Proposed Architecture

The core idea: **the rules engine is a pure, deterministic, framework-agnostic TypeScript library that has no idea whether it's running in a browser tab against CPUs or on a server refereeing four network clients.** Everything else (React UI, animations, CPU AI, eventually networking) is a consumer of that engine's public API. This one decision is what makes multiplayer additive later instead of a rewrite.

### 2.1 Layered architecture

```
┌─────────────────────────────────────────────┐
│  UI Layer (React components, purely visual)  │
├─────────────────────────────────────────────┤
│  Animation Layer (reacts to event log,       │
│  never drives game logic)                    │
├─────────────────────────────────────────────┤
│  Client Store (Zustand) — mirrors engine      │
│  state, exposes it to React via hooks        │
├─────────────────────────────────────────────┤
│  Player Adapters: Human | CPU | (future)     │
│  Remote — all implement the same interface   │
├─────────────────────────────────────────────┤
│  Game Orchestrator (turn manager, state      │
│  machine, applies Intents → Events)          │
├─────────────────────────────────────────────┤
│  Rules Engine (pure functions: deck, combo   │
│  detection, legal move generation, scoring)  │
└─────────────────────────────────────────────┘
```

### 2.2 Game rules
Implemented as **pure functions with no side effects and no I/O**: given a `GameState` and a `Move`, produce a new `GameState` (or an error). No DOM, no React, no `Math.random()` calls scattered around (RNG is injected and seeded — important for replay/debugging and eventually for server-authoritative fairness).

### 2.3 Game state
A single serializable JSON-shaped object:

```ts
interface GameState {
  players: PlayerState[];       // hands, id, seat position
  currentTrick: {
    pile: Combo | null;         // the combo currently "in play" on the table
    leader: PlayerId;
    passes: PlayerId[];         // who has passed since the last non-pass play
  };
  turn: PlayerId;
  round: number;
  history: GameEvent[];         // append-only log of everything that happened
  rngSeed: string;
  phase: 'dealing' | 'playing' | 'roundEnd' | 'matchEnd';
}
```

Two properties matter a lot for future multiplayer:
- **It must be fully serializable** (no class instances, functions, or circular refs) — this is exactly the shape you'd JSON-serialize over a WebSocket later.
- **It must support a "redacted" view per player** (i.e., a function `toPlayerView(state, playerId)` that hides other players' hands) — built from day one, even though in single-player-vs-CPU everything technically runs client-side. This is the single most important habit to start now; retrofitting hidden information later is painful.

### 2.4 Legal move generation
A pure function: `getLegalMoves(hand: Card[], pile: Combo | null, rules: RuleConfig): Combo[]`.
This is the single most reusable/testable piece of the whole project — CPU AI, move validation, and the "is this a legal play" UI hint all call the *same* function, so there's only one source of truth for what's legal.

Combo detection should be modeled explicitly:
- Single, Pair, Triple, Straight (sảnh, min length configurable)
- Four-of-a-kind bomb
- Consecutive-pairs bomb ("dây thối" / three-or-more consecutive pairs) — variant-dependent, see open questions
- Comparison logic (which combo beats which) as its own pure function, since bombs have special beats-everything / beats-2 semantics

### 2.5 CPU players
CPUs implement the exact same `Player` interface a human or future network player would:

```ts
interface Player {
  id: PlayerId;
  getMove(view: PlayerView, legalMoves: Combo[]): Promise<Combo | 'pass'>;
}
```

Because CPU decision-making only ever sees `PlayerView` (the redacted state) and the precomputed `legalMoves`, it's physically impossible for the CPU to cheat by peeking at other hands — and this same interface is exactly what a `RemotePlayer` (waiting on a socket message) will look like later. `Promise`-based (not synchronous) from day one, so CPUs, humans, and future network players are all "awaited" identically by the turn manager — this also means you never assume a move resolves instantly, which matters once real network latency exists.

Implement CPU strategy as pluggable, e.g. `GreedyLowestValidPlay`, `HeuristicWeightedPlay`, so difficulty levels are just swappable strategy functions, not forked engines.

### 2.6 UI
React components should be **presentational only** — they read from the store and dispatch *intents* (e.g., `playCards(selectedCards)`), never mutate game state directly. The engine validates the intent, produces a new state + a `GameEvent`, and the store updates. This intent → validate → event pattern is deliberately the same shape as "client sends move to server, server validates, broadcasts new state" — so the UI layer barely changes when multiplayer arrives; only *where* the validation happens (locally vs. on a server) changes.

### 2.7 Animations
Animations should be driven by the **event log**, not by state diffing or by being interleaved into game logic. E.g., a `CardsPlayed` event triggers a Framer Motion animation of cards flying to the pile; the engine itself has already resolved the turn instantly and synchronously underneath. This decoupling matters because a multiplayer client will receive events over the network and need to animate them the same way, regardless of how much slower/faster the network is than local play.

### 2.8 Future multiplayer (design now, build later)
The lobby-code multiplayer model this points toward:
- A server runs the **exact same engine package** (published as a workspace package, not copy-pasted).
- Clients send `Intent`s over WebSocket; server validates via the shared engine, mutates authoritative state, and broadcasts either the full state or a per-player redacted view + event.
- CPUs can even keep playing the "fourth seat" role server-side in a 1-human lobby, using the identical `Player` interface.
- Reconnection is tractable because state is just JSON + an event log — a reconnecting client can be handed the current redacted state directly rather than needing to replay history.

---

## 3. Architectural traps that would make multiplayer hard later

These are the decisions that, if made carelessly now, would force a rewrite:

1. **Letting the UI or CPU read full, non-redacted `GameState` directly**, instead of going through a `toPlayerView()` projection. If CPUs and UI are wired to the full state now, adding hidden information (needed the instant a real opponent exists) means restructuring every consumer.
2. **Using `Math.random()` inline inside rules logic** rather than an injected/seeded RNG. Non-deterministic engines can't be trusted for server-authoritative replay, resync, or fairness verification.
3. **Synchronous turn resolution assumptions** — e.g., code that assumes `getMove()` returns instantly. Network players won't.
4. **Storing game state in React Context/component state** as the source of truth, rather than in a framework-agnostic store the engine owns. Makes it hard to run the same engine headlessly (server, tests, CPU-vs-CPU simulation) later.
5. **Mutating state directly from UI event handlers** instead of dispatching validated intents. This is the difference between "trusted local code" and "a server that must reject illegal moves from a malicious client" — if the pattern isn't intent-based from the start, adding that trust boundary later touches every click handler.
6. **Coupling animation timing to game-logic timing** (e.g., using `setTimeout` inside the engine to "wait for the animation"). The engine should resolve turns instantly; animation is a pure side-effect of watching the event log.
7. **Baking single-player-only assumptions into the data model**, e.g., a `humanPlayer` singleton object instead of a generic `players: Player[]` array. Should be seat-agnostic from the start (seat 0–3, one of which happens to be human).

---

## 4. Implementation Phases

| Phase | Goal | Notes |
|---|---|---|
| **0. Scaffolding** | Monorepo setup, TS config, lint/test tooling, CI-less local scripts | Establishes the `engine`/`ai`/`app` boundary immediately |
| **1. Rules engine (headless)** | Cards, deck, combo detection, legal move generator, combo comparison, scoring, win conditions — fully unit tested | No UI. This is where rule ambiguities (Section 5) must be resolved and encoded as `RuleConfig` |
| **2. Game orchestrator** | Turn manager/state machine, intent → event pipeline, seeded RNG, redacted player views | Still headless; can be exercised entirely via tests |
| **3. CPU players** | `Player` interface, at least one working heuristic strategy, headless CPU-vs-CPU simulation harness | Doubles as engine validation — run thousands of simulated games to catch rule bugs before UI exists |
| **4. UI shell** | React app, board/hand layout, card components, dispatch intents, fully playable but visually plain | 1 human + 3 CPU, no animation polish yet |
| **5. Animation & visual polish** | Framer Motion transitions, card dealing/flying, sound, responsive layout, accessibility pass | Driven by event log per §2.7 |
| **6. Multiplayer-readiness stubs** | `RemotePlayer` adapter (unused, but interface-complete), lobby-code data model design doc, verify redacted views are already correct | Non-functional scaffolding only — no server yet, per your instruction not to implement multiplayer now |
| **7. (Separate future proposal) Multiplayer backend** | Real-time server hosting the shared engine package, lobby codes, matchmaking, reconnection | Deliberately out of scope until v1 ships |

---

## 5. Rule ambiguities that must be resolved before implementation

Vietnamese Tiến Lên has significant regional/house-rule variation. These need explicit decisions and will be encoded as a `RuleConfig` object (so variants can even be toggled later):

1. **Starting player & first play**: Standard is "holder of 3♠ starts, and their first combo must include the 3♠." Confirm this, and confirm whether the starter is *forced* to play the lowest legal combo containing it or may choose any legal combo containing it.
2. **Suit ranking convention**: For breaking ties on singles/pairs and determining "highest 3♠ holder," Vietnamese convention is typically Spades < Clubs < Diamonds < Hearts, but this varies by region/house. Needs an explicit, confirmed order.
3. **Bombs — which types are legal, and their hierarchy**:
   - Four-of-a-kind bomb — confirmed standard.
   - Three-or-more consecutive pairs ("dây") as a bomb — include or not? If included, minimum length (3 pairs? 4?).
   - How do multiple bomb types rank against each other (e.g., does a longer consecutive-pair bomb beat a four-of-a-kind)?
4. **"Chặt heo" (pig-chopping) rules**: Can a single 2 or pair of 2s be "chopped" only by a bomb? Is this house rule enabled at all — some casual rulesets disable it entirely, others make it central. Needs an explicit toggle decision.
5. **Straights (sảnh)**: Minimum length (commonly 3)? Do straights wrap (Q-K-A-2-3)? Standard is that 2s cannot be part of a straight — confirm.
6. **Passing & trick reset**: Once all other players pass on a pile, the last player to have played leads the next trick with a free choice of any combo — confirm this standard behavior and how it's visualized/timed.
7. **Scoring / match structure**: Is this single-round (winner takes all, game ends) or a multi-round point-scored match (points for cards left in losers' hands, penalty multipliers for holding a 2 or multiple 2s at end, bonus for "trắng" (going out with an entirely unplayed premium hand))? This materially changes the state machine (`phase: 'roundEnd'` vs `'matchEnd'`) and needs a decision.
8. **Bonus instant-win hands**: Some house rules grant an automatic win/bonus for hands like a full same-suit straight from 3 to A ("rồng"/dragon), four triples, or all even/odd ranks, dealt before any play happens. Decide whether these are supported in v1 or deferred.
9. **Deck/player count assumptions**: Confirm standard 52-card deck, no jokers, exactly 4 players, 13 cards each (no support needed for 2–3 player variants in v1).
10. **Turn timers**: Not a rules ambiguity per se, but worth deciding now — will CPUs/humans have a time limit per turn? Relevant for both UX pacing and eventual multiplayer fairness.

---

## 6. Recommended minimum viable stack

| Concern | Recommendation | Why |
|---|---|---|
| Language | TypeScript everywhere | Shared types between engine, UI, and future server prevent drift |
| Frontend framework | **React 18 + Vite** | Largest ecosystem, best animation library support (Framer Motion), and the easiest path to a future Socket.io/Colyseus client; recommended over Svelte/vanilla given multiplayer is a near-term goal |
| Client state | **Zustand** | Minimal boilerplate, easy to subscribe to from outside React (useful for CPU simulation/testing), simple to later swap for a network-synced store |
| Styling | Tailwind CSS | Fast, consistent, easy to theme a card table UI |
| Animation | **Framer Motion** | React-native, spring-based, well suited to card movement/dealing |
| Rules engine testing | **Vitest** | Fast, TS-native, ideal for the large unit-test surface a combo/legal-move engine needs |
| E2E testing (later) | Playwright | Once UI exists |
| Monorepo tooling | npm/pnpm workspaces | Enforces the engine/ai/app boundary as separate packages from day one, even without publishing anything |
| Future multiplayer transport | **Colyseus** (preferred) or plain Socket.io | Colyseus is purpose-built for authoritative room-based games with lobby codes and state sync, and integrates cleanly with a TS engine; plain Socket.io is a viable fallback if more control is wanted |
| Build/lint | Vite + ESLint + Prettier, strict `tsconfig` | Standard, low-friction |

No backend is needed for v1 — it can ship as a static SPA with CPU logic running entirely client-side.

---

## 7. Proposed directory structure

```
big-two/
├── packages/
│   ├── engine/                # Pure rules engine — NO React/DOM imports
│   │   ├── src/
│   │   │   ├── cards.ts           # Card, Deck, ranking primitives
│   │   │   ├── combos.ts          # Combo detection (single/pair/straight/bomb/...)
│   │   │   ├── legalMoves.ts      # getLegalMoves()
│   │   │   ├── compareCombos.ts   # beats() logic incl. bomb hierarchy
│   │   │   ├── state.ts           # GameState, PlayerView, reducers
│   │   │   ├── orchestrator.ts    # turn manager / state machine, intent→event
│   │   │   ├── rng.ts             # seeded RNG
│   │   │   ├── ruleConfig.ts      # toggle points for Section 5 ambiguities
│   │   │   └── types.ts
│   │   └── test/                 # Vitest suite; also CPU-vs-CPU simulation harness
│   ├── ai/                    # CPU strategies — depends only on engine's public API
│   │   └── src/
│   │       ├── player.ts          # Player interface + HumanPlayer stub
│   │       ├── strategies/
│   │       │   └── greedyLowest.ts
│   │       └── simulate.ts        # headless N-game simulation runner
│   └── app/                   # React UI (Vite)
│       ├── src/
│       │   ├── store/              # Zustand store wrapping engine + orchestrator
│       │   ├── components/         # Board, Hand, Card, PileDisplay, etc. (presentational)
│       │   ├── animations/         # Framer Motion sequences driven by event log
│       │   ├── hooks/
│       │   └── App.tsx
│       └── index.html
├── server/                    # (placeholder only, not built in v1)
│   └── README.md               # documents future intent; no code yet
├── package.json                # workspace root
├── tsconfig.base.json
└── README.md
```

---

## 8. Open questions requiring your product decisions

Beyond the rule ambiguities in Section 5, a few product-level calls:

- **Difficulty levels for CPUs** in v1, or a single competent baseline strategy?
- **Turn/move time limits** — none, or a soft timer (auto-pass/auto-play if exceeded)?
- **Match structure** — best-of-N rounds with cumulative scoring, or single game to first empty hand?
- **Visual/theme direction** — realistic card table vs. stylized/minimal aesthetic (affects the animation and asset scope in Phase 5)?
- **Sound** — in scope for v1 polish, or deferred?

---

---

## 9. Finalized Ruleset (locked `RuleConfig`)

All rule ambiguities from Section 5 are now resolved via product decisions. This is the authoritative ruleset Phase 1 will implement and test against.

### 9.1 Starting player and opening play *(amended 2026-09-11)*
- **Round 1 of a match**: the holder of the 3♠ starts.
- **Round 2+**: the **winner of the previous round** starts.
- **The opening play is a free choice among every legal combo that contains the opening card.** Any combo the hand can form is allowed — single, pair, triple, straight, chain — provided the opening card is one of the cards in it. What the opener may not do is hold that card back.
  - **Opening card** = the starter's own **lowest card**. In round 1 the starter is the 3♠ holder and their lowest card *is* the 3♠, because nothing is lower — so the two clauses are one rule with two readings, not two rules.
- *Superseded*: the opening was previously forced to exactly one combo — the lowest legal combo containing the required card — which in practice meant the bare lowest single every time. `GameState.forcedOpeningCombo: Combo` is accordingly replaced by `GameState.openingCard: Card`, and `TurnConstraint.FORCED_OPENING` now carries `card` rather than `combo`.
- Consequence worth naming: the opener now has a real decision on the first turn of every round, and a CPU will open with a straight or a pair built around its lowest card when that serves it better than shedding the card alone.

### 9.2 Suit ranking (confirmed)
`Spade < Club < Diamond < Heart`, used for tie-breaking same-rank cards (singles, pairs, and determining the 3♠ holder / "who has the lowest 2" etc.).

### 9.3 Card ranking
`3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < 2`, with suit as the tiebreaker per 9.2.

### 9.4 Bombs — types and hierarchy
Two **separate, non-interoperable** bomb families:
- **Four-of-a-kind (tứ quý)** — one per rank, ranked by card rank when compared bomb-vs-bomb.
- **Consecutive-pair chains (dây)** — minimum length 3 pairs. A chain compares **only against chains of the same length**, where the higher top card wins (rank first, suit as tiebreaker). A longer chain does **not** beat a shorter one. Chain length determines which size of Two-combo the chain may bust (9.5) — it is not a ranking between chains.
- The two families **cannot beat each other** — a four-of-a-kind can never be countered by a dây, and vice versa; each only compares against its own kind, or targets a 2-combo per 9.5.
- **Quad of 2s (four-of-a-kind, rank 2)** is the ceiling of the game — nothing can beat or bomb it.

### 9.5 Chặt heo (2-chopping) — forced bombing
- Applies **only** when the active pile is a 2-combo: single 2, pair of 2s, or triple of 2s (quad of 2s is unbombable — see 9.4).
- If a player holds a legal bomb capable of beating the active 2-combo, **they are forced to play it** (cannot pass or play something else instead).
- Beating requirements by 2-combo size:
  - **Single 2** → beaten by a four-of-a-kind **or** a dây of length ≥3.
  - **Pair of 2s** → four-of-a-kind **cannot** beat it; only a dây of length ≥4 can.
  - **Triple of 2s** → four-of-a-kind cannot beat it; only a dây of length ≥5 can. *(Confirmed 2026-09-10 against pagat.com, which states three pairs beat a single two, four pairs beat a pair of twos, and five pairs beat three twos — matching this ruleset exactly. This closes the open item formerly in 9.12.)*
- A same-rank **higher-suited 2 beaten by a normal higher single** is not "chopping" — it's just standard single-beats-single with suit as tiebreaker, and remains legal at all times regardless of bombs.

### 9.6 Straights (sảnh)
- Minimum length 3 cards, no wraparound, 2s excluded entirely from eligibility.

### 9.7 Passing *(clarified 2026-09-11)*
- **Passing forfeits the whole trick, not one turn.** A player who passes takes no further part in the current trick and is skipped for the rest of it, even if someone else plays after them. They re-enter only when the trick closes.
- Once every other player still holding cards has passed, the last player to have played takes the trick and leads the next one with a completely free choice of combo.
  - If taking the trick emptied that player's hand, the lead passes clockwise to the next player who still holds cards. The `TRICK_RESET` event records `wonBy` and `leader` separately for exactly this case.
- **Why this is a clarification and not a change of mind**: the original wording said "all other *active* players", which presumes a notion of being out of the trick, but the engine did not track one — it counted consecutive passes and kept cycling the turn, so a player who passed could play again later in the same trick. The rule above is the standard one and is what the wording always implied.
- **Consequence worth naming**: a player who has passed can no longer be forced to bust a Two under 9.5, because they are out of the trick entirely. The forced-bust rule only ever applies to a player whose turn it actually is.
- A clearly visible **"Pass"** button drives this in the UI. How long a person has to decide is in 9.11 *(amended 2026-09-13)*.

### 9.8 Match / scoring structure *(superseded 2026-09-11 — see 9.15)*
- ~~**Single-round win** ends the game (first to empty their hand wins that round)~~ — replaced by placement scoring. A round now runs on until only one player still holds cards, so every seat earns a placement.
- No "trắng" (instant-win) bonuses. 9.9 still stands.
- The winner of a round determines the next round's starter (9.1). Unchanged.

### 9.9 Instant-win hands
- **Not supported.** No automatic wins from pre-play hand composition (no dragon straights, no all-triples, etc.).

### 9.10 Deck & players
- Standard 52-card deck, no jokers, exactly 4 players, 13 cards each. No 2/3-player support in v1.
- **Forward-looking note**: future plans include a "trump cards by class" variant. The `Card` type and rank/suit comparator functions will be written to accept an optional comparison-context parameter (unused/no-op in v1) so this can be layered in later without reworking the comparison core.

### 9.11 Timing *(amended 2026-09-13)*
- **Playing alone: no timers.** Nobody else is waiting.
- **Shared tables: a clock per turn.** A person on turn has **60 seconds**. When it runs out the table moves for them: it passes where passing is legal, and otherwise makes their first legal play (the opening play and a forced bomb cannot be passed). Computer seats have no clock. Clients are sent the time remaining, not a deadline, so a device whose clock is wrong still shows the right countdown.
- **Picking a pile at a shared table** *(amended 2026-09-14)*: a person has **15 seconds** to claim a pile. When it runs out the table claims one of the remaining piles for them — the piles are blind, so nothing is lost but the click. Playing alone, the pick is untimed.
- **Between rounds at a shared table.** A round deals once every connected person is ready. As soon as anybody is ready a **30-second countdown** starts; when it ends the round deals anyway, and a computer plays for anybody who was not ready — a *stand-in* — until that person says they are ready, which hands the seat straight back. There is no countdown before the first deal, while people are still arriving. *(Amended 2026-09-14)* A player may cancel their ready until the round deals; if that leaves nobody ready the countdown stops, and it starts again from the full 30 seconds when somebody next readies up. While anybody else is still ready it keeps running.
- *Superseded*: the chess-clock model (one time bank per player for the whole game). A clock per turn reads at a glance and keeps a table moving when one person walks away, which a whole-game bank does not. `PlayerState.timeBankMs` stays reserved and unused.

### 9.12 Resolved open items
- **Triple-of-2s bomb requirement** — resolved, see 9.5. A dây of length ≥5 is required; four-of-a-kind is excluded. Confirmed against pagat.com on 2026-09-10.
- **Four-of-a-kind vs. three-pair chain** — a four-of-a-kind **cannot** beat a three-pair chain, and a three-pair chain cannot beat a four-of-a-kind. Both are exclusively Two-counters and never meet. Confirmed against pagat.com, which states a four of a kind and a sequence of three pairs each beat a single two and nothing else.
- *Note on variants:* some rulesets (including Board Game Arena's) use a flat "any bomb beats any bomb" model with no families. That variant is **not** used here; the family separation in 9.4 is deliberate.

### 9.13 Pile selection ceremony
- After the shuffle, the 52 cards are dealt round-robin into 4 piles of 13 (card 1 → pile 1, card 2 → pile 2, card 3 → pile 3, card 4 → pile 4, card 5 → pile 1, …).
- Players then claim piles one at a time in a visible order, proceeding clockwise from whoever picks first.
- **Who picks first** *(amended 2026-09-11)*:
  - **Opening round of a match**: the **people** at the table pick first, in a random order among themselves; **computers pick last**. Nobody has won anything yet, so there is no winner to defer to, and with picks blind the order decides nothing — which is exactly why it can be spent on the people present.
  - **Every round after**: the **previous round's winner** claims first, computer or human alike, then clockwise.
  - *History*: an earlier amendment the same day put the human first in **every** round; that is now limited to the opening round only. `createNewRound` still accepts an optional `firstPicker` override; the client passes a full pick order instead.
  - This does **not** affect 9.1 — the previous round's winner both claims first and leads, but those are two separate rules that happen to name the same player.
- Picks are **blind** — nothing about any pile is revealed before it is claimed. The ceremony is presentational and has no effect on fairness or strategy.
- **Piles are dealt in shuffle order and handed over unsorted** *(added 2026-09-11)*. A player first sees their hand exactly as it came off the shuffle; arranging it is the player's job, not the deal's. The client keeps its own arrangement from that point on, and sorting — manual or by the sort control — persists for the rest of the round like any other arrangement. The engine re-sorts a hand internally after each play for its own convenience; that is invisible to the client, which renders its own order.
- Pile selection does **not** affect turn order; the starting player is determined solely by 9.1.
- **Picks are interactive** *(amended 2026-09-11)*: a human seat chooses its pile by clicking one when its turn in the queue comes round; computer seats draw uniformly from the seeded RNG. Because a person's choice is not in the seed, a round containing a human pick is **no longer reproducible from `rngSeed` alone** — it stays fully replayable from the event log, which records every claim, and the log (not the seed) is what a server would ship to a reconnecting client. An all-computer table is still seed-reproducible.
- The piles must exist before anyone can pick, so the client deals them and hands them back: `createNewRound` accepts optional `piles` and `claims`, and validates the claims rather than trusting them. That validation is deliberate — this is the seam where untrusted input will arrive once there is a server.

- **The deal has its own random stream** *(amended 2026-09-13)*. Piles are dealt from the seed and the round number alone, apart from the stream used for pick order and computer picks — so the same seed deals the same four piles whoever is seated. Seeds are two groups of four from the table-code alphabet (`ABCD-2345`), the same alone and at a shared table.

### 9.15 Scoring *(added 2026-09-11)*
- A round is scored by **finishing place**, which is why a round no longer ends when the first player goes out: play continues until only one player still holds cards.
- Points per place: **1st = 5, 2nd = 3, 3rd = 1, 4th = 0.**
- The player left holding cards places last and scores nothing. With four players the round ends as soon as three have gone out, so exactly one seat is unplaced.
- **No deduction for Twos left in hand.** The deduction was considered and deliberately withheld. `scoreRound` takes an optional `twoPenalty`, defaulted to 0 and applied nowhere — the rule is one line away if the table ever wants it, and is unit-tested in that configuration so it cannot rot.
- Points accumulate across the match in `GameState.points`. `roundsWon` is kept alongside it and still counts outright wins only (finishing 1st).
- Scoring lives in `packages/engine/src/scoring.ts` as pure functions, separate from the state machine, so the scheme can change without touching the rules.

### 9.16 Seats, leaving and hosting *(added 2026-09-13)*
- **Choosing a seat.** Before the first deal a person may move to any seat nobody holds. Seats are fixed from the first deal.
- **Starting** *(amended 2026-09-14)*. Before the first deal every player readies up (and may back down); the host starts the game once every other connected person is ready — at once if nobody else is there. A change to computer difficulty or the match length un-readies everyone. Between rounds the ready vote and countdown of 9.11 apply, and a ready can be cancelled there too.
- **Leaving before the first deal** frees the seat at once: a computer takes it and the person's seat token stops working.
- **Dropping out, or leaving, after the first deal** holds the seat for **2 minutes**. A computer plays it meanwhile, and the same browser tab rejoining — by link or table code — takes it back. After 2 minutes the seat is freed, and the next person to join takes it, with its hand and its points.
- **The host** is the connected person who has been seated longest; if they go, the next longest-seated takes over. Before the first deal the host may remove anybody, and the host alone sets computer difficulty and the match length (9.17) *(amended 2026-09-14)*. The removed seat goes back to a computer and its token stops working; the person may still arrive again through the link, as somebody new.
- **Playing alone.** Leaving asks for confirmation and ends the match. A match in progress is saved in the browser after every turn and can be continued from the main menu.

### 9.17 Match length *(added 2026-09-14)*
- A match ends by one of two rules, chosen before the first deal:
  - **Points** — the match ends when a round finishes with anybody on **15, 30 or 50** points. **First to 30 is the default.**
  - **Rounds** — the match ends after **5 or 10** rounds.
- **Who wins**: the most points; if level, the most rounds won outright (9.15's `roundsWon`); if that is level too, nobody has won and one more round is played, then checked again.
- **Choosing it**: alone, in the lobby. At a shared table, **only the host** (9.16) may change it, and only before the first deal.
- **After a match**: *Play again* starts a new match at the same table — points, round numbers and the pick order reset, and the rematch deals from its own stream so a shared seed does not repeat the first match's cards. The first match of a table deals exactly as 9.13 describes.
- Lives in `@big-two/session` (`match.ts`), not the engine: the engine scores rounds, the session decides when a series of them is over.

### 9.18 Hosting and fairness *(added 2026-09-14)*
- **A shared table runs in the host's browser** by default: the same `Table` a table server runs, inside a web worker, reached by the other players over WebRTC. A table server remains an option for deployments that want one.
- **The deal comes after the picks.** Every seat claims its pile first; only then is the shuffle settled. Picks stay blind for everyone, the host included.
- **Everyone shuffles.** Before each deal the host sends the SHA-256 hash of a fresh secret (`DEAL_COMMIT`). Every connected person answers with a random 32-byte share (`DEAL_SHARE`). The deal seed is the hash of the secret and all shares; a share that does not arrive within 8 seconds is left out.
- **Everyone checks.** When a round ends the host sends each seat the full record (`ROUND_AUDIT`): its secret, the shares, the claims and the history. Each device confirms the secret matches the hash it was sent, that its own share and pile were used, that its hand is the one the seed deals, and replays every move through the rules engine against the history and scores it was shown. The scores screen reports the result.
- **What this does not stop**: the host's browser holds every hand, so a determined host can look. It cannot steer the deal, change a move or a score, or swap a pile without every other device seeing the check fail. This is an explicit exception to the rule that no client holds another player's cards, for the host only.
- **Seeds** do not apply at a browser-hosted table: its deal comes from the shared shuffle.
- **The host leaving closes the table**, and the browser asks before the host's tab closes. *(Amended 2026-09-14)* Two exceptions and a guarantee:
  - **In the lobby, a host's page can come back.** A reload, or reopening the closed tab, within **60 seconds** reopens the same table — code, seats, names, computer difficulty and match length — and everyone sits back down with the seat tokens they already hold. Meanwhile the other players' devices wait for the host. A host who leaves with the Leave button closes the table at once.
  - **Once the first round is dealt nothing is restored**: a copy of hands, scores and a sealed shuffle kept in the host's page is not something the other players could trust. Guests are told the table has closed.
  - **Every device notices a lost connection within about 10 seconds.** Both ends of each line say they are still there every 2 seconds, because WebRTC does not reliably report a closed tab.

### 9.14 Terminology (locked)
- **match** — a series of rounds played by the same table; per-player match **points** (9.15) and a count of rounds won are both tracked. It ends by the rule in 9.17 *(amended 2026-09-14)*.
- **round** — one full deal of 52 cards, played until only one player still holds cards (three have gone out). Amended 2026-09-11 by 9.15; it previously ended when the *first* player emptied their hand.
- **rotation** — all four players having taken one turn.
- **turn** — the active state in which one player chooses a play or passes.

---

**Status (2026-09-13):** implemented — the rules engine, computer players, the single-player game, and shared tables with a server. Section 9 is the live ruleset; amendments are dated where they were made. `DESIGN.md` at the repository root covers the interface.
