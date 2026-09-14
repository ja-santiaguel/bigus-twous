# Big Two (Tiến Lên)

A pixel-art card game for the browser: Tiến Lên, the Vietnamese game sold in
most places as Big Two. Play against three computers, or open a table and share
the link with friends — empty seats are played by computers.

- **Rules:** in-game *How to play* (main menu, or `?` at the table). The locked
  ruleset and its dated amendments are Section 9 of
  [`docs/big-two-architecture-proposal.md`](docs/big-two-architecture-proposal.md).
- **Interface:** [`DESIGN.md`](DESIGN.md) — tokens, controls, colour meanings,
  motion, layout. Update it with anything it describes.

## Features

- Single player against easy, medium or hard computers, with a seed you can
  share to replay a deal. A match in progress is saved in the browser and can be
  continued from the menu.
- Shared tables by link or 6-letter code, hosted in the host's own browser — no
  server needed. Every device adds to each shuffle and checks each round, so the
  host cannot rig a deal or fake a move. Players ready up and the host starts;
  the host sets difficulty and match length and can remove people before the
  first deal.
- A 15-second pile pick and a 60-second turn clock at shared tables, a 30-second countdown between rounds,
  computers standing in for anyone away, and a 2-minute window to rejoin a game
  you dropped out of.
- Matches first to 15, 30 or 50 points (30 by default), or the most points after
  5 or 10 rounds — the host decides at a shared table.
- Blind pile-picking ceremony, drag or click to play, sort by rank or by
  combination, a log of every play, and a bomb moment when a 2 gets chopped.

## Quick start

Requires Node 20 or newer.

```bash
npm install
npm run dev       # http://localhost:5173 — solo and browser-hosted tables
```

Shared tables run in the host's browser and connect through PeerJS's free public
broker, so two tabs are enough to try them. To use the table server instead, run
`npm run serve` and open `http://localhost:5173/?server=http://127.0.0.1:8787`.

## Commands

| Command | What it does |
|---|---|
| `npm test` | Every package's test suite |
| `npm run typecheck` | Type-check every package, tests included |
| `npm run dev` | Client dev server (Vite) |
| `npm run serve` | Table server, tables only |
| `npm run build:client` | Production build of the client into `packages/app/dist` |
| `npm start` | Production: one process serving the built client **and** the tables |
| `npm run build` | Compile the library packages with `tsc` (not needed to run the game) |
| `npm run simulate --workspace=@big-two/ai -- 500` | 500 headless computer-vs-computer games |

## Running in production

### Static hosting (default)

```bash
npm ci
npm run build:client      # deploy packages/app/dist
```

With browser-hosted tables the built client is the whole deployment: put
`packages/app/dist` on any static host — GitHub Pages, Cloudflare Pages,
Netlify — for free. Browsers find each other through PeerJS's public broker and
Google's public STUN servers.

### A TURN relay (recommended)

Browsers connect directly when they can. Some networks — many offices, some
mobile carriers — block that, and only a relay gets those players in. None of
the credential-free public relays worked when tested (2026-09-14: Metered's
Open Relay rejected its published credentials, freeturn.net did not resolve),
so a relay needs an account:

1. Create a free account with a TURN provider — Metered and ExpressTURN have
   both offered free tiers; check their current limits.
2. Put the TURN URLs and credentials it gives you in
   `packages/app/.env.production` (see `packages/app/.env.example`):
   `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` — or
   `VITE_TURN_CREDENTIALS_URL` for a provider that issues short-lived credentials.
3. Rebuild. The relay is only used when a direct connection fails.

Anything in a static build is visible to whoever opens it, TURN credentials
included; a provider's free quota caps what misuse can cost.

### With the table server (optional)

```bash
npm ci
VITE_HOSTING=server npm run build:client
PORT=8080 npm start
```

One Node process serves the client and runs the tables on the same origin. Use
this when no player's browser should hold the cards.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Port to listen on. |
| `CLIENT_DIR` | set by `npm start` | Built client to serve. Unset runs tables only. `--client-dir <path>` does the same. |
| `ALLOW_ORIGINS` | none when serving the client; Vite's address otherwise | Comma-separated origins allowed to open tables and sockets from another site. Only needed when the client is hosted somewhere else. |
| `TRUST_PROXY` | off | `1` to read the client address from `X-Forwarded-For` for rate limiting. Only behind a proxy that sets it. |
| `VITE_HOSTING` | `browser` | Build-time: `server` to run shared tables on the table server instead of in the host's browser. `?server=` switches a single visit. |
| `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` | none | Build-time: a TURN relay for browser-hosted tables. |
| `VITE_TURN_CREDENTIALS_URL` | none | Build-time: a URL returning ICE servers with short-lived TURN credentials. |
| `VITE_TABLE_SERVER` | page origin | Build-time: where a separately hosted client finds the tables. A `?server=` query parameter overrides it at runtime. |

