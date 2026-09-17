# Big Two — design system

The working reference for how this game looks and behaves. Update it in the
same change as anything it describes; a rule that only lives in someone's head
is a rule the next screen will break.

Tokens live in `packages/app/src/styles.css` (`:root`). Card sizes live in
`packages/app/src/design/cardScale.ts`; pixel art in `design/pixel.ts` and
`design/icons.ts`. When this file and the code disagree, fix whichever is wrong
— and say which in the commit.

---

## 1. Principles

- **A table seen from directly above.** The felt never tilts. All depth comes
  from the cards and controls themselves: lift, shadow, fan rotation.
- **Pixel discipline.** Art is authored on an integer grid and drawn with crisp
  edges. `--px` is one art pixel; sizes, gaps, borders and shadows are whole
  multiples of it. Only something in motion may land off the grid.
- **Square corners.** No border radius anywhere. The art is square; so are the
  controls.
- **One card, one node.** A card is the same DOM element for as long as it is on
  screen, so moving between zones is a transform, never a teardown.
- **Nothing reflows.** Text that appears, a clock that ticks, a label that
  changes must never move its neighbours. Reserve space, or place out of flow.
- **Quiet until it matters, never hidden.** Information is always available;
  only its volume changes with urgency.
- **Nothing is selectable by dragging** except text you type into. Nothing
  shows a selection or a focus ring on click unless you can type in it.
- **Colour is never the only signal.** Every state is also said in words, shape
  or position.

## 2. Colour

| Token | Value | Use |
|---|---|---|
| `--table` | `#2b3a36` | The felt. |
| `--table-lo` | `#24312e` | Panels, subdued raised buttons. |
| `--table-hi` | `#35443f` | Default raised button surface, outlines, dividers. |
| `--field` | `#1e2825` | Input surfaces — darker than any panel they sit on. |
| `--ink` | `#1b1f24` | Borders of raised things, and the colour every shadow is cast in. |
| `--bone` | `#e4dccb` | Primary text, card faces. |
| `--bone-dim` | `#c9c0ae` | Secondary text. |
| `--dim` | `#95a39e` | Tertiary text, flat control text, disabled flat controls. |
| `--edge` | `#6a8a80` | The outline of an editable field — 3:1 against the table. |
| `--gold` | `#d9a441` | **Your move**, the primary action, the standing combo, selection. |
| `--gold-hi` | `#e6b457` | Primary button hover. |
| `--on-gold` | `#241905` | Text on a gold surface. |
| `--alert` | `#e0665c` | Every "no": a selection that cannot play, a refused play, a seat that has **passed** (yours included), urgent time. |
| `--pass` / `--pass-hi` | `#91352f` / `#9b3a34` | The Pass button — the passed colour, deep enough for bone text. |
| `--silver` / `--bronze` | `#b9c2c6` / `#cc9660` | Second and third place. |

**Contrast is a rule, not a check at the end.** Every text colour meets WCAG AA
— 4.5:1 — on `--table`, `--table-lo` and `--field`; the outline of anything
you type into meets 3:1. A new colour, or an existing one on a new surface, is
measured before it ships.

One deliberate exception: `--alert` is a deep red, because a pale one read as
pink rather than as "no". It holds **3:1** on every surface, and it only ever
colours words that already say what is wrong ("passed", "can't play that"), so
the colour is never the only cue.
| `--suit-red` | `#b3322b` | Hearts and diamonds. |
| `--back` / `--back-hi` | | Card backs. |

Washes and scrims (`--gold-wash`, `--alert-wash`, `--scrim`, `--scrim-strong`)
are the only translucent colours. Do not write new `rgba()` values.

### What colour means

| Meaning | Colour |
|---|---|
| It is this seat's turn | gold name, gold turn marker |
| This seat has passed | `--alert` name, "passed" tag |
| This seat has finished | `--dim` name, place medal |
| Your selection will play | gold read-out |
| Your selection cannot play | `--alert` read-out, and the turn marker beside it |
| You have passed | `--alert` read-out: "Passed — out until the table clears" |
| Your hand is empty | place medal + `--bone-dim` read-out: "Your hand is empty" |
| The table refused an action | `--alert` read-out, and the turn marker beside it |
| Not your move | `--dim` read-out |

