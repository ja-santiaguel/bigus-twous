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

The world is a ruin underground — grim gothic fantasy, played by candle and
bone rather than neon. Every surface is dark slate stone; cards and words are
bone; gold marks whatever wants your eye and whatever is money; blood red says
no. Behind everything, still: a vignette at the edges and a two-pixel grain,
faint enough to read as stone rather than pattern. No glowing titles or mist.

| Token                   | Value                 | Use                                                                                                                 |
| ----------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `--table`               | `#16211f`             | The stone floor every screen stands on.                                                                             |
| `--table-lo`            | `#101917`             | Panels, subdued raised buttons.                                                                                     |
| `--table-hi`            | `#22322f`             | Default raised button surface, outlines, dividers.                                                                  |
| `--field`               | `#0e1716`             | Input surfaces — darker than any panel they sit on.                                                                 |
| `--ink`                 | `#0b1212`             | Borders of raised things, and the colour every shadow is cast in.                                                   |
| `--bone`                | `#ddd5c0`             | Primary text, card faces (parchment, with an aged inner edge).                                                      |
| `--bone-dim`            | `#bdb4a0`             | Secondary text.                                                                                                     |
| `--dim`                 | `#8fa29c`             | Tertiary text, flat control text, disabled flat controls.                                                           |
| `--edge`                | `#4f8177`             | The outline of an editable field — 3:1 against the table.                                                           |
| `--gold`                | `#d9a441`             | **Your move**, the primary action, the standing combo, selection, focus — and gold itself: pots, prizes, placings.  |
| `--gold-hi`             | `#e6b457`             | Primary button hover.                                                                                               |
| `--on-gold`             | `#241905`             | Text on a gold surface.                                                                                             |
| `--alert`               | `#e0584e`             | Every "no": a selection that cannot play, a refused play, a seat that has **passed** (yours included), urgent time. |
| `--pass` / `--pass-hi`  | `#7c2621` / `#8a2c26` | The Pass button — the passed colour, deep enough for bone text.                                                     |
| `--silver` / `--bronze` | `#b9c2c6` / `#cc9660` | Second and third place.                                                                                             |

**Contrast is a rule, not a check at the end.** Every text colour meets WCAG AA
— 4.5:1 — on `--table`, `--table-lo` and `--field`; the outline of anything
you type into meets 3:1. A new colour, or an existing one on a new surface, is
measured before it ships.

One deliberate exception: `--alert` is a deep red, because a pale one read as
pink rather than as "no". It holds **3:1** on every surface, and it only ever
colours words that already say what is wrong ("passed", "can't play that"), so
the colour is never the only cue.
| `--suit-red` | `#9c2019` | Hearts and diamonds — dried blood on parchment. |
| `--back` / `--back-hi` | `#4a6670` / `#5e7f8a` | Card backs. |

Washes and scrims (`--gold-wash`, `--alert-wash`, `--scrim`, `--scrim-strong`) are the only translucent colours,
with the atmosphere behind the page. Do not write new `rgba()` values.

### What colour means

| Meaning                     | Colour                                                    |
| --------------------------- | --------------------------------------------------------- |
| It is this seat's turn      | gold name, gold turn marker                               |
| This seat has passed        | `--alert` name, "passed" tag                              |
| This seat has finished      | `--dim` name, place medal                                 |
| Your selection will play    | gold read-out                                             |
| Your selection cannot play  | `--alert` read-out, and the turn marker beside it         |
| You have passed             | `--alert` read-out: "Passed — out until the table clears" |
| Your hand is empty          | place medal + `--bone-dim` read-out: "Your hand is empty" |
| The table refused an action | `--alert` read-out, and the turn marker beside it         |
| Not your move               | `--dim` read-out                                          |

## 3. Type

One face: **Silkscreen**, smoothing off. Four sizes, chosen by role:

| Token       | Size | Role                                                     |
| ----------- | ---- | -------------------------------------------------------- |
| `--text-xs` | 12px | Incidental meta: captions, "passed", counts under cards. |
| `--text-sm` | 14px | Labels and **every control label**.                      |
| `--text-md` | 16px | The sentence that matters on a screen; seat names.       |
| `--text-lg` | 24px | Headings.                                                |

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

  | Token        | Size                 | For                                                              |
  | ------------ | -------------------- | ---------------------------------------------------------------- |
  | `--space-xs` | 2 art px (`--u` / 2) | A label to its control; a caption to its value                   |
  | `--space-sm` | 4 art px (`--u`)     | Between controls in a row; inside a group                        |
  | `--space-md` | 8 art px             | Between fields, rows and options                                 |
  | `--space-lg` | 12 art px            | Between sections — e.g. the start group and the options above it |
  | `--space-xl` | 20 art px            | Breathing room around the hand and the top seat                  |

  Sizes that are not spacing — a column width, a panel's maximum width — may
  still be written in `--u`. A new margin that seems to need a value off the
  scale is a sign the grouping is wrong, not that the scale is.

- **One gap between controls: `--space-sm`** — a field and its icon buttons, the
  utility row, a row of action buttons.
- **Space says what belongs together.** Inside a group, `--space-sm` to
  `--space-md`; between separate groups, `--space-xl` — a clear step, so a
  screen reads as a few blocks rather than one list. The main menu is three
  groups (title and description; the ways in, How to play included; joining a
  table). A lobby is the seats, then the options, then the start group. The
  table's read-out belongs to your hand: `--space-lg` from the cards, a
  group's distance from the trick.
- **Lobbies end with a start group**: the error, the status line and the start
  button, `--space-sm` apart, a group's distance (`--space-xl`) below the last
  option, with a `--table-hi` rule along its top. Where the lobby is taller than
  the screen — a phone, a short laptop — the group is pinned to the bottom as
  the options scroll under it, so Start is never below the fold. Leave, top
  left, is top-aligned with the table code's title.