### What the server does for you

- `GET /healthz` — `{ ok, tables }`, never cached. Point a host's health check at it.
- Hashed assets under `/assets/` are cached for a year; the page is always
  revalidated, so a deploy reaches everyone on their next load. Text is gzipped.
- Limits: 10 new tables a minute per address, 500 open tables, 16 KB per
  message, 20 messages a second per connection. Tables nobody is connected to
  are closed after 2 minutes.

### Launch checklist

- [ ] A host that runs one long-lived Node process with WebSocket support.
      Tables live in memory: **run a single instance**, and expect a restart or
      deploy to close every open table.
- [ ] HTTPS in front, forwarding WebSocket upgrades on the same origin (the
      client uses `wss:` from an `https:` page automatically).
- [ ] `TRUST_PROXY=1` if that proxy sets `X-Forwarded-For`.
- [ ] Health check on `/healthz`.
- [ ] Hosting the client separately? Build it with `VITE_TABLE_SERVER` and set
      `ALLOW_ORIGINS` on the server.
- [ ] `npm test` and `npm run typecheck` pass; `npm run build:client` succeeds.
- [ ] Set `og:image` in `packages/app/index.html` to the absolute URL of
      `/og-image.png` on your domain — link previews ignore relative URLs.

## Known limitations

- **The host's browser holds every hand** at a browser-hosted table. The shared
  shuffle and round checks stop a host changing the game, not looking at it.
  Use the table server where that matters.
- **The host leaving a game in progress closes a browser-hosted table.** No
  handover yet. In the lobby, a host whose page reloads gets the table back
  within 60 seconds, and guests wait for them.
- **Some networks cannot connect** to a browser-hosted table unless a TURN relay
  is configured (see above).
- **No accounts.** A seat belongs to a browser tab; a removed player can come
  back through the link as somebody new.
- **One server instance.** Nothing is persisted server-side.
- **No sound.**
- **A solo save holds the whole game**, computers' hands included, in
  `localStorage`. Solo only — a shared table never sends a client anyone
  else's cards.

## Repository

```
packages/
  engine/    Rules: cards, combos, legal moves, scoring, the turn orchestrator.
             Pure and deterministic — no DOM, seeded randomness only.
  ai/        Computer players. Sees only the redacted PlayerView.
  session/   One table: owns the GameState, runs the ceremony and turns, hands
             out per-seat views. Used by the client (playing alone) and the server.
  protocol/  Wire messages and the validator every inbound message passes.
  server/    Table server: transport-agnostic Table and registry, plus a small
             Node/ws adapter that also serves the built client.
  app/       React client. Talks to a local or remote table through one
             TableClient interface.
docs/        Architecture proposal and the locked ruleset (Section 9).
DESIGN.md    The interface's design system.
```

Package READMEs: [`app`](packages/app/README.md), [`server`](packages/server/README.md).

## Computer difficulty

The tiers are a ladder of *how much a computer notices*, not three separate
bots — `medium` and `hard` run the same evaluator with different weights.

| Tier | Behaviour |
|---|---|
| `easy` | No hand planning. Sheds the smallest legal combo it can. |
| `medium` | Plans its hand and protects that structure, sheds in bulk, keeps 2s and bombs back, passes rather than breaking a straight for a worthless trick. Does not track the table. |
| `hard` | All of that, plus card counting and urgent denial of the lead to anyone close to going out. |

Measured over seed-rotated games (25% is pure chance):

| Lineup | Result |
|---|---|
| hard vs. 3× easy | **51.8%** |
| medium vs. 3× easy | **39.2%** |
| hard + medium + 2× easy | hard **42.5%**, medium **25.9%**, easy **15.8%** per seat |

The weights in `packages/ai/src/difficulty.ts` were fitted by simulation;
`packages/ai/src/dev/tune.ts` is the sweep that derived them. They were re-fitted
when passing became a forfeit of the whole trick (§9.7).

## Rules at a glance

- 3 is low, 2 is high; suits break ties ♠ < ♣ < ♦ < ♥.
- Singles, pairs, triples, straights of 3+ (no 2s), and two bomb families: four
  of a kind, and pair chains of 3+ pairs.
- Beat the table with the same kind and size of hand, higher. Passing takes you
  out of the whole trick.
- Bombs only beat 2s: four of a kind or a 3-pair chain beats a single 2, a
  4-pair chain beats a pair of 2s, a 5-pair chain beats three 2s. Four 2s cannot
  be beaten. Holding a bomb that beats a 2 on the table, you must play it.
- Round 1 opens with whoever holds 3♠, whose first play must include it; later
  rounds open with the last winner's lowest card.
- A round runs until three players are out: 5, 3, 1 and 0 points by place.
