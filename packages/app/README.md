# @big-two/app

The React client. It renders tables and turns clicks into intents; it never
runs the rules itself.

## Shape

- **`table/`** — one `TableClient` interface, two implementations.
  `localTable` wraps a `GameSession` in this tab (playing alone);
  `remoteTable` talks to the table server over a WebSocket, reconnects with
  backoff and reclaims its seat with a token. Both push complete snapshots —
  the screens cannot tell them apart.
- **`store/gameStore.ts`** — Zustand. Unpacks snapshots into what the screens
  read, and holds purely presentational state: selection, hand order, sort.
- **`screens/`** — `MainMenu`, `Lobby` (alone), `WaitingRoom` (shared, before the
  deal), `Table`.
- **`components/table/CardLayer.tsx`** with **`lib/cardScene.ts`** and
  **`lib/zoneGeometry.ts`** — every card on the board is one DOM node, placed by
  transform into measured zones, so a card travels between hand, trick and
  discard pile rather than being recreated. Opponents' cards are anonymous
  placeholders; played cards carry no rank in the DOM.
- **`styles.css`** and **`design/`** — the pixel design system. See
  [`DESIGN.md`](../../DESIGN.md) before changing anything visual.

## Configuration

| Setting | Where | Purpose |
|---|---|---|
| `VITE_TABLE_SERVER` | `.env.development`, or at build time | Where the table server is when it is not this page's origin. |
| `?server=` | URL | Overrides the above at runtime, and switches that visit to the table server. |
| `VITE_HOSTING` | build time | `server` to use the table server for shared tables. Default `browser`. |

Production normally needs neither: the server serves this build and the tables
from one origin.

## Browser storage

| Key | Store | Holds |
|---|---|---|
| `bigtwo:name` | `localStorage` | Your name (a random common one until you change it). |
| `bigtwo:solo` | `localStorage` | The solo match in progress, saved after every turn. |
| `bigtwo:seat:<code>` | `sessionStorage` | Seat token for a shared table — per tab, so two tabs are two players. |

## Commands

```bash
npm run dev         # Vite dev server
npm run build       # typecheck + production build into dist/
npm test            # vitest
npm run typecheck
```

## Browser-hosted tables

`hosting/` runs a shared table in the host's browser. `startHosting` registers
the table code with PeerJS, starts `hostWorker` (the server's `Table`, in a
worker) and relays each guest's WebRTC messages to it; `peerSocket` is a guest's
side, shaped like the WebSocket `remoteTable` already speaks. Every client
answers the table's sealed shuffle and checks each round's record
(`@big-two/session`'s `fairness.ts`).