- **Nothing that follows the pointer leaves the screen.** The copy toast and the
  disabled-button hint slide back to stay 8px inside every edge.
- Floating controls sit `--u` in from the viewport edge, never flush against it.
- **Responsive tiers.** Three bands — desktop (over 1024px), tablet
  (721–1024px) and phone (720px and under) — and everything that should respond
  to the screen responds in the same steps. Each band sets the type
  scale, the spacer between groups and, on touch, the control heights. An
  element asks for a _role_ (`--text-md`, `--space-group`, `--control-sm`) and
  never a smaller role to fit a phone: the roles themselves come down.

  |                        | Desktop             | Tablet            | Phone                                    |
  | ---------------------- | ------------------- | ----------------- | ---------------------------------------- |
  | Type xs / sm / md / lg | 12 / 14 / 16 / 24   | 12 / 14 / 15 / 22 | 12 / 13 / 14 / 20                        |
  | `--space-group`        | `--space-lg` (36px) | 10 art px (30px)  | `--space-lg` at the phone's scale (24px) |
  | Touch lg / md / sm     | 44 / 44 / 44        | 44 / 40 / 32      | 44 / 36 / 28                             |

  `--control-lg` is the action a screen exists for (Start game, Ready up, Pass,
  Play cards) — the same as any button on a wide screen, and the height that
  holds at a finger's 44px as the others come down. `--control-md` is every other
  button and every field; `--control-sm` a chip or tag inside a list — a
  difficulty, a match length, a ready state, and Sit here, which takes its row's
  chip height on every tier so the seat rows stay even. A mouse gets the
  pixel-exact art heights on every band. The spacing _scale_ (`--space-xs` to
  `--space-xl`) is in art pixels and follows `--scale`; `--space-group` is the
  role that steps. The art never changes size; the box around it does.

- **A height is chosen against the padding beside the label, never on its own.**
  Side padding runs a little under half the height — `--space-md` either side of
  a 36px button, `--space-sm` of a 28px chip — so a control reads as a control
  rather than a tall, tight slab. When a height comes down, check the padding
  still holds that proportion; when a label will not fit, shorten the label
  (Medium is "Med" on every screen, spoken in full) rather than squeezing the
  padding away.
- `--corner` is the height of the table's corner controls, and the table's top
  padding is measured from it, so the seats keep their distance from Log and
  Menu whatever those measure.

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

### The screen's main action

The one action a screen exists for (Start game, Begin, Sit down, Move on) is
sized to its words over a floor of 36 art units, centred in its group — never
stretched to the panel's width, where it read as a banner rather than a
button. It is the tall height (`--control-lg`).

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
are. "Not ready" on a button reads as _you are not ready_ — while the truth is
the reverse — so the button says "Cancel ready".

- **Lead with a verb** ("Start game", "Cancel ready", "Leave table"). A bare
  adjective or status word (Ready, Not ready, Away, Muted, Off) is never a
  button label.
- **State lives beside the control, not in it:** on a tag (the seat's "Ready" /
  "Not ready"), a status line, or a pressed toggle's fill. A button that
  switches between two actions swaps its label to the _next_ action; the state
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

| Action                                            | Label                   |
| ------------------------------------------------- | ----------------------- |
| Start a game — alone, or as a shared table's host | Start game              |
| Say you are ready at a shared table               | Ready up / Cancel ready |
| Leave a lobby                                     | Leave                   |
| Leave a game in progress                          | Leave table             |
| Next round                                        | Play another round      |

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

| Card                                                                 | Shadow                                                      |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| Played — every card of the closed trick, the standing combo included | two pixels straight down                                    |
| Discard pile                                                         | the bottom card only, one pixel down                        |
| Held — your hand and every seat's fan                                | three pixels straight down, levitating like cards in a hand |
| Picked up — hovered, pressed, picked or dragged                      | two across, five down, above the hand it left               |
| An opened trick                                                      | two across, three down                                      |

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

**A shadow never snaps.** When a card goes up or down — hovered, picked,
dragged, the trick opening or closing — its own shadow eases in or out over
180ms while its place in the shared group fades at the same pace, so the
shadow is handed over in one smooth change. Resting cards have a zero shadow,
not `none`, so there is something to ease from.

Page layers are the `--layer-*` tokens. Inside the card layer, cards stack by
the constants in `lib/zoneGeometry.ts` (zones 10–60, opened trick 130–150,
`HOVER_Z` 800, `DRAG_Z` 900).

## 9. Motion

- Stepped (`steps(2)`) for anything that is simply on or off: controls, markers,
  clock segments.
- Short ease-out for anything that travels: cards, the trick opening.
- **A held card trails the pointer a touch** (`FOLLOW`): dragging, it follows on
  a critically damped spring — about 40ms behind, caught up within ~150ms of
  the pointer stopping, never overshooting — so it has weight without wobble.
  Under reduced motion it sits exactly under the pointer.
- **...and swings a little about where you hold it** (`TILT_*`). The lean
  follows the card's own horizontal speed and turns about the grip, as a card
  held at one point does: held above its middle and carried right, it leans
  clockwise; held below, the other way; held dead centre, not at all. 3–4° at
  an ordinary pace, never more than 6°; it settles upright with one barely
  visible swing back. None under reduced motion.
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
- **Once you are out, the round plays out fast.** Playing alone, from the moment
  you finish — first, second or third — the computers left in the round move at
  the `fast` pace: 320–460ms a play, 380–520ms a pass, against 0.9–2.8s normally.
  Every card's 220ms flight still lands before the next one leaves, so nothing
  is ever drawn mid-air, and the spread keeps four computers from ticking like a
  clock. A shared table keeps one pace for everybody watching.
- **Your points are on the table**, said the way each seat's are under its fan:
  "You · 12 pts", the number in bone. On a phone they sit between Sort and
  Clear; on a wide screen they lead the round line in the bottom row.