## 3. Type

One face: **Silkscreen**, smoothing off. Four sizes, chosen by role:

| Token | Size | Role |
|---|---|---|
| `--text-xs` | 12px | Incidental meta: captions, "passed", counts under cards. |
| `--text-sm` | 14px | Labels and **every control label**. |
| `--text-md` | 16px | The sentence that matters on a screen; seat names. |
| `--text-lg` | 24px | Headings. |

- Every button, chip and tag is `--text-sm` at weight 400. Emphasis comes from
  colour and surface, never from a heavier or bigger label.
- Only card ranks are bold.
- Letter-spacing is `0`, or `var(--px)` for display type. Never raw pixels.

## 4. Space and size

- `--px`: one art pixel (`--scale` device pixels). `--u` = 4 art pixels.
- Controls come in two heights, and nothing else:
  - `--control-md` (15 art px): every button — raised, flat, icon, the sort
    control — and every input.
  - `--control-sm` (11 art px): things that label or toggle inside a list:
    chips, tags, Sit here, the Log toggle.
- Heights are odd so a 7-cell icon centres on whole pixels: an icon button's
  padding is exactly `--u` on every side.
- **Icon buttons are square**, width equal to height. Buttons are square or wider
  than tall — never taller than wide.
- **Spacing is a five-step scale, and nothing between the steps.** Every margin,
  padding and gap is one of:

  | Token | Size | For |
  |---|---|---|
  | `--space-xs` | 2 art px (`--u` / 2) | A label to its control; a caption to its value |
  | `--space-sm` | 4 art px (`--u`) | Between controls in a row; inside a group |
  | `--space-md` | 8 art px | Between fields, rows and options |
  | `--space-lg` | 12 art px | Between sections — e.g. the start group and the options above it |
  | `--space-xl` | 20 art px | Breathing room around the hand and the top seat |

  Sizes that are not spacing — a column width, a panel's maximum width — may
  still be written in `--u`. A new margin that seems to need a value off the
  scale is a sign the grouping is wrong, not that the scale is.
- **One gap between controls: `--space-sm`** — a field and its icon buttons, the
  utility row, a row of action buttons.
- **Lobbies end with a start group**: the error, the status line and the start
  button, `--space-sm` apart, set `--space-lg` below the last option. Leave, top
  left, is top-aligned with the table code's title.
- Floating controls sit `--u` in from the viewport edge, never flush against it.
- **On a touch screen (`pointer: coarse`) both control heights are at least
  44px**, rounded up to a whole art pixel. The art does not grow; the button
  does. A mouse keeps the pixel-exact heights.

## 5. Buttons

Two tiers. The tier says how consequential the action is, not how it looks.

### Raised
Changes the game, leaves a screen, or opens one: **Start game, Ready up, Play cards, Pass,
Clear, Leave, Leave table, Play another round, How to play**, and the sort control.

- Surface, ink border, `--px` ink shadow.
- Hover: lifts one art pixel; shadow grows to two.
- Active: presses flat — translates one art pixel, shadow gone.
- Variants: default (`--table-hi`, bone) · primary (gold, `--on-gold`) · pass
  (`--pass`, bone) · quiet (`--table-lo`, `--bone-dim`, for Leave).

### Flat
Conveniences and toggles: **new seed, copy seed, difficulty chips, Sit here, Log**.

- No surface, `--table-hi` outline, `--dim` text, no shadow, no movement.
- Hover: text to bone, outline to `--dim`.
- A pressed toggle (`aria-pressed="true"`) takes the gold surface.

### Shared states
- **Focus:** `--px` gold outline, offset `--px`, on keyboard focus only.
- **Disabled, raised:** the same button at `opacity: .45`, with no shadow and no
  hover. It keeps its hue, so a gold button is still the gold button.
