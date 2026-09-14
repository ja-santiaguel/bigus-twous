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
| Your selection cannot play | `--alert` read-out |
| You have passed | `--alert` read-out: "Passed — out until the table clears" |
| Your hand is empty | place medal + `--bone-dim` read-out: "Your hand is empty" |
| The table refused an action | `--alert` read-out |
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
- **One gap between controls: `--u`** — a field and its icon buttons, the
  utility row, a row of action buttons.
- Floating controls sit `--u` in from the viewport edge, never flush against it.

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
- **Not editable** — the invite link, a disabled field: the lighter `--table`.

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

Page layers are the `--layer-*` tokens. Inside the card layer, cards stack by
the constants in `lib/zoneGeometry.ts` (zones 10–60, opened trick 130–150,
`HOVER_Z` 800, `DRAG_Z` 900).

## 9. Motion

- Stepped (`steps(2)`) for anything that is simply on or off: controls, markers,
  clock segments.
- Short ease-out for anything that travels: cards, the trick opening.
- Clocks change tone at a third and a sixth of their allowance — 20 and 10
  seconds of a turn, 5 and 2½ of a pile pick.
- One pulse per urgent state (turn marker, a clock's last sixth), stepped, and off
  under `prefers-reduced-motion`.
- **The bomb moment** is the one celebration during play: a gold flash across
  the table (3 steps), a shake of one or two art pixels (360ms), and a callout
  over the middle — "Chopped!", "Counter-bomb!" or "Four 2s!" (bone) at twice
  `--text-lg`, popping in over 3 steps, with a line saying who did it. It holds
  for 1.8s. Only for a bomb on a 2, a bomb on a bomb, and four 2s; read from the
  event log, never replayed on arrival. Reduced motion keeps the words only.

## 10. Layout

- **The title card** is the in-game card sprite at two art pixels per pixel —
  `--px` doubled on the card — so its border and inner edge match the table's
  cards. No caption.
- **The main menu title** sits `1.5 × --u` above the description, and is pulled
  left by its glyph side-bearing so its ink shares the description's left edge.
- **How to play** is one sheet (`RulesSheet`), opened from the main menu
  ("How to play", raised) and from the table (the `help` icon floating top left,
  the log toggle's twin: same inset, height, surface and shadow, but square).
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
- **On phones** the side seats share a row under the top seat; the top seat
  drops its nudge toward the centre there.
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
- **The pile ceremony**: each pile's box holds the cards, their two-pixel lean
  and the bottom card's two-pixel shadow, so the shadow sits inside the pile's
  outline rather than across it.
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
  (while a solo save exists), Play on your own (primary), Play with friends
  (default raised) and How to play (quiet, a different surface, so reference does
  not read as a third way to start); then a ruled-off row with your name, a table
  code and Join. A button whose label changes while it works ("Opening…") keeps
  the width of its longer label.
- **Inline help** is a bracketed pixel "[?]" (11×5) beside a field label — the
  brackets mark it as pressable, where a bare "?" reads as punctuation. `--dim`,
  brightening to bone while its note shows, with the shared gold focus ring.
  Hovering or keyboard focus shows a floating note below the label; a click or
  tap pins it; a second click, Escape or a click elsewhere closes it. The note —
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
  - In a shared lobby: your name, then the seed, then the invite link. Your
    name starts as a random common name, kept until you change it.
  - A shared lobby's title, top right, is its **Table code**: a small dim label
    over the code at `--text-lg`.
  - Shared tables only: taking a seat, your name, the invite link, the table
    code.

## 11. Seeds

One format everywhere: two groups of four from the table-code alphabet
(`ABCD-2345`). The same seed deals the same four piles whether you play alone or
at a shared table — which pile you get still depends on the blind pick.
Generated and normalised only by `@big-two/session`'s `seed.ts`.

The seed in the table's bottom bar is always the seed that dealt it. Playing
alone, returning to the lobby deals a fresh seed; to replay a deal, copy the
seed first.

## 12. Copying

- **Codes copy on click; fields copy with a button.** The table code, the
  in-game seed and the invite link are `Copyable` buttons styled as text. They
  all hover the same way: **pointer cursor, and only the value fades to 60%** —
  never its label or the box around it (mark it `copyable__text`). The invite
  link is a `Copyable` in the shape of a field (`.field__static`), not an input.
  The seed *field* is somewhere you type and select, so it copies with a flat
  copy icon button beside it instead of on click.
- **The toast** is just a check and the words, in gold with an ink drop shadow —
  no box. It appears instantly at the pointer, follows it for 1.4s, and fades
  over two steps. Keyboard
  copies place it over the element. It is also announced politely to screen
  readers. Messages: "Seed copied", "Code copied", "Link copied".
- A copyable value shown as a field says so in its hint: "Click to copy."
