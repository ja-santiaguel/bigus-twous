# Big Two Campaign — Design Spec (Locked)

**Purpose of this document**: this contains ONLY confirmed, buildable
design decisions. If something isn't here, it isn't locked yet — check
`BRAINSTORM.md` for exploratory context, open questions, and superseded
alternatives. When an idea graduates from brainstorm to confirmed, move it
here and remove ambiguity/hedging language.

This is the document to hand to an implementation session (e.g. Claude
Code working in the actual project repo).

**Scope**: the campaign is a separate, single-player mode layered on top of
the base game. The base game — the default ruleset (architecture proposal,
Section 9), solo play and multiplayer — is unchanged by anything here.
Campaign rules apply only inside the campaign, and only to the seats they
are attached to. The campaign does not tie into multiplayer (yet).

**Terms**: a **hand** is one deal played out (the engine's *round*). A
**table** is the sequence of hands the player plays at one table in the
campaign (see Section 8 for how a table starts and ends).

---

## 1. Core Resource

**Gold / Worth** is the single resource in the game. It represents wealth,
life, and wagering power simultaneously. No secondary resources exist
(no mana, energy, favor, insight, etc.).

- Worth persists continuously across an entire campaign run — it is not
  reset per table.
- Reaching 0 Worth ends the run (permadeath).
- A successfully completed run is eligible to be recorded as a Vestige
  (Section 7).
- **CPUs have Worth too**, and play by the same economy as the player: they
  pay the ante, match raises, and commit a Table Stake.

## 2. Hand-level economy

Applies within every individual hand of a table:

1. Every player pays a fixed **Ante** into a pot at hand start.
2. A player may **Raise** during their turn, only when playing a combo
   (never when passing).
3. **Raises are matched.** When a player raises, every other player still
   holding cards in that hand automatically puts the same amount into the
   pot. Nobody folds; a raise is a bet on your own hand against the table.
4. Anted, raised and matched gold is escrowed visually (moved to an "At
   Risk" display) and not deducted from the player's displayed Bank until
   the hand resolves.
5. At hand-end, the pot is split by placement:
   - 1st: 56%
   - 2nd: 33%
   - 3rd: 11%
   - 4th: 0%
   (Derived from the game's existing 5:3:1:0 scoring ratio, expressed as
   percentages of pot size so it works for any pot total.)

## 3. All-in

A player who cannot cover an ante or a matched raise puts in everything
they have and is **all-in**. Their winnings are capped: they can win at
most what they put in, from each other player. Gold above that cap is
settled among the players who covered it. (Implementation detail — how the
uncovered part is split — is in `BRAINSTORM.md` Section 4, leaning on
poker-style side pots.)

## 4. Table-level economy

Applies once per table:

1. When a table starts, every player pays its **buy-in** (the Table
   Stake).
2. **The buy-in is a set amount per table**, the same for every seat, and
   depends on the table's risk and reward — shown before the table is
   chosen. (Changed 2026-09-21 from a player-chosen, class-bounded range.)
3. At table-end, placement at the table resolves the Table Stake pot:
   - 1st: 70%
   - 2nd: 25%
   - 3rd: 5%
   - 4th: nothing
   (Changed 2026-09-21 from 60/27/10/3: last place at a table should come
   away with nothing.)
4. This pot is zero-sum — no gold is created or destroyed by this
   mechanic, only redistributed among the table's players.

## 5. Four classes — passive only

**For now, every class is defined by one passive and a risk philosophy.
There are no activated abilities.** The earlier active mechanics
(Transform, Duplicate, Command, Reveal) are shelved — see `BRAINSTORM.md`
Section 2. Passive strength is tuned by playtesting as we go.

### Tyrant — 2s
- **Passive (confirmed)**: a single 2 can beat a straight of 3 up to 5
  cards.
- Risk philosophy: high risk / high reward. Largest starting Worth, ante,
  and raise capacity of the four classes; least loss protection.

### Commoner — 3–10
- Passive: not finalized (see `BRAINSTORM.md` Section 2 for candidates).
- Risk philosophy: low risk / low-to-moderate, incremental reward.
  Smallest starting Worth, ante, and raise capacity; best loss
  preservation.

### Courtier — J–A
- Passive: not finalized (see `BRAINSTORM.md` Section 2 for candidates).
- Risk philosophy: moderate risk, strong conversion of favorable
  opportunities into higher payouts.

### Seer — no specific card pool
- Passive: **TBD**, not yet decided at all.
- Risk philosophy: variable risk, controlled through information rather
  than inherent safety or reward.

## 6. Medallions

Design constraint (locked): Medallions must only modify the existing
Gold → Ante/Raise → Pot → Outcome loop. They must never introduce a new
currency or parallel subsystem. Tiers: Common, Rare, Unique
(class-exclusive).

**Revised direction (September 2026):** Medallions are now class-specific
and bend the combo rules — what may beat what, and what a class play costs —
rather than the money. The build is the point: "how do I beat the odds with
my choices", not "how do I get more gold". They still add no currency or
subsystem. See Section 9 for the set in the code.

## 7. Vestige Table (endgame)

- The last table of a run.
- 3 Vestige slots + the current run = a 4-seat finale table.
- Each Vestige is a CPU representation of a previously successfully
  completed run, preserving that run's class, Medallion loadout, and
  wagering personality, with its raw power normalized (not its identity).
- **Replacement rule**: if the current run succeeds (wins the finale),
  whichever seated Vestige is eliminated first during that match has its
  slot replaced by a Phantom of the new run.

## 8. Campaign structure (confirmed direction)

- A run is a **ladder of tables of rising difficulty**, ending at the
  Vestige Table — not a sequence of one-off battles.
- At each table the player must **survive** (stay above 0 Worth) and
  **accumulate Worth up to the table's threshold**. Reaching the threshold
  earns the right to **win the table**, which advances the player to the
  next, harder table.
- Between tables the player makes decisions with real impact on the run
  (a harder route for more reward or a safer one, a shop, and so on), in
  the manner of a roguelike campaign tree.

The exact win condition, threshold values and the shape of the tree are
not locked — see `BRAINSTORM.md` Section 10.

## 9. Playtest defaults (built, provisional)

These are the answers chosen for the open questions so the campaign could be
built and played. They are **in the code now** (`packages/campaign`), but they
are defaults for playtesting, not locked decisions — each is meant to be
changed freely once it has been played.

### Scope for the first playtest
- **The Seer is left out.** Commoner, Courtier and Tyrant only.
- The base game — solo, with friends, How to play — is unchanged.

### Passives
- All three are one mechanism: an extra beat on top of the base rules. They
  never apply to the opening play, to a lead, or when a forced bust (9.5) is
  in force.
- **A class play costs gold, paid into the hand's pot** — where the table can
  win it back: Commoner half an ante (a coin to the crowd), Courtier three
  quarters (a bribe to the court), Tyrant one and a half (a blood price: its chance comes
  most often and a 2 is the strongest card). Always the seat's own ante, rounded up. A seat that
  cannot pay from what it has not already put into the hand is not offered
  the play. Medallions can bring the price down.
- **Tyrant**: a single 2 beats a straight of 3–5 cards (as locked).
- **Commoner**: a straight of 5 or more beats a single 2, any suits. It is not
  a bomb, so it is never forced.
- **Courtier**: a Jack, Queen, King or Ace beats a higher single of **its own
  suit**, never a 2 — precedence at court goes by house, not by rank. The
  only class play that ignores rank, where the others let one kind of play
  beat another. (It was a court pair over a triple of 10s or lower; triples
  are so rarely on the pile that it came up 0.07 times a hand. That beat is
  now the Precedence Medallion.)
- After a passive beat, the new combo is the pile and the trick continues
  under the base rules.
- Each passive has a name, said at the table when it is used: **Decree**
  (Tyrant), **Uprising** (Commoner), **Allegiance** (Courtier). The Tyrant's and
  Wanderer's are also the first Medallion in their class's pool, so the
  passive itself can be levelled; the Courtier's first Medallion,
  **Precedence**, adds a second beat instead (a court pair over a common
  triple).

### Raising — set aside for now
Raising (Section 2) is taken out of play while the basic loop — buy in, ante,
play, settle, descend — is solidified; it will be revisited (call-or-fold is one
option, not built). The matched-raise maths stays in `packages/campaign`,
tested and unused.

### Winning a table
- **The descent**: the first rooms are short and gentle, the deeper ones long
  and cruel. Each room sets how many hands a table lasts, how many you must
  play before calling a Showdown, and the Mark (below). Gold is kept low
  everywhere — yours and the computers' — so going broke is always near.
- **The Mark** is a gain measured in your own antes over your Worth when you
  sat down: 3 / 3 / 4 / 5 / 6 by room, adjusted a little by the table type. A
  gain rather than a fixed figure, so every table asks for a comparable
  climb and arriving rich does not arrive past it.
- **Showdown**: once you have played the room's wait (2 hands in the first
  three rooms, 3 below) and are at or above the Mark, you may call one before a
  hand. Everyone antes three times. Finish first and you win the table;
  otherwise you stay seated.
- **The last hand**: a table lasts 5 / 6 / 7 / 9 / 11 hands by room, and the
  last is a forced Showdown. Not winning it **loses the table**: the table
  prize settles by gold standing, you get no spoils, and you go on down the
  map anyway. The map never sends you back. The one exception is the Hollow
  Throne: lose it and the run is over.

### One payout (2026-09-22)
The hand pot and the table prize pay the same way: **70% to first, 25% to
second, 5% to third, nothing to last** (they were 5:3:1:0 and 70/25/5/0).
One ratio to learn; last place always loses everything it put in. At the
table the two are shown together — the pot, and the prize beside it — and
their note says what first place takes of each right now.

### How a table is won (2026-09-22)
- **Come to the last hand holding the tribute, and the table is yours** —
  before that hand is dealt. Or **finish first in a Showdown**: called early
  once you hold the tribute, or forced as the last hand for everyone who does
  not. Playing a table well wins it; the Showdown is the gamble to win it
  sooner, or to steal it from behind. (It was: only a Showdown won a table,
  so the last hand's three antes decided nearly every table.)
- **The tribute is the gold you must win at the table**, shown as "30 of 70":
  2 / 2 / 3 / 3 / 4 antes by depth, counted halfway between the table's ante
  and your own. Counted in your ante alone, the small-ante Wanderer found it
  cheap; in the table's alone, the big-ante Tyrant did.

### Reckoning and Requiem (2026-09-23)
The Showdown is two things now.
- **Reckoning** — called by you, once a table, once you hold the tribute and
  before the last hand. The others ante three times; you ante once and play
  for the **whole pot**, paid 70/25/5/0 of everything in it rather than
  layered by what you put in. Finish first and the table is yours, with a
  **bounty of one table ante for each hand left unplayed**, so winning fast is
  worth as much as grinding. Fail and the table goes on; the tribute still wins
  it at the last hand. (A version where failing cancelled the tribute's win
  cost runs — calling became a trap — so a Reckoning is a reward for earning
  the tribute early, not a gamble against it.)
- **Requiem** — the table's last hand: everyone antes three times, first place
  wins the table. Holding the tribute still wins before it is dealt.

### The fallen (2026-09-23)
- A player who runs out of gold has **fallen**: out of the table for good.
  **No one takes their chair.** The rest play on three-handed (or two), each
  still dealt thirteen cards: only the seats still in pick from the four piles,
  and a fallen seat's pile is set aside unplayed, dimmed at the pick under
  their struck-through name. If the 3 of Spades is among the set-aside cards,
  whoever holds the lowest card in play opens with it instead (an engine
  change: `createNewRound` takes each player's seat, and opens with the lowest
  card in play when not every card is dealt; a full deal is unchanged). If
  everyone else falls, the table is yours.
- At the table a fallen seat is a gravestone where the fan was, the name
  struck through, "Fallen" and an empty purse.
- Computers now bring gold counted in the table's antes — their buy-in and a
  cushion of **six of their own antes** for each whole of a class's starting
  gold their draw is worth — rather than a share of a class's starting gold, so
  deep tables no longer ruin them with prices alone. About one falls a run.

### ? events (2026-09-23)
One to four ? nodes a map, below the opening rows, never one under another.
Each is a short scene with one decision, drawn from those not met yet this run:
- **The Ferryman's Wager** (risk): stake two of your antes; he turns a card and
  you call the next higher or lower (Big Two order). Each right call doubles
  the stake, three at most; take it whenever you like; a wrong call loses it.
- **The Drowned Reliquary** (profit): three coffers, light, weighty and heavy.
  Open one: the lighter, the likelier a Medallion (70 / 40 / 10%); otherwise
  1 / 3 / 5 table antes of gold. The others are shown after.
- **The Tithe-Taker** (a loss to lessen): he asks a quarter of your gold.
  Haggle — 70 / 55 / 40 / 25 / 15% that he comes down 5 points; a failed
  haggle puts him up 10 and ends the bargaining — or give him a Medallion.

### Map rules (2026-09-23)
The first two rows are ordinary tables only; the two lanes are joined by
**one or two bridges**; no lane holds more elites than ordinary tables; and no
way down runs straight. Merchants: one on every way down in the lower half
(rows 5–7), and **one more in the upper half, on one of the two lanes** (rows
3–4), an early chance to shop for whoever goes that way — on either lane,
even just above the lower merchant, since both lanes meet one below anyway.
**Depth is counted by node** on screen: "Depth 3 of 9", the throne the ninth.
The five stakes (antes, tributes, hands) still go two rows to each. The elite every way
down must meet stands at the **third depth or deeper** (row 5 on); optional
elites in sub-lanes may come sooner.

### The second depth (2026-09-23)
A quarter of runs ended at the second depth: the ante jumped from 40 to 70,
and the guaranteed elite could stand there. The antes are now **40 / 60 / 100
/ 180 / 320**, and the guaranteed elite starts at the third depth. Deaths now
rise with depth instead of spiking at the second (a Wanderer's 300 runs: 12 /
40 / 63 / 81 / 104 by depth), and runs won are 18% / 17% / 19% by class.
Merchant visits rose from 0.6 to 1.1 a run; Medallion levels held at the end
from 3.5 to about 4. To watch: the Tyrant now ends at the first depth in 11%
of runs (was 5%).

### The Tithe-Taker's cap (2026-09-23)
His cut is a quarter of your gold **or three of your antes, whichever is
less**, the cap moving with his rate. Uncapped, a rich run lost up to 1,800
gold to him; now at most about 600, about 140 on average.

### Playtest after these changes (2026-09-23)
300 runs a class, the harness calling a Reckoning whenever it may with three
hands to spare: runs won **17% / 18% / 17%** (Wanderer / Courtier / Tyrant),
about one Reckoning a run won a quarter to a third of the time, and about one
fallen player a run. The Tyrant starts with **420** gold (was 460): without the
cut it won 22%.

### Playtest audit (2026-09-22)
A harness plays whole runs card by card (`packages/campaign/src/dev/playtest.ts`):
the engine deals, the heuristic AI plays every seat — the player's at hard, a
competent player — and the campaign's turn options are in force, so class
plays are offered, chosen and paid for as at a real table. 300 runs a class.

| | Wanderer | Courtier | Tyrant |
|---|---|---|---|
| Runs won | 16% | 16% | 15% |
| Tables won / lost a run | 2.3 / 3.1 | 2.1 / 3.2 | 2.4 / 2.8 |
| Elite tables won a run | 0.34 | 0.32 | 0.42 |
| Class plays a hand | 0.15 | 0.22 | 0.25 |
| Gold spent on class plays a run | ~100 | ~250 | ~2,000 |
| Runs dying in the first depth | 5% | 4% | 5% |

What it found, and what changed:
- **Losing felt like the default.** Before, a run won ~1.5 tables and lost
  ~3.4: only a Showdown won a table. The tribute rule above lifted wins to
  ~2.3 a run, and runs won from ~13% to ~15%.
- **The Courtier barely played its class.** Its play needed a triple of 10s
  or lower on the table: 0.06 plays a hand, and no rewording of it did
  better (a court pair over any lower triple: 0.08). Its one class play is
  now **Allegiance**, **a court card over a higher single of its own suit**, 2s excepted:
  0.22 a hand, 16% of runs won over 400 runs. The court pair became its
  Medallion. (A second clause, a court pair over a straight of three, was
  dropped: it echoed the Tyrant's 2 over a straight.) It costs **0.75 of an ante** (was
  1) and starts with **440** gold (was 400).
- **The profiles were backwards.** The Wanderer ("hard to break") died
  earliest; the Tyrant ("falls hardest") was safest early. The Wanderer now
  starts with **360** (was 300) and the Tyrant **460** (was 500).
- **Gold snowballed late.** Deeper antes are steeper: 40 / 70 / **120 /
  200 / 320**.
- **Each class outshines the others its own way**: the Wanderer reaches the
  throne most often on the cheapest plays; the Courtier makes the most of a
  modest price; the Tyrant wins the most tables and elites, and pays by far
  the most for it.
- **Still to watch**: a competent AI wins ~15% of runs. A person who times
  Showdowns and reads the table should do better; if playtests show people
  far above 30%, the tribute is the first number to raise.

### Gold is health (the loop, 2026-09-21)
- **A hand is the unit of damage.** Last place in an ordinary hand costs one
  ante — about a tenth of a starting purse in the first room — and a
  Showdown costs three. First place gains a little more than one. No single
  hand ends a run; a bad table hurts; a string of lost hands does kill.
- **A table is an encounter.** Its clock is its hands (a short one at the
  top, a siege at the bottom). Winning it — first in a Showdown — pays 70%
  of the table prize and the spoils (a Medallion). Losing it costs your
  buy-in, less whatever share of the prize your gold standing earns, and
  gives nothing else. Either way, you go down.
- **The run is lost only when you are broke** (or lose the throne). Gold is
  never a gate on the map: any gold buys a seat, if only a short one.
- **A short seat.** If you cannot cover a table's buy-in, you sit anyway:
  you put in all but three of your antes, and keep those three to play with.
  The table prize is layered like any pot, so a short seat can win back at
  most its own share of what it paid in — the same rule a computer that
  cannot cover the buy-in plays by. A run is never soft-locked on the map;
  it ends when the gold does.
- Leaving a table mid-hand, or reloading, counts as finishing that hand last.

### Pots
- All-in and raises after someone is out use poker-style side pots: each
  layer is shared only by the seats that paid all of it, by their order,
  with the curve cut to that many seats and renormalised (5:3:1 of 9, 5:3 of
  8). Whole coins; a layer's remainder goes to its best-placed seat.
- Stake pot standing at table end: the Showdown winner first, then seats by
  Worth, then players who went broke (they share nothing).
- A computer that goes broke leaves; the next in line sits down and pays its
  own stake into the pot.

### Numbers
| | Commoner | Courtier | Tyrant |
|---|---|---|---|
| Starting Worth | 360 | 440 | 460 |
| Ante multiplier | ×0.75 | ×1 | ×1.5 |
| Raise sizes (antes) | 1 | 1, 2 | 1, 2, 3 |
| Raises per hand | 2 | 2 | 3 |

| Tier | Ante | Mark (antes) | Hands | Showdown after | Computers play | Computer Worth (× class start) | Computer Medallions |
|---|---|---|---|---|---|---|---|
| The Lychgate | 40 | 2 | 5 | 2 | medium | 0.7–1.1 | none |
| The Ossuary | 60 | 2 | 6 | 2 | medium | 0.9–1.3 | 30% carry one, level I |
| The Drowned Chapel | 100 | 3 | 7 | 2 | hard | 1.1–1.6 | 50% carry one, level I |
| The Sunken Crypt | 180 | 3 | 9 | 3 | hard | 1.3–2.0 | 75% carry up to two, up to level II |
| The Hollow Throne | 320 | 4 | 11 | 3 | hard | 1.6–2.2 (normalised) | house legends always carry up to two; Vestiges keep their own |

A simulation of a player who finishes in a random place every hand (no
skill, first table node, Showdown as soon as allowed; 500 runs a class)
wins 17–20% of runs and about 1.5 tables a run. Its deaths spread across
every room, and about half its runs reach the throne, where most of them
end. Skill is what should raise that rate. It is the number to watch in
playtesting.

At an elite table a computer is likelier to carry Medallions (+35%) and may
carry one more. Their Medallions work for them exactly as yours do — their
class plays, their prices, Unbowed on their 2s.

- Buy-in, in the room's antes: Paupers' 2, Starving 2.5, Mirror 2.5, Carrion
  3.5, Gilded 4.5, the Hollow Throne 3 (the same gold as before the antes
  were doubled). Everyone pays the same; a computer that cannot cover it
  puts in all but a coin, and you sit short (above).
- Table types (code name in brackets): **Paupers'** (modest), **Starving**
  (desperation), **Mirror**, **Carrion** (predator), **Gilded**
  (high-stakes). **Gilded and Carrion are elite**: harder, and winning one
  always offers **a choice of two Medallions** — a beaten player's, or a level
  up for one you carry, or a rare draw; and a draw that leans rare. The others
  give **a 50% chance of one Medallion** — a beaten player's if your class can
  carry it, else a draw — and say so when there is none. (Until 2026-09-23 every
  won table offered two or three; the map now promises only what is true.) The
  Hollow Throne ends the run and offers none. With fewer Medallions a run ends
  holding about 3 levels (was 4); runs won held at 17% / 19% / 16%.
- Computers have a temperament — cautious, steady or reckless — that sets
  where they stake in their range and how often and how high they raise.
- No campaign table uses the base game's easy computer: it always plays its
  smallest combo, so it only ever leads singles. The Lychgate is easier by
  its stakes and its players' gold, not by playing badly.

### Words on screen
The **Commoner** is shown as the **Wanderer** (renamed 2026-09-21 so it does
not read as the lesser class; the code keeps `commoner`). The spec's terms are for design; the screens use plain ones. The **Mark** is
the table's **tribute**, shown as gold to win at the table (it was "target"; "Win 90 gold here to call a Showdown"); the **Table
Stake** is the **buy-in**; **last call** is "the last hand", always a
Showdown. The run is a **descent**: the first room is the top. The shop is
**the Bone Merchant**; the finale is **the Hollow Throne**.

### The map
- A run is a map of **eight rows of encounters, then the Hollow Throne**,
  drawn from the run's seed and laid out as Slay the Spire lays out an act:
  **two primary lanes** from the gate to the throne. Now and then a lane
  splits into a **sub-lane** — two nodes side by side, a choice of encounter —
  and joins again below; now and then a path crosses from one lane to the
  other. Paths never cross each other, and **no way down runs straight**: as
  in Slay the Spire, a choice comes at least every other step — a node reached
  by a single way offers two — until every way converges on the throne. Links
  are drawn row by row from every layout that obeys these rules, weighted
  toward staying in lane and toward one way down, so branches read as choices
  rather than a web. Two rows to each depth, so the five
  depths keep their stakes, and a run meets about eight tables before the
  throne. The world is **the Hollow Deep**; depths are numbered on screen,
  their names (the Lychgate and the rest) kept for acts.
- **Every way down meets at least one Bone Merchant and at least one elite
  table**: each is placed on both lanes on a row where neither lane splits
  (a merchant at rows 3–5, an elite at rows 5–7, never adjacent), so no path
  can go round them. Sub-lanes may hold extra elites (20–45% by depth) and
  merchants (10–15%) as optional encounters. The first row is only ordinary
  tables; a merchant never leads to a merchant.
- Every table you could go to next is dealt on arrival at the map, so its
  buy-in and who sits there are known before you choose. Selecting a node
  shows it; its button (Pay 80 and sit down) commits.
- **Every map holds at least one merchant and one elite table** — about 1.2
  of each on average. A map that rolls neither is drawn again from the same
  seed. After a table won come **the spoils** —
  its Medallion offers, taking one or none — then the map again, one row
  down.
- The strongbox and the rumour are gone: who sits at a table is seen on the
  map instead.
- Until you have Vestiges, the throne seats three house legends.

### Medallions (class pools, provisional)
Each class draws from its own pool, and from a few any class can carry. Each Medallion has levels; taking
one you hold raises it a level. Rarity sets how often it is offered:
the Commoner's pool is common and modest, the Courtier's between, the
Tyrant's rare and strong.

| Class | Medallion | Rarity | Level I | Level II |
|---|---|---|---|---|
| Commoner | Uprising | common | a straight of **4** beats a single 2 | a straight of 6+ also beats a pair of 2s |
| Commoner | Rabble | common | a triple of 3–10 beats a pair of J–A | — |
| Commoner | Frugal | common | class plays cost half | class plays are free |
| Commoner | Low Road | common | ante share ×**0.65** (smaller hands, smaller wins) | ×**0.55** |
| Commoner | Beggar's Cup | rare | finish a hand **third** and your ante is paid back | — |
| Courtier | Precedence | common | a court pair beats a triple up to **10** | … up to **Q** |
| Courtier | Patronage | common | class plays cost half | class plays are free |
| Courtier | Royal Pair | rare | a pair of Aces beats any triple below 2s | — |
| Courtier | Intrigue | rare | a pair of K or A beats a chain of three pairs | — |
| Tyrant | Decree | rare | a single 2 beats a straight of up to **7** | … any straight |
| Tyrant | Blood Rite | rare | class plays cost 1 ante | half an ante |
| Tyrant | Iron Crown | legendary | a pair of 2s beats any straight | — |
| Tyrant | Unbowed | legendary | a single 2 you play cannot be chopped by four of a kind | — |

Any class — rare, one level, about gold rather than cards, and offered at
0.4 of a class Medallion's weight so they stay a find:

| Medallion | Effect |
|---|---|
| Ferryman's Coin | your Showdown ante is two antes, not three |
| Tithe | finish a hand first and every other seat pays you one of its antes |
| Iron Stomach | the first time at each table you finish last, half of what you put in comes back |
| Last Rites | once a run, a hand that would leave you with nothing leaves you three antes |
| Hoard | buy-ins cost you one ante less |

- Offer weights: ordinary draws common 10 / rare 3 / legendary 0.5; elite
  draws 4 / 5 / 2.
- **Loot**: a won table also offers the strongest Medallion you can carry
  that a player you beat there carried, at their level, if you do not already
  hold it that high.
- Merchant prices: common 60, rare 110, legendary 180, 35% more for each room
  down.
- Medallions are held by seats, so a Vestige's work for it too; a saved
  Vestige from before the class pools keeps only what still exists.

### Not built yet
Computers calling Showdowns (the race), changing seats, watching the rail,
paying for pick order, cashing out early, table modifiers (chop bounty,
jackpot), the pawnbroker and the private game.

---

## Explicitly NOT yet locked (do not implement as final)

- Seer's passive
- Commoner's and Courtier's passives (candidates exist, not chosen)
- Buy-in amounts per table type (defaults built — Section 9)
- How the uncovered part of an all-in pot is split (side-pot details)
- Concrete Medallion effects (examples exist, none finalized)
- Whether the Vestige Table guarantees class variety over time or purely
  follows the "loses first" rule as-is
- How a table is won once the threshold is reached, threshold values, the
  number of tables in a run, and the campaign tree's node types (defaults
  are built — Section 9 — but none is locked)
