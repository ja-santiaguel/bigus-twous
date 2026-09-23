# Big Two Campaign — Gameplay Design Brainstorm

**Purpose of this document**: this is the exploratory space. Ideas here can
be tentative, contradictory across sections, or explicitly marked as
superseded. This is NOT the document to hand to an implementation session —
see `DESIGN_SPEC.md` for the current locked/buildable subset.

**Status legend** used throughout:
- ✅ **CONFIRMED** — decided, ready to be reflected in `DESIGN_SPEC.md`
- 🟡 **LEANING** — has a working default, not yet locked
- ❓ **OPEN** — genuinely undecided, needs a decision
- ⛔ **SUPERSEDED** — an earlier idea, kept for context, no longer the current direction

---

## 1. Core Resource: Gold / Worth ✅

A single resource does triple duty: economic wealth, life total, and
wagering power. No secondary resources (mana, energy, favor, insight,
momentum, etc.) — this is a hard design constraint, not just a starting
preference.

- Worth persists **continuously across an entire campaign run** — it is
  not reset per table/stage. There is one number, and it goes up or down
  as tables are played.
- Reaching 0 Worth ends the run (permadeath).
- Completing a run successfully snapshots that run into history — see
  the Vestige Table (Section 8).

### ⛔ Superseded: Vault / Table Bank split
An earlier version of this design split Worth into two containers: a
persistent **Vault** (carries across stages) and a per-stage **Table
Bank** (resets each stage, funded from the Vault at stage-start, returned
to the Vault at stage-end). This added real depth (partial-commit
decisions, a "how much of my life do I risk on this floor" moment) but
conflicts with the "one singular resource" constraint established later.
**Current direction is the single continuous Worth model above.** The
partial-Vault-commitment idea is still interesting and could be
reintroduced later as an explicit choice (see Open Questions), but not as
a default two-container structure.

---

## 2. Four Classes

Naming ✅: **Commoner**, **Courtier**, **Tyrant** and **Seer**.

⛔ Superseded: the interim names **Pauper** (for Commoner) and **Alchemist**
(for Courtier).

**Passive only, for now ✅.** Each class is one passive and a risk
philosophy. The activated mechanics below (Transform, Duplicate, Command,
Reveal) are ⛔ **shelved** — kept here as context and as candidates if
actives return later, but not part of the current design. Passive strength
is tuned by playtesting as we go, not settled on paper first.

### Commoner — 3–10
- **Identity**: adaptation, flexibility, transformation, making mediocre
  cards useful.
- ⛔ *Shelved active (Transform)*: temporarily treat a 3–10 card as a
  lower-ranked card of the same suit, for one play. Never upward.
- **Passive** 🟡: *a straight of 5+ cards can beat a single 2.*
  - Refinement under consideration: restrict to a same-suit straight
    (straight flush) to keep it genuinely rare, matching bomb-tier rarity
    — or keep it any-suit but make it non-forced (i.e., NOT subject to
    the forced-bust rule the way real bombs are), so a Commoner is never
    punished for holding a long straight when someone leads a 2. ❓ needs
    a decision before implementation.
- **Risk philosophy**: low risk / low-to-moderate reward / incremental
  value. Smaller bankroll, smaller ante, smaller raise ceiling, better
  preservation of losses. "Every coin keeps me alive."
- **Gold relationship**: preserves & trickles — generates small amounts
  from otherwise-wasted cards, protects against total loss. Risk = missed
  upside, not danger.

### Courtier — J–A
- **Identity**: combination manipulation, efficiency, turning scarce high
  cards into powerful plays.
- ⛔ *Shelved active (Duplicate)*: temporarily duplicate one J–A card for a
  single play (e.g., a lone King becomes a pair of Kings for that play).
  Does not permanently enter the hand.
- **Passive** 🟡: *can play double face cards (a natural pair of J–A) as a
  triple.* ⛔ Replaced for playtesting by *a pair of Jacks or higher beats a
  triple of 10s or lower* (DESIGN_SPEC 9): the same "court over the commons"
  idea as an extra beat, with no played-as cards.
  - Balance flag: as a free, unlimited, always-on effect this lets a
    Courtier empty their hand faster than the physical card count should
    allow, which is a structural race advantage, not just a combat trick.
    Two mitigations under consideration: restrict to K/A only (top 8
    cards, tighter scarcity match), or cap to once per hand. ❓ needs a
    decision.
