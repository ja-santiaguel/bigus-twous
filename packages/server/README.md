# @big-two/server

The authoritative table server. Every shared table runs a `GameSession` here;
clients send intents and receive a complete, per-seat snapshot after every
change. No client is ever sent another seat's cards.

## Layout

- **`table.ts`** — one table and the people at it: joining, seat tokens,
  choosing seats, the host, the turn clock, the countdown between rounds,
  stand-ins, and holding a seat for someone who dropped out. No sockets: a
  connection is anything that can be sent a string, so all of it is tested in
  memory.
- **`tables.ts`** — the registry: table codes, and sweeping tables nobody is at.
- **`ws.ts`** — the transport: HTTP routes, WebSocket upgrades, limits, and
  serving the built client.
- **`main.ts`** — reads configuration and starts. Nothing else.

## Endpoints

| Route | |
|---|---|
| `POST /tables` | Opens a table. `{ code }`. |
| `WS /table/<code>` (or `/?table=<code>`) | Joins a table. Messages are defined in `@big-two/protocol`. |
| `GET /healthz` | `{ ok, tables }`, never cached. |
| `GET /*` | The built client, when `CLIENT_DIR` / `--client-dir` is set. |

## Timings and limits

| | Default |
|---|---|
| Turn clock (people only) | 60 s, then pass or the first legal play |
| Pile pick (people only) | 15 s, then a remaining pile is picked for them |
| Countdown between rounds, once anyone is ready | 30 s, then deal with stand-ins |
| Seat held after a drop or mid-game leave | 2 min |
| Empty table kept | 2 min |
| Heartbeat | 30 s |
| New tables per address | 10 / min |
| Open tables | 500 |
| Message size | 16 KB |
| Messages per connection | 20 / s |

All are options on `serve()`, `TableRegistry` or `Table`; tests inject a fake
clock rather than waiting.

## Configuration

`PORT`, `CLIENT_DIR` (or `--client-dir`), `ALLOW_ORIGINS`, `TRUST_PROXY` — see
the root [README](../../README.md#configuration).

## Running

```bash
npm run start      # tsx src/main.ts
npm run dev        # with watch
npm test
```

## Browser-hosted tables

`Table` is also what a browser-hosted table runs — in a web worker in the host's
page (`packages/app/src/hosting/hostWorker.ts`), imported as
`@big-two/server/table`. There it runs with `fairDeal: true`: deals come from a
shuffle every connected seat contributes to, and each round's full record is sent
to every seat to check (Section 9.18). A table server leaves `fairDeal` off.