- **A shadow never arrives before its card, and never resets.** Every resting
  card keeps its place in the shared shadow group for as long as it is on the
  table. Lifted — hovered, picked, dragged — its shadow there fades to nothing
  while the card casts its own, and fades back when it comes down; it is never
  taken out and rebuilt, which is what made the shadows under a hovered hand
  reset. Only a shadow that has just appeared waits out its card's 220ms flight
  before fading in. The combos beaten in a closed trick lie under the one that
  stands: a one-pixel, 45%-strength shadow, so the combo on top reads as on
  top.
- **The game's line sits at the top of the screen**: the round, the match and
  the seed or table code, centred between the corner buttons and level with
  them, in `--text-xs` `--dim`. One line on a wide screen; on a phone the seed
  or code takes a second line of its own rather than wrapping wherever the
  text runs out. The Menu holds How to play and Leave table only.
- **The rules sheet scrolls** within the visible height: its box is limited to
  `--vh` less its margin, and its body may shrink below its content
  (`min-height: 0`) so there is something to scroll.
- **Big plays** are the one celebration during play, and they answer in
  proportion — three levels, by how rare and how decisive the play is:

  | Level | Plays                                                                                         | The table answers with                                                                                              |
  | ----- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
  | 1     | A single 2; a straight of 4 or 5                                                              | A half-strength flash, no shake; the name at 1.25× `--text-lg`, held 1.1s                                           |
  | 2     | A chop (a bomb on one 2); a pair of 2s; a straight of 6 or 7                                  | A gold flash in 3 steps, a 1–2 art pixel shake (360ms); the name at 2×, held 1.6s                                   |
  | 3     | A bomb on a pair or three of 2s; a bomb on a bomb; three 2s; four 2s; a straight of 8 or more | A card-face flash that comes twice, a 2–3 pixel shake (560ms); the name at 2.5× in bone on a gold shadow, held 2.2s |

  Straights sit where their odds put them. Over 400,000 simulated deals a
  thirteen-card hand holds a 2 70% of the time, two 2s 26%, three 2s 4.4% —
  the anchors of the three levels — and a straight of 4 74%, 5 47%, 6 27%,
  7 14%, 8 7%, 9 3%, 10 1%. Each length takes the level whose anchor it is
  nearest in rarity; a straight of 3 (95%) is commoner than any of them and is
  not a moment.

  Only the kind of play is named, never who made it — their cards are already
  in front of their seat, and the log says it in words:

  | Play                                         | Name                                                  |
  | -------------------------------------------- | ----------------------------------------------------- |
  | A single 2                                   | 2 of Spades! (the card itself: which 2 it is matters) |
  | A pair / three / four 2s                     | Pair of Twos! · Three Twos! · Four Twos!              |
  | A bomb on one / two / three 2s               | Chopped! · Double chop! · Triple chop!                |
  | A bomb on a bomb                             | Counter-bomb!                                         |
  | A straight of 4–11                           | Straight of N!                                        |
  | A straight of all twelve ranks, 3 to the ace | Dragon!                                               |

  **A "2" never sits directly beside an "S".** In the pixel face the two run
  together into one smudged glyph, so several Twos are spelled out; "2 of
  Spades" is fine, with a word between them.

  **The name sits on a band.** An ink band (95%) runs across the whole window, edge to edge, not only the table (a table narrower than the window left it looking cut off)
  behind it, so the name has one dark ground wherever it lands — over the
  trick, the seats or the felt. **In:** the band sweeps open sideways from the
  centre of the table (180ms, 3 steps), and the name pops in once it is open.
  **Out:** the name lifts three pixels as it fades (160ms), then the band folds
  shut onto its centre line (220ms), finishing just as the callout unmounts —
  never a one-frame disappearance. Exits step with `jump-none`, which always
  lands on the last frame. The letters carry a one-pixel ink outline on all four sides as well as
  their drop shadow. The band's edges say the level: `--table-hi` at 1, gold at
  2, card-face bone with gold inside them and a thicker band at 3. On a phone the names come down with
  the type (1×, 1.3×, 1.6× `--text-lg`) and still fit a 360px screen. When
  several plays arrive at once, the biggest is shown. Read from the event log,
  never replayed on arrival; a bomb led onto an empty table is not an event.
  Reduced motion keeps the words only.

## 10. Layout

### Layout frame

Every screen is laid out in one frame, set by three tokens and the spacing
scale (section 4):

- **`--edge`** (one `--u`, 12px at scale 3): how far all chrome sits from the
  viewport's edges — the Log and the Menu in the top corners, the read-out
  along the top, the run bar along the foot. The same on all four sides.
- **`--gutter`** (`--space-lg`; `--space-md` on a phone): how far content sits
  from the sides of the viewport.
- **`--chrome`** (six `--u`, 72px): the height kept for a bar at the top or at
  the foot. The same at both, so what sits between is centred between them.
- **`--foot-clear`** (`--edge` and `--space-lg`, 48px at scale 3): how far a
  run's bar sits above the foot of the screen — as far as the top seat's name
  sits below the read-out, so a campaign table is framed alike above and
  below.
- **Content blocks are centred and capped**: the map with its panel at 104
  `--u`, the class panel at 920px, campaign screens at 1560px, the table at 26
  card widths. Inside a block, alignment is to the left.
- **Nothing scrolls sideways, and no scrollbar shows.** A screen longer than the
  window still scrolls by wheel, finger or keys; a scrollbar that came and went
  pushed every centred screen sideways, so the page has none. Scrolling panels
  (the log, How to play) keep theirs.
- **Buttons are sized to their words** over a floor of 22 `--u`; none is
  stretched across a panel.

- **The table is capped both ways and centred**: at most 26 card widths wide and
  11 card heights tall, in card units so it scales with `--scale`. A full
  desktop window is the table's — at 1920 wide it takes 1716 — with the side
  seats out toward the edges and the room between given to the trick; on a
  tall or portrait screen the top seat and your hand stay in proportion.
