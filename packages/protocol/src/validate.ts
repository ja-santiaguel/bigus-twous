import { RANK_ORDER, SUIT_ORDER, type Card } from '@big-two/engine';
import {
  PROTOCOL_VERSION,
  WIRE_MATCH_POINT_TARGETS,
  WIRE_MATCH_ROUND_COUNTS,
  type ClientEnvelope,
  type ClientMessage,
  type WireMove,
} from './messages.js';

/**
 * The trust boundary.
 *
 * Everything a client sends arrives as bytes somebody else chose, so nothing
 * here assumes a shape — every field is checked before it is read. The engine
 * validates the *rules* and will refuse an illegal play on its own; what it
 * does not do is survive being handed a card whose rank is an object, or a
 * pile index that is `NaN`. That is this module's job, and the two together
 * are what let the server treat a decoded message as ordinary data.
 *
 * Hand-written rather than pulled from a schema library. The surface is a
 * dozen fields, the rules are exact (a rank is one of thirteen strings, not
 * "a string"), and a validator you can read end to end is worth more at this
 * size than one you configure.
 */

export type Decoded = { ok: true; envelope: ClientEnvelope } | { ok: false; reason: string };

/** Longest message we will even attempt to parse. A hand is small; abuse is not. */
const MAX_BYTES = 64 * 1024;

/** A move can name at most a whole hand. */
const MAX_CARDS = 13;

const RANKS = new Set(Object.keys(RANK_ORDER));
const SUITS = new Set(Object.keys(SUIT_ORDER));

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCard(value: unknown): value is Card {
  if (!isObject(value)) return false;
  // Exactly a rank and a suit, both from the real sets. Extra properties are
  // refused rather than ignored: a card carrying anything else is not a card
  // this game deals, and quietly accepting it invites a shape nobody designed.
  const keys = Object.keys(value);
  if (keys.length !== 2) return false;
  return (
    typeof value['rank'] === 'string' &&
    RANKS.has(value['rank']) &&
    typeof value['suit'] === 'string' &&
    SUITS.has(value['suit'])
  );
}

function isCardArray(value: unknown): value is Card[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CARDS) return false;
  if (!value.every(isCard)) return false;
  // No duplicates. One deck, and a repeated card is either a bug or an attempt
  // to play a card twice — neither is something to pass along.
  const seen = new Set(value.map((c) => c.rank + '_' + c.suit));
  return seen.size === value.length;
}

function isWireMove(value: unknown): value is WireMove {
  if (!isObject(value)) return false;
  if (value['kind'] === 'PASS') return Object.keys(value).length === 1;
  if (value['kind'] === 'PLAY') return Object.keys(value).length === 2 && isCardArray(value['cards']);
  return false;
}

/** A short, printable identifier. Bounded so it cannot be used as storage. */
function isShortString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function isIndex(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < max;
}