- **Disabled, flat:** `--dim` outline and text. A disabled toggle that is
  selected keeps a gold outline and gold text, so a read-only setting still
  shows its value.
- **Transition:** 90ms, `steps(2)`, on transform, shadow, colour and border.

### Labels
Sentence case in source, verbs that say what happens, the same word everywhere.

**A button names the action pressing it performs, never a state.** Somebody
glancing at a button must not be able to read it as a report of how things
are. "Not ready" on a button reads as *you are not ready* — while the truth is
the reverse — so the button says "Cancel ready".

- **Lead with a verb** ("Start game", "Cancel ready", "Leave table"). A bare
  adjective or status word (Ready, Not ready, Away, Muted, Off) is never a
  button label.
- **State lives beside the control, not in it:** on a tag (the seat's "Ready" /
  "Not ready"), a status line, or a pressed toggle's fill. A button that
  switches between two actions swaps its label to the *next* action; the state
  it leaves you in shows on the tag.
- **Exceptions, which show a value rather than an action:** option chips (the
  label is the option, the fill says which is chosen) and a cycling setting
  that carries its own name ("Sort · Rank"), so it reads as a setting, not a
  reading.
- **Working states** use the verb in progress with an ellipsis ("Opening…"),
  disabled, at the width of the longer label.
- **Check a new label** by asking: if this were the only word on screen, would
  someone know what happens when they press it — and could they mistake it for
  what is already true?

| Action | Label |
|---|---|
| Start a game — alone, or as a shared table's host | Start game |
| Say you are ready at a shared table | Ready up / Cancel ready |
| Leave a lobby | Leave |
| Leave a game in progress | Leave table |
| Next round | Play another round |

## 6. Inputs

Every field is `--control-md` tall with a `--table-hi` border. The surface says
whether you can type in it:

- **Editable** — your name, the seed, a table code: the darker `--field`.
- **Not editable** — a disabled field: the lighter `--table`.

Keyboard focus draws the shared gold outline. Only editable fields can be
drag-selected; nothing else on any screen can.

A field with actions is a **field row**: the input grows, square icon buttons
sit beside it at the same height.

## 7. Icons

Pixel bitmaps on a **7×7** grid, rendered at one art pixel per cell
(`7 * --px`), drawn in `currentColor`. Decorative: the button carries the
accessible name, which must say what it acts on ("New seed", not "New").

Current set: `copy`, `refresh`, `help`, and `check` (in the copy toast).

Beside small labels, glyphs are **5×5** at one art pixel per cell, so they stand
no taller than the text: the Host only lock and the inline-help `?`.

## 8. Elevation

Every shadow is cast in the same ink:

- `--shade`: resting and lifted things — cards, buttons.
- `--shade-soft`: large surfaces lying flat — panels, the menu card.

**A card's shadow says how far off the felt it is.**

| Card | Shadow |
|---|---|
| Played — every card of the closed trick, the standing combo included | two pixels straight down |
| Discard pile | the bottom card only, one pixel down |
| Held — your hand and every seat's fan | three pixels straight down, levitating like cards in a hand |
| Picked up — hovered, pressed, picked or dragged | two across, five down, above the hand it left |
| An opened trick | two across, three down |

Card shadows are **crisp with a soft edge**: half an art pixel of blur for
cards on or just above the felt, a pixel for an opened trick, a pixel and a
half for a card picked up — the higher the card, the softer its shadow. Fully
hard, a shadow read as an outline drawn on the art; blurred wide, as haze.
Cards resting on the table or held in a hand cast into **one shared shadow
group** beneath every card: opaque shapes drawn together at a single `--shade`
opacity, so where shadows overlap they merge instead of darkening into
stripes. A card picked up, or a card in an opened trick, casts its own shadow
instead, since it has left the rest. The standing combo is marked by its gold
edge, not a bigger shadow.

