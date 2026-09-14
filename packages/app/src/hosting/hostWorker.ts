import { decodeClient, encodeServer } from '@big-two/protocol';
import { Table, type Connection, type LobbySnapshot } from '@big-two/server/table';

/**
 * The table, running in the host's browser.
 *
 * Exactly the `Table` a table server runs — joining, seats, the host, clocks,
 * stand-ins — with the fair deal switched on (9.18). The page that started this
 * worker only ever passes strings in and out; the game state and every hand
 * stay in here.
 *
 * The limits a server applies at its socket layer are applied here instead:
 * a message size cap and a per-connection rate.
 */

type ToWorker =
  | { type: 'init'; code: string; seed: string; restore?: LobbySnapshot }
  | { type: 'open'; id: string }
  | { type: 'data'; id: string; raw: string }
  | { type: 'close'; id: string }
  | { type: 'shutdown'; reason: string };

const MAX_MESSAGE = 16 * 1024;
const MESSAGES_PER_SECOND = 20;

// Typed by hand rather than through the WebWorker lib, which cannot be loaded
// alongside the DOM lib the rest of the app compiles against.
const scope = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
};

let table: Table | null = null;
const lines = new Map<string, { connection: Connection; windowStart: number; count: number }>();

scope.onmessage = (event) => {
  const message = event.data;
  switch (message.type) {
    case 'init': {
      // The page keeps the latest lobby, so a reload can reopen it (9.18).
      const report = () => {
        if (table) scope.postMessage({ type: 'lobby', snapshot: table.lobbySnapshot() });
      };
      table = new Table({
        code: message.code,
        seed: message.seed,
        fairDeal: true,
        onChange: report,
        ...(message.restore ? { restore: message.restore } : {}),
      });
      report();
      return;
    }

    case 'open': {
      const id = message.id;
      lines.set(id, {
        connection: {
          id,
          send: (raw) => scope.postMessage({ type: 'send', id, raw }),
          close: () => scope.postMessage({ type: 'drop', id }),
        },
        windowStart: Date.now(),
        count: 0,
      });
      return;
    }

    case 'data': {
      const line = lines.get(message.id);
      if (!line || !table) return;
      const now = Date.now();
      if (now - line.windowStart >= 1_000) {
        line.windowStart = now;
        line.count = 0;
      }
      if (++line.count > MESSAGES_PER_SECOND || message.raw.length > MAX_MESSAGE) {
        line.connection.close();
        return;
      }
      const decoded = decodeClient(message.raw);
      if (!decoded.ok) {
        line.connection.send(encodeServer({ type: 'REJECTED', reason: decoded.reason }));
        return;
      }
      table.handle(line.connection, decoded.envelope);
      return;
    }

    case 'close': {
      const line = lines.get(message.id);
      if (line && table) table.disconnect(line.connection);
      lines.delete(message.id);
      return;
    }

    case 'shutdown':
      table?.close(message.reason);
      scope.postMessage({ type: 'closed' });
      return;
  }
};