function validateMessage(value: unknown): { ok: true; message: ClientMessage } | { ok: false; reason: string } {
  if (!isObject(value)) return { ok: false, reason: 'Message is not an object.' };

  switch (value['type']) {
    case 'JOIN': {
      if (!isShortString(value['table'], 16)) return { ok: false, reason: 'JOIN needs a table code.' };
      if (value['name'] !== undefined && !isShortString(value['name'], 24)) {
        return { ok: false, reason: 'That name is not usable.' };
      }
      if (value['token'] !== undefined && !isShortString(value['token'], 128)) {
        return { ok: false, reason: 'That token is not usable.' };
      }
      return {
        ok: true,
        message: {
          type: 'JOIN',
          table: value['table'],
          ...(value['name'] !== undefined ? { name: value['name'] as string } : {}),
          ...(value['token'] !== undefined ? { token: value['token'] as string } : {}),
        },
      };
    }
    case 'CLAIM_PILE': {
      if (!isIndex(value['pileIndex'], 4)) return { ok: false, reason: 'No such pile.' };
      return { ok: true, message: { type: 'CLAIM_PILE', pileIndex: value['pileIndex'] } };
    }
    case 'PLAY': {
      if (!isWireMove(value['move'])) return { ok: false, reason: 'That is not a move.' };
      return { ok: true, message: { type: 'PLAY', move: value['move'] } };
    }
    case 'SET_SEED': {
      // Restates the session's seed pattern so the protocol depends on nothing
      // but the engine. The protocol tests hold the two together.
      if (typeof value['seed'] !== 'string' || !/^[A-Z0-9-]{1,32}$/.test(value['seed'])) {
        return { ok: false, reason: 'That seed is not usable.' };
      }
      return { ok: true, message: { type: 'SET_SEED', seed: value['seed'] } };
    }
    case 'SET_DIFFICULTY': {
      if (!isIndex(value['seat'], 4)) return { ok: false, reason: 'No such seat.' };
      const difficulty = value['difficulty'];
      if (difficulty !== 'easy' && difficulty !== 'medium' && difficulty !== 'hard') {
        return { ok: false, reason: 'No such difficulty.' };
      }
      return { ok: true, message: { type: 'SET_DIFFICULTY', seat: value['seat'], difficulty } };
    }
    case 'DEAL_SHARE': {
      const round = value['round'];
      if (typeof round !== 'number' || !Number.isInteger(round) || round < 1 || round > 100_000) {
        return { ok: false, reason: 'No such round.' };
      }
      if (typeof value['share'] !== 'string' || !/^[0-9a-f]{64}$/.test(value['share'])) {
        return { ok: false, reason: 'That is not a shuffle share.' };
      }
      return { ok: true, message: { type: 'DEAL_SHARE', round, share: value['share'] } };
    }
    case 'SET_MATCH': {
      const rule = value['rule'];
      if (isObject(rule) && Object.keys(rule).length === 2) {
        if (rule['kind'] === 'points' && (WIRE_MATCH_POINT_TARGETS as readonly unknown[]).includes(rule['target'])) {
          return {
            ok: true,
            message: { type: 'SET_MATCH', rule: { kind: 'points', target: rule['target'] as number } },
          };
        }
        if (rule['kind'] === 'rounds' && (WIRE_MATCH_ROUND_COUNTS as readonly unknown[]).includes(rule['count'])) {
          return { ok: true, message: { type: 'SET_MATCH', rule: { kind: 'rounds', count: rule['count'] as number } } };
        }
      }
      return { ok: false, reason: 'That is not a match length.' };
    }
    case 'SET_TURN_TIMER': {
      if (typeof value['on'] !== 'boolean') return { ok: false, reason: 'The timer is either on or off.' };
      return { ok: true, message: { type: 'SET_TURN_TIMER', on: value['on'] } };
    }
    case 'KICK': {
      if (!isIndex(value['seat'], 4)) return { ok: false, reason: 'No such seat.' };
      return { ok: true, message: { type: 'KICK', seat: value['seat'] } };
    }
    case 'TAKE_SEAT': {
      if (!isIndex(value['seat'], 4)) return { ok: false, reason: 'No such seat.' };
      return { ok: true, message: { type: 'TAKE_SEAT', seat: value['seat'] } };
    }
    case 'SET_NAME': {
      if (!isShortString(value['name'], 24)) return { ok: false, reason: 'That name is not usable.' };
      return { ok: true, message: { type: 'SET_NAME', name: value['name'] } };
    }
    case 'RESYNC':
      return { ok: true, message: { type: 'RESYNC' } };
    case 'READY':
      return { ok: true, message: { type: 'READY' } };
    case 'UNREADY':
      return { ok: true, message: { type: 'UNREADY' } };
    case 'START':
      return { ok: true, message: { type: 'START' } };
    case 'LEAVE':
      return { ok: true, message: { type: 'LEAVE' } };
    default:
      return { ok: false, reason: 'Unknown message type.' };
  }
}

/**
 * Turn bytes off a socket into a message, or say why not.
 *
 * Never throws. A malformed frame is an ordinary outcome on a public endpoint,
 * not an exception — and a server that has to wrap every read in a try/catch
 * eventually forgets to.
 */
export function decodeClient(raw: string): Decoded {
  if (typeof raw !== 'string') return { ok: false, reason: 'Expected text.' };
  if (raw.length > MAX_BYTES) return { ok: false, reason: 'Message too large.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'Not valid JSON.' };
  }

  if (!isObject(parsed)) return { ok: false, reason: 'Envelope is not an object.' };
  if (parsed['v'] !== PROTOCOL_VERSION) {
    return { ok: false, reason: 'Unsupported protocol version.' };
  }
  if (parsed['id'] !== undefined && !isShortString(parsed['id'], 64)) {
    return { ok: false, reason: 'That message id is not usable.' };
  }

  const message = validateMessage(parsed['message']);
  if (!message.ok) return message;

  return {
    ok: true,
    envelope: {
      v: PROTOCOL_VERSION,
      ...(parsed['id'] !== undefined ? { id: parsed['id'] as string } : {}),
      message: message.message,
    },
  };
}

/** Wrap a client message for sending. The one place the version is stamped. */
export function encodeClient(message: ClientMessage, id?: string): string {
  return JSON.stringify({ v: PROTOCOL_VERSION, ...(id !== undefined ? { id } : {}), message });
}

/** Wrap a server message for sending. */
export function encodeServer(message: import('./messages.js').ServerMessage): string {
  return JSON.stringify({ v: PROTOCOL_VERSION, message });
}

/**
 * Read a server message on the client.
 *
 * Lighter than the inbound direction on purpose: a client that cannot trust
 * its own server has a problem no validator fixes. What is checked is the
 * version and the shape of the envelope, so a deployed client meeting a newer
 * server says so rather than crashing on a field it has never heard of.
 */
export function decodeServer(
  raw: string,
): { ok: true; message: import('./messages.js').ServerMessage } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'Not valid JSON.' };
  }
  if (!isObject(parsed)) return { ok: false, reason: 'Envelope is not an object.' };
  if (parsed['v'] !== PROTOCOL_VERSION) return { ok: false, reason: 'Unsupported protocol version.' };
  if (!isObject(parsed['message']) || typeof parsed['message']['type'] !== 'string') {
    return { ok: false, reason: 'Envelope carries no message.' };
  }
  return { ok: true, message: parsed['message'] as import('./messages.js').ServerMessage };
}