Page layers are the `--layer-*` tokens. Inside the card layer, cards stack by
the constants in `lib/zoneGeometry.ts` (zones 10–60, opened trick 130–150,
`HOVER_Z` 800, `DRAG_Z` 900).

## 9. Motion

- Stepped (`steps(2)`) for anything that is simply on or off: controls, markers,
  clock segments.
- Short ease-out for anything that travels: cards, the trick opening.
- **Transient things leave with one fade:** `--fade-out` (260ms), eased out —
  smooth, not stepped, because a fade is something going away rather than
  something switching off — `@keyframes fade-out`. The copy toast and the inline help note both use it;
  anything new that shows for a moment and goes away uses it too, rather than a
  timing of its own.
- **A resize is not a move.** Cards follow the window instantly while it is being
  resized; only game events animate them.
- **The discard pile is the real cards**, face down, in the order they arrived,
  tossed roughly on top of each other: each turned up to 10° either way and
  nudged a pixel or two off square, the pile thickening by a quarter pixel per
  card for the first 13. The scatter is fixed per card, so it never twitches.
  A shadow under the bottom card only. A closing trick travels there as itself;
  there is no separately drawn pile.
- **The trick and the discard pile share one centre line**, and their captions
  (the seat under the trick, "N played" under the pile) share one line too:
  both `--text-xs`, both one `--u` below their cards. The pile is centred as a
  full pile (its thickening is offset by a fixed half), so no card moves when
  another lands.
- **Captions and other pixel text land on whole pixels.** A caption's transform
  is a flat, rounded `translate`, and it is centred by a rounded margin rather
  than `translateX(-50%)` — a half pixel or a 3D transform blurs pixel type.
- **A closed trick is a pile with the newest combo on top.** The standing combo
  sits centred on the row; every combo it beat lies beneath it at the
  normal size, turned up to 10° and nudged a few pixels, fixed per card like the
  discard pile. However long the exchange, the trick never grows wider than the
  combo on top.
- **An opened trick is one line**: every card at the raised size, a step of just
  over a card, half a card of extra air between combos. Combos of different
  sizes sit evenly; each caption stays under its own cards. A line that fits is
  centred. A longer one shows a **window** of at most one card plus seven steps
  (never wider than the table), starting on the newest play; it scrolls back by
  wheel, drag or swipe, and the arrow keys, Home and End. A card fades as it
  passes the window's edge, gone once 60% of a card is outside it, and the plate behind the trick
  stops at the window.
- Clocks change tone at a third and a sixth of their allowance — 20 and 10
  seconds of a turn, 5 and 2½ of a pile pick.