- **The title card** is the in-game card sprite at two art pixels per pixel —
  `--px` doubled on the card — so its border and inner edge match the table's
  cards. No caption.
- **The main menu title is drawn, not typed**: the share image's five-row pixel
  lettering (`PixelTitle`), one glyph pixel per `--u`, in bone, `--space-md`
  above the description. The menu and a link preview show one piece of
  lettering. The name is kept as screen-reader text.
- **How to play** is one sheet (`RulesSheet`), opened from the main menu
  ("How to play", raised) and from the table (the corner Menu, top right, the
  log toggle's twin: same inset, height, surface and shadow).
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
- **The discard pile sits `--space-md` from the play area**, and on a phone it
  is centred in a side column narrowed to 1.4 card widths: at a desktop's two,
  the pile and its count ran off the right of the screen.
- **Dropping to play** takes the whole middle band of the table, between the
  seats and your controls, not just the trick's box. While a card is dragged
  over it, it lights exactly as your hand does — a dashed gold ring and gold
  wash. The ring is drawn inside the band and pulled clear of anything that
  reaches into it (the top seat's count, the read-out above your hand;
  `dropOutline.ts`), measured once as it lights; the band still takes the
  drop. When those cards cannot play it keeps the same dashed ring in
  `--alert`, holds still instead of pulsing, is struck through with diagonal
  hazard stripes (a pattern, so it reads without colour) and carries a tag
  in its top-left corner saying why: "Not your turn" or "Can't play these".
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
  - The seats start `--space-xl` below the bottom of the Log and Menu
    buttons: the corner controls and the table are separate groups.
  - The log opens up to 160 art pixels wide, never wider than the screen, so an
    entry is a line rather than three.
  - The three opponents share one row across the top, a third of the width
    each, left seat to right seat in turn order. Each keeps a fan of real card
    backs — a hand, not a number — closed up to fit its column; the count and
    points go on two lines beneath it.
  - A computer's seat reads "Seat 2 (CPU)", the bracket in `--dim` as in the
    lobby. On a phone it takes its own `--text-xs` line tight under the name (a
    pixel's gap: it belongs to the name, not to the fan below), and every seat
    keeps that line — empty for a person — so the fans start level.
  - Top right, **Menu** (flat) opens a panel — `--table-lo`, like every other
    panel, so its buttons' ink borders and shadows show — with the round, match
    length and seed, How to play (raised) and Leave table (quiet) — End this
    run at a campaign table — full width, at every width, not only on a phone;
    Escape or a tap outside closes it. Log
    sits top left. "Menu" is a place, not an action — the one exception to
    labels leading with a verb.
  - Above your hand: the turn marker, what to do, and your clock, on one line,
    the sentence beside the marker. The row is one line tall, always; the
    sentence hangs from its bottom, out of flow, so a two-line message grows
    upward into the play area's open space and nothing on the board moves —
    sized to its content, a second line pushed the whole board up a short
    phone. Its last line sits `--space-lg` above the cards, so it reads as
    belonging to the hand. The pip centres on
    that last line. A picked card rises 18px on a phone (26 with a mouse), clear
    of the text.
  - The trick and its captions are centred together in the play area (it keeps
    `--space-xl` clear at its foot for the captions that hang below the cards),
    so the trick sits between the seats and the hand's group, not on top of the
    read-out.
  - The hand stands off the actions below it by about half the gap the seats
    keep from the corner buttons: the hand's own box already holds room under
    the cards for one to lift, so the measured air is even. A short screen
    scales it down in step with the top gap.
  - Below the hand, two rows: Sort
    and Clear, then Pass and Play cards at half the width each, Play on the
    right where a right thumb rests. Touch buttons stand `--space-md` apart,
    across a row and between the rows — a step wider than a mouse's
    `--space-sm`, because Pass beside Play is the slip that costs a trick.
  - Your hand is nearly flat (an arc spends width on turned corners, and width
    is what each card's touchable strip is made of).
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
  A pile's column is the width of that box and nothing else, and its label is
  one line whatever it says, so taking a pile — which swaps "Pile 2" for the
  name of whoever took it — never moves the other three.
  The stack casts one shadow as a single block — a drop shadow of the whole
  stack's outline, two pixels straight down with the same soft edge as the
  table's cards — rather than the bottom card's own, which stuck out from
  under one corner of the lean.
- **Match length** sits in both lobbies between your name and the seed, as an
  **option set**: an outlined box of labelled rows, one per kind of answer —
  _Points_ 15 · 30 · 50 and _Rounds_ 5 · 10 — divided by a `--table-hi` rule,
  with the sentence under it saying what the chosen option means. Chips carry
  the bare number; the row says what it counts.
- **Host-only settings** (computer difficulty, match length) look identical for
  everyone. For anyone but the host the chips are disabled, the chosen one keeps
  a gold outline and gold text (no fill), and a "Host only" tag — a 5×5 pixel
  lock and `--text-xs` `--dim` label — sits beside the setting's heading ("Host
  sets difficulty" beside Seats).
- **The scores screen** carries a match line above the round's note ("Round 3 of 10. …" or "First to 30 points wins the match."). When the round decides the
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
- **Disabled buttons say why, at the pointer.** Pointing a mouse at a disabled
  button shows a short reason beside the cursor, placed as the copy toast is —
  text with an ink drop shadow, no box — in bone rather than gold, since it
  explains rather than confirms. It leaves with the shared `--fade-out`. Any
  disabled control opts in with `data-hint`; keep the reason to a few words
  saying what would enable it: "Wait for your turn", "Pick cards to play",
  "No cards picked", "Only the host can change this", "Not connected to the
  table". Mouse only — a finger has the read-out and the rules sheet.
  Only the control actually on top of the pointer answers: one behind an open
  dialog, menu or the rules sheet stays quiet.

- **The trick has no zoom cursor.** Pointing at it opens it, so a magnifier
  promised a click that does nothing more; a scrollable opened trick shows the
  grab hand.
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
- **A lobby's seat row stays one line on a phone** by getting smaller, not by
  wrapping: the seat and the name read a size down, the chips take `--text-xs`
  and tighter padding, and **Sit here becomes the chair icon** — square, as wide
  as a phone's buttons and as tall as the chips it shares the row with, and
  still announced as "Sit at Seat 3". The row keeps "(CPU)" — which seat a
  computer holds is worth the width. What gives way as the row tightens is the
  player's name on the right, never the seat it belongs to. A row is as tall as
  its controls and no taller.
- **A lobby is a stack of groups**, one `--space-group` apart at every width:
  the seats (their title and the line describing it `--space-xs` apart, as one
  thing), your name, the match length, the seed, the start group. Fields are
  spaced from each other, not from what follows them, so the last hands over to
  the start group without doubling. Inside a group, `--space-xs` to
  `--space-sm`, and on a phone `--space-sm` above and below each seat row so one
  row reads clear of the next. The main menu's groups use the same spacer.
- **An option set's rows share one name column** (nine units) with `--space-md`
  to the options, so "Points" and "Rounds" keep clear of their chips and every
  row's options start on the same left edge. **Every option is the same size** —
  as wide as a control is tall — whatever it says, so "5" and "10", "15" and
  "50" read as a set of equal choices.
- **Lobbies share one frame** (`LobbyLayout`): Leave top left, the seats, the
  options common to both modes, the options unique to one, then the
  primary action. Only mode-unique options differ in layout.
  - Both: seats with computer difficulty, seed.
  - Every seat row has the same order:
    `Seat N (You | CPU | Player)` · **Sit here** when a computer holds it ·
    on the right, the difficulty chips for a computer or the person's name.
    The bracket is `--dim`; your own row keeps the gold underline.
    Every row is the same height whoever holds it, so taking a seat
    moves nothing on the screen.
  - **Taking a seat works in both lobbies**: Sit here (a plus on a phone) on
    every seat a computer holds. Alone, you swap chairs with that computer, and
    each seat keeps the difficulty it was set to. You start at seat 1 each time
    you come to the solo lobby, whatever seat you last took anywhere.
  - In a shared lobby: your name, then the match length, then the seed (at a
    table server only). Your name starts as a random common name, kept until
    you change it.
  - A shared lobby's title, top right, is its **Table code**: a small dim label
    over the code at `--text-lg`, and beneath it a flat **Copy invite link**
    button. One way to share, shown once — the code to say aloud or type, the
    link to send in a message. There is no separate invite-link field.
  - Shared tables only: taking a seat, your name, the table code and its link.

## 10a. Performance

The table draws fifty-two cards and their shadows, and it redraws while a finger
is moving. A phone is the machine to design for.

- **Size to the visible screen, not the layout one.** A phone browser's `fixed`
  box and `100vh` are the viewport with the toolbars _hidden_, so anything
  sized that way hides its own bottom edge behind the toolbar actually on
  screen. The table is sized from `--vh`, measured off `visualViewport`
  (`useViewportHeight`) and republished whenever the toolbars slide or the phone
  turns; `100svh` then `100vh` are the fallbacks behind it, and the rules sheet
  uses `svh`. Their bottom rows — Pass, Play cards, Close — are always
  reachable. `dvh` is the wrong tool here: it changes as the toolbar slides,
  which moves buttons under a reader's thumb.
- **A short screen gives up air, never a control.** A phone browser leaves the
  board 660px or less (an iPhone 12 in Safari: 664). Under 750px, and again
  under 600px, the table spends less on the gap below the corner buttons, the
  seats' fans, the room a card lifts into and the gaps between rows — in that
  order — so the hand keeps its cards and Pass and Play cards keep their reach.
  Sizes stay put; spacing gives. Below 600px the seats drop the `(CPU)` line
  (the table's seats only — a lobby keeps it) and Sort's pips sit beside their
  button, the one place they do.
- **The board takes no page gestures.** `touch-action: none` on the table and
  `overscroll-behavior: none` on the page: a drag across the board picks cards
  and can never scroll, bounce or pull-to-refresh the page. What opens _over_
  the board — the log, the rules sheet — still scrolls by finger
  (`touch-action: pan-y`, `overscroll-behavior: contain`).
- **No 3D.** Every card transform is flat (x, y, rotate, scale), so the table
  has no `perspective` and nothing sets `transform-style: preserve-3d`: both
  cost a 3D rendering context per card and bought nothing.
- **One render per frame.** Pointer moves arrive faster than the screen
  redraws; a drag writes its state to a ref and schedules a single render on the
  next frame (`useTableDrag`).
- **Draw a card only when that card changes.** Cards and their shadows are
  memoised on primitive props and their handlers are a bundle made once, so a
  gesture re-renders the cards it touched rather than all fifty-two. The card
  layer's `AnimatePresence` sets `presenceAffectsLayout={false}` — nothing in
  it uses layout animation, and at the default every child gets a new context
  on every render, which re-rendered every card straight through its memo. The
  seats, the middle of the table and the log are memoised as well: picking
  cards changes none of them.
- **Card art is assets, not markup.** The suit pips and the back's lattice are
  SVG files in `assets/cards`, laid on as a CSS mask over the card's own
  colour. Drawn inline they were a dozen to two dozen rects each, over a
  thousand elements across the table; as masks each is one box, and red,
  black and dimming still come from the palette. Custom card art replaces
  those files.
- **Never measure in the middle of a render.** A caption centres itself from a
  resize observer, which is told its width after the browser's own layout,
  rather than reading `offsetWidth` as it mounts and forcing a layout of the
  whole table on every play.
- **Blur costs a frame.** A filter over a layer of moving shapes is an offscreen
  buffer redrawn every frame: shadows blur per shadow, and the opened trick's
  plate is a flat scrim rather than a backdrop blur.
- **Measure before and after**, throttled: the phone-sized table went from 36fps
  (20 slow frames in 2.5s) to ~52fps (5) while dragging along the hand, at 4x
  CPU throttling, and with the changes above to 60fps with none, at half the
  script time; the deal's longest frame fell from ~270ms to ~200ms, and the
  table holds about a third of the elements it did.

## 11. Seeds

One format everywhere: two groups of four from the table-code alphabet
(`ABCD-2345`). The same seed deals the same four piles whether you play alone or
at a shared table — which pile you get still depends on the blind pick.
Generated and normalised only by `@big-two/session`'s `seed.ts`.

The seed in the table's top bar is always the seed that dealt it. Playing
alone, returning to the lobby deals a fresh seed; to replay a deal, copy the
seed first.

## 12. Copying

- **Codes copy on click; everything else copies with a button.** The table code
  and the in-game seed are `Copyable` buttons styled as text. They hover the
  same way: **pointer cursor, and only the value fades to 60%** — never its
  label (mark it `copyable__text`). The seed _field_ is somewhere you type and
  select, so it copies with a flat copy icon button beside it. The invite link
  is never shown — a whole URL is noise — and copies with the flat "Copy invite
  link" button beneath the table code.
- **The toast** is just a check and the words, in gold with an ink drop shadow —
  no box. It appears instantly at the pointer, follows it for 1.4s, and leaves
  with the shared `--fade-out`. Keyboard
  copies place it over the element. It is also announced politely to screen
  readers. Messages: "Seed copied", "Code copied", "Link copied".

## 12a. Main menu

Two games under one roof, each a group headed by its name alone, in bone:
**Mythic** — Continue run (its class, depth and gold on a dim line under it)
and Start a new run, which asks first; or Start a run — and **Classic** —
Continue game when there is a saved match, Play on your own, Play with
friends, and the name and code to join a table. The name and code fields are
edged in weathered stone (`--field-edge`), lit toward gold on hover and gold
on focus, as the buttons beside them answer the pointer. How to play stands apart at the end. Every option is the same
width — sized for its longest label, not the column — with its label at the
left edge.

A shared Classic table's lobby has a **Turn timer** beside the match length:
On (each person has a time limit, and the table plays for anyone who runs
out) or Off (nobody is hurried). The host's call, before the first deal, in
the same outlined set of chips, read-only with "Host only" for everyone else.

**The corner Menu** is a square button with a three-bar icon ("Menu" to
assistive technology), top right on every played screen — every table at
every width, and every campaign screen — mirroring the Log top left. At a table
it holds How to play and Leave table — or, at a campaign table, End this run in
its place; between campaign tables, **Save and quit to main menu** (Back to
main menu before a run) and End this run. Ending a run always asks first. With
Leave table in the Menu, the row under the hand no longer repeats it.

## 13. Campaign

A separate mode, reached from **Start a run** or **Continue run** on the menu; the rules and numbers
are in `DESIGN_SPEC.md` (Section 9 for what is built). Playing on your own and
with friends are untouched by it.

- **Campaign screens use the whole viewport**, as game screens do: the
  corner Menu top right, as at the table, and the content across the width,
  centred when it is short.
- **The run bar** holds what a run is, on every screen between tables: your
  class (emblem and name, in its colour), your gold — its largest figure,
  because it is your life and your stake at once — your depth (room and
  "2/5"), how many Medallions you carry (their names and effects on point or
  tap), and the Menu. It floats along the foot of the screen, clear of its
  edges: an ink edge with a thin gold rule inside it, cells split by
  hairlines, so it reads as the frame the screens sit in. On a phone it drops
  the class name and the room's name. The Menu is not in it: the Menu is in
  the top-right corner on every campaign screen, as at the table.
- **The descent is a map**, read from the top down: the gate you came in by,
  four depths of four to seven nodes, and the Hollow Throne at the bottom —
  twenty-four nodes, drawn fresh for every run. The depths are numbered, not
  named: names are kept for acts, when there are some.
  Each node is a small pixel picture of what waits there: a candle for an
  ordinary table, a skull for an elite one, a purse for the Bone Merchant,
  the throne itself (a doubled frame). Paths join each node to the one or
  two below it. The way you came is bone, with a caret over where you stand;
  the ways open now are gold and dashed, their nodes on gold dashed frames;
  a node you cannot afford has a red dashed frame; everything else is the
  colour of the stone, and the ways you did not take fade.
- **Point to preview, click to select, then confirm.** Every table you could
  go to next is already dealt when you arrive on the map, so pointing at its
  node previews all of it in the panel beside the map (under it on a phone):
  its depth and kind, its buy-in, ante, tribute and hands — Buy-in and Ante
  each saying on point how their gold is paid out (70 / 25 / 5%, nothing to
  last), and one line under them for what else winning brings, no more than
  it truly gives ("Win it for a chance at a Medallion"; "…for a choice of
  two Medallions" at an elite table) — and who sits there
  — each with class, temperament, gold and any Medallions they carry.
  Clicking a node selects it (a bone outline); only the panel's button —
  **Pay 80 and sit down**, **Go down to the merchant** — commits. A seat you
  cannot fully pay for is marked, in a note edged in red, as a **short
  seat**: what you put in, the three antes you keep, and the most the prize
  can pay you. With nothing selected, the panel holds the three steps of how
  a table works.
- **The map runs as tall as its rows need** — taller than the window — so the
  page scrolls and the deep's ruins rise behind it — only their tallest tops
  show at first, and they rise never faster than 30% of the page, so they
  read as far behind it; the key and the panel beside it
  stay exactly where they sit, and the world bar stays clear. The ruins are a
  gothic cathedral, its tower snapped, gable half fallen and rose window
  broken; a needle spire with a leaning cross; a fallen arcade; flying
  buttresses; a snapped bell tower; a graveyard and a dead tree — eroded and
  cracked, with a faint pale light in a few windows and over the graves.
- **The compendium** keeps every Medallion you have come across, in any run:
  a Medallion is found once the game has shown it to you — carried, on the
  Bone Merchant's table, among a won table's spoils, in a Reliquary's coffers
  once opened, or on a player at a table on offer. It opens as a sheet like
  How to play, from the main menu's Mythic group ("7 of 16 Medallions found"
  under it) and from the menu on every campaign screen and campaign table.
  Medallions stand by pool — each class's, then any class's — rarest last;
  a found one shows its medal in its rarity's colour, its name and rarity, and
  what every level does; one not yet found is a dashed, dim "???". Saved
  apart from the run (`bigtwo:compendium`), so it outlasts every run.
- **A run is welcomed** before its map: a dark screen, the world's name dim,
  "Welcome, Pale Bell." large, a line of who you are — and no button to aim
  for. Last, at the foot, a quiet "Click to descend" ("Tap" on a touch
  screen) over a pixel chevron drifting downward; the whole screen is the
  way down, and so are Enter, Space and Escape. The fall follows: dark bands
  rushing up, the welcome torn upward, the map rising to meet you.
- **The version** sits in the bottom-left corner of every screen, 10px and
  dim ("v0.3.0"), with the commit it was built from on point — there for
  telling builds apart when something is reported. It is the app's
  package.json version: bump it with each release.
- **The page scrolls smoothly.** A wheel notch sets where the page is headed
  and it eases there; anything that scrolls on its own (the node panel, the
  log, How to play), trackpads, touch and keys are left as they are, a move
  made some other way mid-glide wins, and reduced motion turns it off.
- **The map stays still, and the tree is centred.** The screen reads from
  the top, so the panel changing height as nodes are pointed at moves
  nothing; on a wide screen the tree sits on the screen's centre line, with
  the panel on its right and, balancing it on its left, a **key**: each
  node's picture and what it is, and the two kinds of path (gold dashed:
  ways open to you; bone: the way you came).
- **The world bar**: along the top of every campaign screen of a run, on the
  Menu's line and ruled under, the world's name — **the Hollow Deep** — and
  your depth in it ("Depth 1 of 5"). There is no other header on the map;
  the map fills the height left between the world bar and the run bar.
- **Classes are dealt as a hand of cards**: four real cards in a gentle fan,
  each a face in its class's own colour — dark like the felt, framed like the
  table's cards — with its ranks in the corner, its figure large in a
  window at the centre and its name across the foot. The figures are painted
  in the manner of the Ruined King and the Nameless King: dark steel and
  slate, faces lost in shadow, silver hair, ember, and a muted spectral light
  over all four — a rim on the lit side, a mist at the hem — never neon. The
  Wanderer is a hooded wanderer with a lantern; the Courtier a porcelain mask
  under a steel circlet, silver hair either side; the Tyrant a hood under a
  steel crown with spectral points and a slit of light for a face, white hair
  torn sideways by the wind. Each stands against the same storm-grey sky, a
  band of far ground and a low mist, and differs from the others only by
  its shape and its one accent in its class's colour. All four wear the same steel cloth; their colour is in their
  equipment — the lantern's flame, the gold circlet and violet gem, the ember
  crown and its blood stones. The fourth card is sealed: the same card, its figure a shroud
  with nothing inside but dark and one pale eye, "?" for its ranks and
  "Sealed" for its name in the Seer's grey-teal — shown at under half
  strength, plainly not to be picked. The card you point
  at lifts out of the fan and the picked one lifts further, on an eased rise,
  and takes the gold edge and the raised shadow — the same motion and the same
  edge as a card picked from your hand at the table; pointing at a card never
  lowers the picked one. The fourth, sealed, is a class not yet open to you. What the
  picked class does is read in a panel under the hand, the hand large and
  centred above it with clear air between. On a wide screen the panel's
  groups sit two by two, told apart by space alone — no rules between them —
  so the whole class fits in view: its name and cards;
  its **class play** — rule, and its price at the first table — beside its
  figures (starting gold, and its **ante share** with a line on what it means:
  cheap hands and small wins, or dear hands and big wins), which carry their
  own labels and have no heading over them. The ante share's note works one
  through, and says the ante on a map node is already the player's own — the
  node's Ante note breaks that figure down: depth, kind of table, ante share; and **how it plays** beside the
  profile. It is read — or, while you point at another
  card, what that one does: its named rule, how it plays, and a three-line
  profile (Fortitude, Avarice, Guile) in which every class
  scores the same total and leads on one line, so the choice is a way to
  play, never the bigger number. **Begin as the …** is not in the panel: it
  sits alone at the bottom right of the screen, on the frame's edge, where a
  game puts its "embark" — the one thing to press once a class is chosen. Switching classes fades the new details in,
  and each line keeps room for its longest class, so nothing on the screen
  moves.
- **Each class has one accent colour** — rust Wanderer, muted violet Courtier,
  blood Tyrant, grey-teal Seer — and it is used for exactly two things: the
  class's name everywhere (the cards, the seats, the lineups, the run bar)
  and one small detail inside its portrait (the lantern's flame, a gem and
  collar trim, the crown's stones, a glint). Everything else is shared: every
  class card has the same face, the same steel edge and the same storm-grey
  sky behind its figure, and every portrait is painted from the same palette.
  The classes differ by shape, name, that accent and their own wording.
- **Ending a run is quiet and asks twice**, from every screen of a run; it
  throws away everything the run has won and goes back to the class cards.
- **How a table works** is three numbered steps on the first room's screen —
  buy in, pay the tribute, win a Showdown — because they happen in that
  order: on the buy-in of your first table. The merchant's wares and a won
  table's spoils sit side by side on a wide screen, to be compared across,
  each with its own button (Buy, Take it).
- **Medallions are named with their level** ("Uprising II"), in gold for a
  common or legendary one and bone for a rare one, with what it does at
  that level under the name. The Bone Merchant tags each offer with its
  rarity — and "any class" for the few any class can carry — or "Level up"
  for one you carry. A won ordinary table has a chance of leaving **one
  Medallion** ("Among the winnings": Take it, or Leave it) — and the hand's
  end says "No Medallion was left on this table" when it leaves none; an
  elite table offers **the spoils**, a choice of two (Take neither beside
  them). Each is new, a level up, or one a beaten player carried that you can,
  tagged "Spoils" and saying whose it was.
- **Numbers are stats**: a small dim label over its value, larger, in bone —
  or in gold, larger still, for a number that changes every hand. A node on
  the map shows its buy-in, ante, tribute and hands.
- **Game words explain themselves.** In rules and Medallion texts, and on
  the stats' labels, every word the game uses in a sense of its own —
  single, pair, triple, straight, pair chain, four of a kind, bomb, chop,
  lead, ante, pot, buy-in, table prize, tribute, Showdown, class play,
  Medallion, elite — has a dotted underline, once per line. Pointing at it,
  tabbing to it or tapping it shows its meaning in one sentence, the same
  sentence everywhere. The note floats over the page, beside the word and
  kept inside the screen, so it never widens or lengthens the page. The
  sentences, and the one word to use for each thing, are in GLOSSARY.md.
- **At the table** the board is the ordinary one, framed top and foot. The
  read-out along the top is three instruments on two shared rows — a label,
  then a line holding its value — with a hairline between instruments,
  balanced about the middle: the first pressed right, the pot centred, the
  last pressed left, each reading toward the pot. Each is explained on point
  or tap:
  - **Showdown in** — the count ("4 hands"; "Now" at the Showdown), then a
    block a hand, the last ringed in gold; label and line end together at the
    gauge's right edge. The last block is a word to point at: its note says
    what the Showdown is, and that coming to it holding the tribute wins the
    table before it is dealt.
  - **Pot** — this hand's pot, and beside it, small, the **Table** (the
    table's buy-ins): the two amounts a seat can win here, both paid 70% / 25%
    / 5%. "Pot" says what the two are, and what first place would take of each at
    the amounts in them now — "Finish this hand first: 112 from the pot",
    "Win the table: 224 from the table";
    each amount says where its own gold came from — who put what into this
    pot (ante, class play), and who bought in to the table.
  - **Tribute** — "30 of 70": what you have won here, of what the table asks;
    "Tribute paid" in gold, blinking with the turn marker, once it is held.
    Every value is the same size, with no shadow: counts in bone, gold in gold
    with a coin, units small and dim. The top seat's name sits 48px under the
    read-out.
- **Gold is seen moving.** Every amount of gold — your gold in the run bar,
  the pot and the table in the read-out, each seat's gold — carries a pixel
  coin, counts to its new value when it changes, and the change itself rises
  off it (+59 in gold, −30 in red): the buy-in leaving your gold as you sit
  down, each ante as the cards are dealt, the pot filling and paying out.
  Amounts that live across screens remember what was last shown, so your gold
  counts on from the map to the table rather than starting over.
- **The foot mirrors the top**: the run bar centred, 48px above the foot of
  the screen — as far as the top seat's name is below the read-out — with Sort
  and Clear hanging off either side of it on its centre line. The bar is in the
  same place on the map, at pile select and at the table. At a table it
  carries your class (emblem and name), your gold, your class play — its name
  and what it costs you now ("Uprising · 15 gold", or "free"), its rule on
  point or tap — your depth and your Medallions. At pile select your gold is
  shown before this hand's ante, which leaves it as the cards are dealt. On a
  phone the foot gives way to Sort and Clear by the hand, with the class's
  emblem and name between them.
- **At pile select you are your run's name** ("Sunk Wake" took a pile), not
  "(you)": two words drawn from the run's seed, which a run that takes the
  throne keeps as its Vestige.
- Each seat shows its gold where points
  would be — what it has not put into this pot, as yours is shown — and its
  class, in its colour, where a practice table says "(CPU)"; a long name ends
  in an ellipsis inside its seat. Every seat's name sits 16px over its cards.
- **A play only a passive allowed is marked**: its name ("Decree") flashes
  over the trick in the class's colour, and its cards keep an edge and glow of
  that colour, instead of the gold edge, while they stand on top. Once another
  play covers them they step back with the other beaten plays, edgeless, and
  take the edge again when the trick is opened out to be read.
- **Your class's play is pointed out**: on your turn, the cards that make a
  play only your class allows — never plays the base rules allow anyway —
  take your class's edge and glow in your hand and
  nudge up two pixels every few seconds — so a Tyrant holding a 2 against a
  short straight sees the chance.
- **Seat states keep the seat's colours** at a campaign table: its turn is a
  gold underline that sweeps out under the whole label, name and class, in
  step with the turn marker: out in four steps while the marker is lit, dim
  with it for the other half of its 1.4-second beat,
  and a seat that has passed keeps its "passed" line while its cards drop into
  shadow — the dimming a beaten play takes, by tone rather than transparency.
  Your own hand is never dimmed: you still arrange it while you wait.
- **The end of a hand** replaces the round-end standings with the reckoning:
  each seat in finishing order with what it gained or lost and its gold, any
  any-class Medallion that moved gold ("Tithe: Crowe took 90 from the
  table"), who went broke and who sat down, and what comes
  next — Next hand, Call a Showdown once you are past the Mark, or the
  table's end.
- Leaving mid-hand, or reloading, counts as finishing that hand last, and the
  leave confirmation says so.