- **Risk philosophy**: moderate risk / strong conversion of favorable
  opportunities. "My worth should make me worth more."
- **Gold relationship**: converts — turns already-good hands into better
  payouts. Risk = investment sizing, not survival.

### Tyrant — 2s
- **Identity**: authority, control, high-stakes decisions. Do NOT make 2s
  themselves stronger (they're already the rank ceiling) — manipulate the
  stakes and consequences surrounding power instead.
- ⛔ *Shelved active (Command)*: manipulate a property of a 2 when played
  (e.g., temporarily change its suit for that play, affecting suit-based
  tiebreaks without raising its rank). Note if it returns: re-suiting any 2
  as hearts makes it the strongest single in the game.
- **Passive** ✅: *a single 2 can beat a straight of 3 up to 5 cards.*
  Clean cross-type interaction; doesn't touch the existing forced-bust
  rule at all (that's about countering a 2, this is a 2 attacking a
  straight). Spending one of only 4 Twos this way is a genuine sacrifice
  since it removes a scarce finishing resource. No open balance concerns
  flagged so far.
- **Risk philosophy**: high risk / high reward. Large starting Worth,
  high ante, large raise capacity, little protection from catastrophic
  loss. "What is the point of power if I refuse to wield it?"
- **Gold relationship**: multiplies & burns — stakes compound fast both
  directions. This is the only class where a single wrong decision can
  realistically end a run most hands.

### Seer — Information (no specific card pool)
- **Identity**: information, prediction, uncertainty, planning.
- ⛔ *Shelved active (Reveal)*: pay a cost to reveal information about an
  opponent's hand (a random card, a count, etc.) before deciding how much
  to risk. The information itself doesn't guarantee the right decision.
  With actives shelved, the Seer's whole identity rests on its passive —
  which makes choosing it the most pressing class decision.
- **Passive**: ❓ **TBD — not yet decided.** Candidates discussed so far:
  - *"Read the Table"* — sees the full public play history (every combo
    played by everyone this hand), rather than just card counts like
    other players' views get. Zero combat power, pure decision quality.
    Cheap to implement since the engine's event log already records this;
    just don't redact it for the Seer's view.
  - *"Foreknowledge"* — sees each opponent's single strongest card, not
    their whole hand. Smaller, punchier version of the above.
  - *"Steady Hand"* — always knows in advance whether passing right now
    would trigger a trick reset, and who'd lead next. Narrower, purely
    about pass/play timing.
  - A stake-related variant is also on the table: the Seer's **Table
    Stake range widens or narrows based on information gathered before
    committing** to a table (see Section 5) — this ties their identity to
    the table-selection decision point, not just mid-hand play.
- **Risk philosophy**: variable risk, controlled through information, not
  inherently safer or higher-reward. "I will not wager my life until I
  know what it is worth."
- **Gold relationship**: delays commitment — pays to convert uncertainty
  into a clearer bet before wagering. Risk = residual, not eliminated;
  their edge is knowing *when not to bet* as much as when to.

---

## 3. Risk philosophy spectrum

```
SECURITY ←—————————————————————→ VOLATILITY
Commoner        Courtier                    Tyrant
                    (Seer operates across the spectrum via information)
```

Classes are not hard-locked to these positions — a Commoner build could
lean greedier, a Tyrant could acquire defensive Medallions, etc. Risk
profile itself is intended to become a deckbuilding axis (via Medallions,
Section 6), not just a fixed class trait.

### What "low risk" and "high risk" actually mean (not just cost scaling)

- **Low risk** = more outs, loss capping (not loss avoidance), and
  recoverability — e.g. Commoner's straight-beats-2 passive is an out, not
  reduced danger; a hard cap on how much a single hand can cost is
  different from "you can't lose."
- **High risk** = irreversible commitment before full information,
  compounding (not flat) payouts, and sacrificing *future* resources, not
  just current gold (e.g. a Tyrant ability that costs next hand's
  starting resources, tying risk across time).

### Safety must have a real opportunity cost ❓ needs balancing pass

Proposal: cap the *ceiling*, not the floor. A cautious build's payouts
have a hard maximum multiplier regardless of hand quality; a volatile
build's payouts are uncapped on the same quality of hand. This is the
mechanism intended to make "different EV/variance profile, comparable
overall viability" actually true rather than aspirational — needs
validation via simulation (the engine's headless CPU-vs-CPU harness is
well suited to running this empirically).

---

## 4. Economic Loop — two nested timescales ✅

A "table" = the run of hands the player plays at one table, from sitting
down to winning it or leaving (see Section 10 — no longer a fixed-length
match). ⛔ Superseded: a table as one existing match, played to a point
total or round count. This produces two separate settlement layers using
the same shape at different scopes:

### Hand-level (micro) ✅
1. Every player pays a fixed **Ante** into a pot at the start of the hand.
2. Players may optionally **Raise** into the same pot during their turn
   (only when playing a combo, never when passing).
   - **Matched ✅**: every other player still holding cards automatically
     puts in the same amount. Nobody folds.
   - ⛔ Superseded: an unmatched raise. Only the raiser paid in, and even
     finishing first returned 56% of the raise — raising lost money every
     time, and handed the rest to the table.
   - 🟡 A raise made after someone has already gone out: the players who
     are out do not match it, so it forms a side pot among those who did,
     split by their finishing order among themselves, with the same curve
     renormalised to the number of contributors (3 → 56/33/11; 2 → 63/37).
   - **CPUs ✅** ante, match and raise by the same rules, from their own
     Worth, with a wagering personality deciding when they raise.
3. Raised/anted gold is **escrowed visually** — moved from a "Bank"
   display to an "At Risk" display. The Bank number does not change again
   until the hand resolves.
4. At hand-end (someone empties their hand), the pot is split by
   placement using percentages derived from the game's existing 5:3:1:0
   scoring ratio: **56% / 33% / 11% / 0%** for 1st–4th.

### All-in ✅ (capped winnings, for now)
A player who cannot cover an ante or a matched raise goes **all-in** with
everything they have. They can win at most what they put in, from each
other player. 🟡 Leaning: poker-style side pots — the main pot is what the
all-in player could cover from everyone; the remainder forms a side pot
among the players who covered it, split by their relative placement with
the curve renormalised as above. An all-in player who finishes 4th and
drops to 0 leaves the table (and, if it is the player, ends the run).

### Table-level (macro) ✅
1. Before the match starts, the player commits a **Table Stake** — see
   Section 5.
2. At table-end, placement at the table (🟡 by Worth when the table ends —
   see Section 10) resolves the Table Stake pot using a
   *sharper* curve than the hand-level one, to make macro stakes feel
   heavier than micro ones: **60% / 27% / 10% / 3%** for 1st–4th (built as 70/25/5/0 — see DESIGN_SPEC 4).
3. This pot is zero-sum by design — gains and losses net out across the
   table rather than gold appearing/disappearing from the system, so
   campaign difficulty comes from decisions and matchups, not attrition.

---

## 5. Table Stake rules ✅

- **Player-chosen, within a class-bounded range, with a hard minimum
  floor.** Confirmed direction.
- **CPUs stake too ✅**, within their own class's range, by personality —
  the pot is only zero-sum if all four seats pay in.
- Illustrative ranges (not finalized — see `DESIGN_SPEC.md` for the
  actual working numbers to build against):
  - Commoner: 10–20% of current Worth
  - Courtier: 20–35%
  - Tyrant: 35–60%
  - Seer: 15–40%, width itself modified by information gathered pre-stake
    (ties into the Seer passive TBD above)
- ❓ Exact minimum floor value not yet set numerically.

---

## 6. Medallions (small modifiers only) ✅ (principle) / 🟡 (examples)

Medallions must modify the *existing* Gold → Ante/Raise → Pot → Outcome
loop — never introduce a parallel currency or subsystem. Tiers: Common
(broad, low-impact), Rare (specific play-pattern), Unique (class-exclusive,
strongly synergistic).

> **Superseded (September 2026):** Medallions became class pools that bend
> the combo rules, with levels — Commoner common and modest, Tyrant rare and
> strong — offered as the spoils of a won table (elite tables: a level up or
> a rarer draw), in the shop, and as loot from beaten computers who carry
> their own deeper down. Class plays now cost gold into the pot. See
> DESIGN_SPEC.md, Section 9. The examples below are kept for the record.

Illustrative examples by risk category (all provisional):
- **Risk reduction**: first loss below 20% of Worth each match is halved.
- **Risk conversion**: a portion of any loss converts into a small
  build-progress resource instead of pure Worth loss.
- **Risk amplification**: wagers cost more but pay out more (pure
  variance dial, not a power dial).
- **Reward amplification**: winning with a specific combo type (Straight,
  Pair-Chain) pays a flat bonus independent of stake size.
- **Loss insurance**: once per run, a loss that would end the run instead
  leaves the player at minimal Worth.
- **Information**: reveal a small piece of opponent info for free before
  a player's first raise each hand.
- **Delayed risk**: a wager's cost is paid at the start of the *next*
  hand instead of immediately.
- **Conditional risk**: wagers cost nothing under a specific in-hand
  condition (e.g., holding very few cards left).
- **Desperation**: below a Worth threshold, one specific ability becomes
  cheaper or stronger — behavioral change, never a stat/power buff.

Example Tyrant Unique: *each raise has a chance to increase the pot by an
additional amount* — modifies the existing loop, introduces no new
resource.

---

## 7. Table variety (no HP-scaling) ✅ (principle) / 🟡 (archetype list)

Tables vary by **who's seated and their current Worth/personality**, not
by bigger numbers on cards or extra rules:

- **Modest Table** — everyone near-average Worth, low mandatory stake floor.
- **High-Stakes Table** — high mandatory stake minimum, wealthy CPUs.
- **Desperation Table** — one or more CPUs critically low on Worth, prone
  to all-in-style raises.
- **Predator's Table** — one CPU unusually wealthy, aggressive raiser.
- **Mirror Table** — all three CPUs share the player's own class.
- **Vestige Table** — the endgame table, see Section 8.

Table *modifiers* (economy only, never a rule change — same constraint as
Medallions), to stack on an archetype 🟡:
- **Chop bounty** — chopping a 2 (a bomb on a 2, *chặt heo*) pays a bounty
  from the chopped player to the chopper. The game's signature moment,
  given a price.
- **High ante / low ante** — the whole table's ante scaled.
- **Jackpot** — an instant-win hand, or a Dragon, takes a bonus from every
  seat.
- **Tight door** — a seat that busts is not refilled for N hands: a
  three-handed table until then.

---

## 8. Vestige Table (endgame) ✅

- **3 Vestige slots + the current run** — a 4-seat table where the player
  faces three CPU versions of their own previously successful runs.
- Each Vestige preserves the identity of its original run — class,
  Medallion loadout, wagering personality — while its raw power is
  normalized (via a tier bucket / starting Worth) so it's recognizable
  but not impossible, per the original design intent.
- **Replacement rule**: if the current run is itself successful (wins),
  whichever seated Vestige is eliminated **first** during that finale
  match is the one replaced — its slot becomes a **Phantom** of the new,
  just-completed run.
  - This is decided by actual gameplay outcome in the finale itself, not
    by a separate composite ranking formula computed afterward.
- ⛔ **Superseded**: an earlier idea reserved one Vestige slot per class
  (guaranteeing variety by construction). The "loses first" replacement
  rule above is simpler and purely performance-based, but does NOT
  guarantee class variety at the table over time — flagged as an open
  trade-off below.

---

## 9. Open Questions Log

- ✅ Resolved: raises are matched (Section 4); CPUs ante, match and stake
  (Sections 4–5); all-in with capped winnings (Section 4); classes are
  passive only for now (Section 2); names are Commoner, Courtier, Tyrant,
  Seer; ability strength is settled by playtest.
- Side-pot details for all-in and for raises after someone is out
  (leaning in Section 4).
- Campaign structure — the whole of Section 10.

- Seer's passive — final pick among the candidates in Section 2, or a
  new option entirely.
- Commoner passive: same-suit-only straight vs. any-suit-but-non-forced.
- Courtier passive: restrict to K/A only, vs. cap to once per hand.
- Exact Table Stake minimum floor value (numeric).
- Whether to reintroduce a partial-commit decision for Worth at
  table-start (echo of the superseded Vault idea) as an explicit optional
  choice, rather than always committing the full current Worth as the
  implicit stake ceiling.
- Vestige Table variety: is losing the per-class-slot guarantee (Section
  8) an acceptable trade-off for the simpler "loses first" rule, or
  should some hybrid be explored (e.g., loses-first among same-class
  Vestiges only)?
- Safety-ceiling-cap mechanism (Section 3) needs an actual balancing pass,
  ideally via simulated runs, before locking numbers.
- CPU replacement bank scaling at ordinary (non-Vestige) tables when a
  CPU is eliminated mid-table — should the replacement match the current
  second-highest Worth at the table, to avoid free farming of weak
  replacements?

---

## 10. Campaign structure — a ladder of tables 🟡

> **Built for playtesting**: 10.1 with win rule A (Showdown) plus last call,
> and 10.3's ladder with the shop, strongbox and rumour. Not built yet: the
> CPU race, the in-table choices of 10.2, the pawnbroker and the private
> game. The numbers chosen are in `DESIGN_SPEC.md` Section 9.

**Confirmed direction ✅**: a run is a climb through tables of rising
difficulty, ending at the Vestige Table. At each table the player must
survive and build Worth to a threshold, which earns the right to win the
table and move up. Between tables, choices with real consequences: a
harder table for more reward, a safer one, a shop. Everything below is the
brainstorm for how.

### What makes this Big Two and not a generic deckbuilder

Most roguelikes are a string of fights against one enemy. A Big Two table
is four people at once, everyone playing everyone, and the cards that
matter are shared knowledge — who has passed, how many cards each seat
holds, whether the 2s are gone. So the campaign's unit is the **table**,
not the battle, and the design leans on things only a four-seat shedding
game has:

- **Placement, not victory.** Every hand ranks all four seats, and the pot
  pays by rank. Coming second is income; coming last is a cost. A table is
  a long game of staying out of last.
- **Loser leaves.** A seat that hits 0 Worth gets up, and someone new sits
  down. The table's cast changes while you play at it.
- **Turn order is a position.** The seat after you has to beat what you
  play; the seat before you decides what you face. Who sits where matters.
- **The chop (*chặt heo*).** A bomb on a 2 is the game's defining swing,
  and it can be priced (chop bounty, Section 7).
- **The blind pile pick** (ruleset 9.13) is a decision point before every
  hand that already exists.

### 10.1 One table, start to finish 🟡

1. **Sit down.** Pay the Table Stake (the buy-in). The three CPUs pay
   theirs. Each seat's class, Worth and wagering personality are visible.
2. **Play hands.** Ante, raises, split — Section 4. Seats that bust leave
   and are replaced from the **rail** (10.2).
3. **Reach the Mark.** Each table has a Worth threshold, the **Mark** (for
   example a fixed number per tier, or a multiple of your Worth when you
   sat down). Below it you can only survive and build; at or above it you
   may try to win the table.
4. **Win the table.** Candidate rules, not exclusive:
   - **A. Call the Showdown** (leaning). Once over the Mark, you may declare
     a Showdown before any hand. That hand's ante is multiplied for
     everyone (×3, say) and nobody can refuse. Finish 1st and you win the
     table: the Table Stake settles with you in first, and you move on. Miss
     and you stay seated, poorer, possibly back under the Mark. The choice
     is *when*: call it the moment you arrive, or grind further above the
     Mark for a cushion while the rail brings in richer players.
   - **B. Clear the table.** Bust all three original CPUs. Rare; a large
     bonus (a Unique Medallion, a better choice of next table) rather than
     the normal way through.
   - **C. Chip lead at last call.** See below.
5. **Last call.** A table has a hand limit (10–15). When it arrives, one
   final forced Showdown is played for everyone. This stops endless safe
   grinding and gives every table a clock you can watch run down.
   🟡 If you still have not won: the table closes, the Table Stake settles
   by Worth standing, and you move sideways, not up (another table in the
   same tier) — a setback, not a death.
   **Built:** the limit grows with the descent — 5 / 7 / 9 / 11 hands by
   room — so the first tables are short and easy and the deep ones long.

**CPUs race too** (idea): a CPU that reaches the Mark can call a Showdown
as well. If it wins, the table breaks up — stake settled by standing — and
you are back at the same tier's choice. The Mark stops being a private
finish line and becomes a race you can watch the others run.

### 10.2 Decisions inside a table 🟡

Between hands, now and then rather than every hand (so a table does not
turn into a menu):

- **Change seats** (costs Worth). Sit after the aggressive raiser, so your
  plays are what they have to beat, or before the weakest seat. Turn order
  is a real edge in Big Two, and this is a choice only a four-seat game can
  offer.
- **Watch the rail.** The next two players waiting for a seat are shown. A
  seat about to bust brings one of them in — do you finish off the weak
  player now and let the rich newcomer sit, or keep them alive to farm?
- **Pick order** (at some tables). Pay to choose your pile first in the
  blind pick.
- **Cash out early**, before the Mark: leave with your Worth and forfeit
  the Table Stake. A way out of a table that has turned against you, at a
  price.

### 10.3 Between tables — the ladder 🟡

A small branching tree, in the manner of Slay the Spire's map, with tables
as the fights:

```
Tier 1  (Back room)     [Modest]   [Predator's]
                              \      /
Intermission            [Shop] or [Strongbox] or [Rumour]
                              /      \
Tier 2  (Parlour)      [High-Stakes] [Desperation] [Mirror]
                              ...
Tier 3  (Salon)
                              |
Finale                   Vestige Table
```

- **Each tier offers 2–3 tables** from the archetypes in Section 7, each
  shown with its seated CPUs (class, Worth, personality), its modifiers,
  its Mark and its reward. The harder table has the higher Mark and the
  richer stake pot, and usually a better reward.
- **Intermission nodes**, one taken per gap:
  - **Shop** — Medallions, paid for in Worth (the one resource), so every
    purchase lowers your life and your wagering power.
  - **Strongbox** — lock part of your Worth away for the next table: it
    cannot be lost there, and cannot be staked or raised with either. The
    superseded Vault idea (Section 1), returned as an explicit choice.
  - **Rumour** — see the next tier's tables in full (lineups, modifiers)
    before choosing, instead of only their archetype.

  - **Pawnbroker** — sell a Medallion back for Worth.
  - **Private game** — a short side game for a flat wager. (Needs a two-
    or three-seat variant of the engine; flagged, not assumed.)

> **Built differently (September 2026):** the intermission is gone. The run
> is a descending map of twelve nodes (DESIGN_SPEC 9, The map); the shop is
> a node of its own, the Bone Merchant; the strongbox and the rumour were
> removed, and who sits at a table is seen on the map before choosing it.

- **Run length**: 3 tiers + the Vestige Table is about 4 tables. At 8–12
  hands a table and 2–3 minutes a hand, a run is roughly 1–2 hours. To be
  calibrated by playtest; a shorter "quick run" of 2 tiers may be worth
  having.

### 10.4 Open questions for the structure

- How the Mark is set: fixed per tier, or relative to your Worth when you
  sat down.
- Which win rule (A, B, C, or a mix), the Showdown multiplier, and whether
  a failed Showdown costs anything beyond the pot.
- Last call length, and what not winning by then costs.
- Whether CPUs can call Showdowns (the race), and what a CPU win does to
  your run.
- Seat-change and pick-order prices.
- Rail replacement Worth (merges with the CPU-replacement question in
  Section 9).
- Tiers per run, tables per tier, and which intermission nodes exist at
  launch.