- One pulse per urgent state (turn marker, a clock's last sixth), stepped, and off
  under `prefers-reduced-motion`.
- **The bomb moment** is the one celebration during play: a gold flash across
  the table (3 steps), a shake of one or two art pixels (360ms), and a callout
  over the middle — "Chopped!", "Counter-bomb!", "Four 2s!" (bone) or
  "Straight of N!" at twice `--text-lg`, popping in over 3 steps, with a line
  saying who did it ("Mia runs 3 to 7"). It holds for 1.8s. Only for a bomb on
  a 2, a bomb on a bomb, four 2s, and a straight of five cards or more, led or
  answered; read from the event log, never replayed on arrival. Reduced motion
  keeps the words only.

## 10. Layout

- **The table is capped both ways and centred**: at most 20 card widths wide and
  11 card heights tall, in card units so it scales with `--scale`. On a wide
  screen the side seats stay near the trick instead of running to the edges; on
  a tall or portrait screen the top seat and your hand stay in proportion.
- **The title card** is the in-game card sprite at two art pixels per pixel —
  `--px` doubled on the card — so its border and inner edge match the table's
  cards. No caption.
- **The main menu title is drawn, not typed**: the share image's five-row pixel
  lettering (`PixelTitle`), one glyph pixel per `--u`, in bone, `--space-md`
  above the description. The menu and a link preview show one piece of
  lettering. The name is kept as screen-reader text.
- **How to play** is one sheet (`RulesSheet`), opened from the main menu
  ("How to play", raised) and from the table (the `help` icon floating top right,
  the log toggle's twin: same inset, height, surface and shadow, but square).
- **The turn marker** is a five-pixel slot on every seat and beside your own
  read-out: a three-pixel dim square at rest, the whole slot gold (with a felt
  ring) on turn, so text beside it never shifts. It is centred on its text and
  `--space-sm` from it, everywhere.
- **Every hand fans the same way**: opponents' fans use your hand's spread and
  curve, the radius scaled to their smaller cards. A fan squeezed into less
  room than it wants fans less — its spread shrinks with its gap, down to half
  — as a hand held closer does; a fan with room keeps the whole arc.
- **The table's bottom row** (desktop) is three columns with equal outer
  columns: Sort left, Leave table right, the round and seed centred on the row.
- **Sort's pips** sit centred above the button on every screen, two pixels
  clear of it: two pixels square with a mouse, three on a phone. The button is
  always as wide as its longest label (all labels share one cell, the others
  hidden), so the pips never move as it cycles.
- **Dropping to play** takes the whole middle band of the table, between the
  seats and your controls, not just the trick's box. While a card is dragged
  over it, it lights exactly as your hand does — a dashed gold ring and gold
  wash — or with a solid `--alert` ring when those cards cannot play.
- **Table corners, every screen size:** Log top left; How to play (or, on a
  phone, Menu) top right.
  Written from Section 9 only. Opened from the table, it scrolls to and marks
  (gold edge, gold wash) the rule being enforced right then: bombing a 2, or
  the opening play.
- **Between rounds at a shared table**, the scores list says who is Ready (gold),
  Waiting, Away or has a computer playing. Your button reads "Play another
  round" / "Play again" (primary); once pressed it becomes "Cancel ready"
  (default raised, at the width of the longer label), and the line above it
  reads "You are ready. Next round deals in Ns" — the count starts once anybody
  is ready and stops if nobody is left ready.
- **A seat a computer took over** shows a fixed banner at the top — out of the
  board's flow — with one action: "Take my seat back".
- **The host** (longest-seated connected person) is marked "(Host)" to others
  and gets a flat "Remove" on other people's rows, in the slot "Sit here" uses,
  until the first deal.
- **On phones (720px wide or less)** the table is one screen, never scrolled:
  - The seats start `--space-xl` below the Log and Menu buttons.
  - The three opponents share one row across the top, a third of the width
    each, left seat to right seat in turn order. Each keeps a fan of real card
    backs — a hand, not a number — closed up to fit its column; the count and
    points go on two lines beneath it.
  - Top right, **Menu** (flat) opens a panel — `--table-lo`, like every other
    panel, so its buttons' ink borders and shadows show — with the round, match
    length and seed, How to play (raised) and Leave table (quiet), full width;
    Escape or a tap outside closes it. Log
    sits top left. "Menu" is a place, not an action — the one exception to
    labels leading with a verb.
  - Above your hand: the turn marker, what to do, and your clock, on one line,
    the sentence beside the marker. It sits close over the hand — the row
    overlaps part of the hand's lift room — so it reads as belonging to the
    cards, while a picked card still rises clear of the text.
  - Below the hand, two rows: Sort
    and Clear, then Pass and Play cards at half the width each, Play on the
    right where a right thumb rests. Touch buttons stand `--space-md` apart,
    across a row and between the rows — a step wider than a mouse's
    `--space-sm`, because Pass beside Play is the slip that costs a trick.
  - Your hand is nearly flat (an arc spends width on turned corners, and width
    is what each card's touchable strip is made of).
- **Opponent badges** (one card back and a large count) exist only as a trial
  on the dev server (`?seats=badges`, compared at `/compare.html`). Fans are
  the design.
- **Picking cards by touch** — the finger has no hover, and covers what it
  touches:
  - A press magnifies and lifts the card under the finger, so you can see what
    you are about to take.
  - A tap selects the card whose visible strip is under the finger: the last
    card whose left edge is at or left of it, not whichever card's rotated box
    happens to be on top.
  - Sliding sideways selects every card the finger crosses — or deselects them,
    if the first card was already selected. Every card crossed stays changed
    until the finger lifts; cross it again with a new slide to change it back.
  - Pushing up lifts the selection; letting go over the table plays it.
    Reordering the hand is by mouse only; on touch, use Sort.
  - Hover effects only answer a mouse, so nothing stays raised after a tap.
    A mouse hovers by **centreline**: the boundary between two cards is halfway
    between their centres, so each card has an equal zone either side of its
    own centre, however much of it is covered and however much a hovered card
    has grown. The hovered card keeps the hover 4px past a boundary (a quarter
    of the distance between centres where cards are tighter), so a pointer
    resting on a boundary does not flick between two cards. A press takes the
    hovered card. A finger still goes by the visible strip, which is what a
    fingertip covers.
  - The trick opens on a tap and closes on a tap anywhere else.
- **Leaving a game asks first.** Both Leave table buttons open a confirmation
  over everything else: "Stay" (quiet, focused) and "Leave table" (pass red).
  Alone it says the match ends; at a shared table, that a computer plays the
  seat and it is held for 2 minutes — or, for the host of a browser-hosted
  table, that leaving closes it for everyone. Leaving a lobby does not ask.
  The box is framed in `--bone-dim` with a `--bone` title, not gold: gold is
  the scores screen's payoff and "your move", and a question about leaving is
  neither.
- **Continue game.** A match played alone is saved after every turn. While a
  save exists, "Continue game" takes the menu's primary slot and "Play on your
  own" steps down to a default button.
- **Your name** appears in both lobbies, above the seed.
- **The pile ceremony**: each pile's box holds the cards, their lean and their
  shadow, so the shadow sits inside the pile's outline rather than across it.
  The stack casts one shadow as a single block — a drop shadow of the whole
  stack's outline, two pixels straight down with the same soft edge as the
  table's cards — rather than the bottom card's own, which stuck out from
  under one corner of the lean.
- **Match length** sits in both lobbies between your name and the seed, as an
  **option set**: an outlined box of labelled rows, one per kind of answer —
  *Points* 15 · 30 · 50 and *Rounds* 5 · 10 — divided by a `--table-hi` rule,
  with the sentence under it saying what the chosen option means. Chips carry
  the bare number; the row says what it counts.
- **Host-only settings** (computer difficulty, match length) look identical for
  everyone. For anyone but the host the chips are disabled, the chosen one keeps
  a gold outline and gold text (no fill), and a "Host only" tag — a 5×5 pixel
  lock and `--text-xs` `--dim` label — sits beside the setting's heading ("Host
  sets difficulty" beside Seats).
- **The scores screen** carries a match line above the round's note ("Round 3 of
  10. …" or "First to 30 points wins the match."). When the round decides the
  match, the title becomes "… wins the match", the pick-first note goes, and the
  primary button reads "Play again".
- **At a browser-hosted table** the lobby has no seed field, since every device
  adds to the shuffle, and the seed is hidden in the game's info line too. Who
  hosts is not a lobby field; the host learns the table closes with them from
  the leave confirmation.
- **Losing the host in a lobby**: a guest's seats hint reads "Lost the host.
  Waiting for them to come back…" for up to 60 seconds, while the host's page
  may be reloading; then the table's closing message. The host's own reload
  passes through "Opening…" on the menu straight back into the lobby.
- **The fairness line** sits on the scores screen at a browser-hosted table:
  "Checking the deal and every move…", then "Deal and every move checked." in
  `--dim`, or "This round failed its check: …" in `--alert`.
- **Readying up** at a shared table: each player's row carries a tag beside
  their name — "Not ready" (outlined, `--dim`) or "Ready" (gold fill,
  `--on-gold`). Guests get "Ready up" (primary), then "Cancel ready" (default
  raised); the host gets "Start game", disabled until everyone else is ready. A
  status line in `--bone-dim` sits just above the button saying who is waited on.
- **The main menu**: title and description; one row of ways in — Continue game
  (while a solo save exists), Play on your own (primary) and Play with friends
  (default raised); How to play (quiet) on a line of its own beneath them, so
  reference never reads as a third way to start; then a ruled-off row with your
  name, a table code and Join. A button whose label changes while it works ("Opening…") keeps
  the width of its longer label.
- **Inline help** is a bracketed pixel "[?]" (11×5) beside a field label — the
  brackets mark it as pressable, where a bare "?" reads as punctuation. `--dim`,
  brightening to bone while its note shows, with the shared gold focus ring.
  Hovering or keyboard focus shows a floating note below the label; a click or
  tap pins it; a second click, Escape or a click elsewhere closes it. It leaves
  with the shared `--fade-out`, exactly as the copy toast does. The note —
  `--ink` surface, `--table-hi` outline, `--px` shade, `--text-sm` `--bone-dim`
  text, terms picked out in bone rather than bold — moves nothing on the page
  and stays to two or three short sentences: what the setting's options mean
  for the game, not the whole rule. Used on Match length.
- **The pile pick clock** at a shared table is the turn clock, in a fixed-height
  slot under "Choose a pile." so the piles never move as it comes and goes.
- **The table's info line** at a shared table carries a copyable table code.
- **The table:** the play area is centred on both axes. Seats sit around it;
  the top seat is offset toward the centre so the gap above the trick matches
  the gap either side.
- **Lobbies share one frame** (`LobbyLayout`): Leave top left, the seats, the
  options common to both modes, the options unique to one, then the full-width
  primary action. Only mode-unique options differ in layout.
  - Both: seats with computer difficulty, seed.
  - Every seat row has the same order:
    `Seat N (You | CPU | Player)` · **Sit here** when a computer holds it ·
    on the right, the difficulty chips for a computer or the person's name.
    The bracket is `--dim`; your own row keeps the gold underline.
    Every row is the same height whoever holds it, so taking a seat
    moves nothing on the screen.
  - Playing alone you are always seat 1, whatever seat you last took at a
    shared table.
  - In a shared lobby: your name, then the match length, then the seed (at a
    table server only). Your name starts as a random common name, kept until
    you change it.
  - A shared lobby's title, top right, is its **Table code**: a small dim label
    over the code at `--text-lg`, and beneath it a flat **Copy invite link**
    button. One way to share, shown once — the code to say aloud or type, the
    link to send in a message. There is no separate invite-link field.
  - Shared tables only: taking a seat, your name, the table code and its link.

## 11. Seeds

One format everywhere: two groups of four from the table-code alphabet
(`ABCD-2345`). The same seed deals the same four piles whether you play alone or
at a shared table — which pile you get still depends on the blind pick.
Generated and normalised only by `@big-two/session`'s `seed.ts`.

The seed in the table's bottom bar is always the seed that dealt it. Playing
alone, returning to the lobby deals a fresh seed; to replay a deal, copy the
seed first.

## 12. Copying

- **Codes copy on click; everything else copies with a button.** The table code
  and the in-game seed are `Copyable` buttons styled as text. They hover the
  same way: **pointer cursor, and only the value fades to 60%** — never its
  label (mark it `copyable__text`). The seed *field* is somewhere you type and
  select, so it copies with a flat copy icon button beside it. The invite link
  is never shown — a whole URL is noise — and copies with the flat "Copy invite
  link" button beneath the table code.
- **The toast** is just a check and the words, in gold with an ink drop shadow —
  no box. It appears instantly at the pointer, follows it for 1.4s, and leaves
  with the shared `--fade-out`. Keyboard
  copies place it over the element. It is also announced politely to screen
  readers. Messages: "Seed copied", "Code copied", "Link copied".
