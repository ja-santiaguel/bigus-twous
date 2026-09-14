import { describe, expect, it } from 'vitest';
import type { Difficulty } from '@big-two/ai';
import { MATCH_POINT_TARGETS, MATCH_ROUND_COUNTS, makeSeed, normalizeSeed, SEED_PATTERN,
  type RoundAudit, type CeremonyState, type TurnPrompt } from '@big-two/session';
import {
  decodeClient,
  decodeServer,
  encodeClient,
  encodeServer,
  PROTOCOL_VERSION,
  type ClientMessage,
  type WireCeremony,
  WIRE_MATCH_POINT_TARGETS,
  WIRE_MATCH_ROUND_COUNTS,
  type WireDifficulty,
  type WireRoundAudit,
  type WirePrompt,
} from '../src/index.js';

/**
 * Protocol tests.
 *
 * Almost all of these are about refusing things. That is the point of the
 * package: the rules are the engine's problem, and by the time a message
 * reaches the engine it has to already be a message. What is tested here is
 * the gap between "somebody sent bytes" and "this is a move" — the gap where
 * a public endpoint actually gets hurt.
 */

const ACE: unknown = { rank: 'A', suit: 'SPADE' };

function send(message: unknown, v: number = PROTOCOL_VERSION, id?: string): string {
  return JSON.stringify({ v, ...(id !== undefined ? { id } : {}), message });
}

describe('messages that should get through', () => {
  it('accepts every intent a client is allowed to send', () => {
    const intents: ClientMessage[] = [
      { type: 'JOIN', table: 'AVXLEY' },
      { type: 'JOIN', table: 'AVXLEY', name: 'Jas', token: 'abc123' },
      { type: 'CLAIM_PILE', pileIndex: 2 },
      { type: 'PLAY', move: { kind: 'PASS' } },
      { type: 'PLAY', move: { kind: 'PLAY', cards: [{ rank: 'A', suit: 'SPADE' }] } },
      { type: 'TAKE_SEAT', seat: 3 },
      { type: 'SET_SEED', seed: 'ABCD-2345' },
      { type: 'SET_DIFFICULTY', seat: 1, difficulty: 'hard' },
      { type: 'KICK', seat: 2 },
      { type: 'SET_MATCH', rule: { kind: 'rounds', count: 10 } },
      { type: 'DEAL_SHARE', round: 1, share: 'a'.repeat(64) },
      { type: 'UNREADY' },
      { type: 'START' },
      { type: 'RESYNC' },
      { type: 'READY' },
      { type: 'LEAVE' },
    ];

    for (const intent of intents) {
      const decoded = decodeClient(encodeClient(intent));
      expect(decoded.ok, JSON.stringify(intent)).toBe(true);
      if (decoded.ok) expect(decoded.envelope.message).toEqual(intent);
    }
  });

  it('carries a message id through to the answer', () => {
    const decoded = decodeClient(encodeClient({ type: 'RESYNC' }, 'req-7'));
    expect(decoded.ok && decoded.envelope.id).toBe('req-7');
  });

  it('round-trips a server message', () => {
    const decoded = decodeServer(encodeServer({ type: 'CLOSED', reason: 'Table finished.' }));
    expect(decoded).toEqual({ ok: true, message: { type: 'CLOSED', reason: 'Table finished.' } });
  });
});

describe('messages that should not', () => {
  it('never throws, whatever arrives', () => {
    const nonsense = ['', '{', 'null', '[]', '"a string"', '{"v":1}', String.fromCharCode(0)];
    for (const raw of nonsense) {
      expect(() => decodeClient(raw)).not.toThrow();
      expect(decodeClient(raw).ok, raw).toBe(false);
    }
  });

  it('refuses a version it does not understand', () => {
    const decoded = decodeClient(send({ type: 'RESYNC' }, PROTOCOL_VERSION + 1));
    expect(decoded).toEqual({ ok: false, reason: 'Unsupported protocol version.' });
  });

  it('refuses a card that is not a card', () => {
    const notCards: unknown[] = [
      { rank: 'A' }, // no suit
      { rank: 'A', suit: 'SPADE', extra: 1 }, // extra field
      { rank: '1', suit: 'SPADE' }, // no such rank
      { rank: 'A', suit: 'SWORDS' }, // no such suit
      { rank: { toString: 'A' }, suit: 'SPADE' }, // rank is an object
      'A_SPADE', // a string id, not a card
      null,
    ];

    for (const card of notCards) {
      const decoded = decodeClient(send({ type: 'PLAY', move: { kind: 'PLAY', cards: [card] } }));
      expect(decoded.ok, JSON.stringify(card)).toBe(false);
    }
  });

  it('refuses the same card twice', () => {
    // One deck. A repeated card is a bug or an attempt to play a card twice,
    // and neither is worth passing along to the rules.
    const decoded = decodeClient(send({ type: 'PLAY', move: { kind: 'PLAY', cards: [ACE, ACE] } }));
    expect(decoded.ok).toBe(false);
  });

  it('refuses an empty or oversized play', () => {
    expect(decodeClient(send({ type: 'PLAY', move: { kind: 'PLAY', cards: [] } })).ok).toBe(false);

    const tooMany = Array.from({ length: 14 }, (_, i) => ({ rank: '3', suit: ['SPADE', 'CLUB', 'DIAMOND', 'HEART'][i % 4] }));
    expect(decodeClient(send({ type: 'PLAY', move: { kind: 'PLAY', cards: tooMany } })).ok).toBe(false);
  });

  it('refuses a pile index that is not one of the four', () => {
    for (const pileIndex of [-1, 4, 1.5, NaN, Infinity, '2', null]) {
      expect(decodeClient(send({ type: 'CLAIM_PILE', pileIndex })).ok, String(pileIndex)).toBe(false);
    }
  });

  it('refuses a name or token being used as storage', () => {
    const long = 'x'.repeat(500);
    expect(decodeClient(send({ type: 'JOIN', table: 'AVXLEY', name: long })).ok).toBe(false);
    expect(decodeClient(send({ type: 'JOIN', table: 'AVXLEY', token: long })).ok).toBe(false);
    expect(decodeClient(send({ type: 'JOIN', table: long })).ok).toBe(false);
  });

  it('refuses a message larger than any real one', () => {
    const huge = JSON.stringify({ v: PROTOCOL_VERSION, message: { type: 'RESYNC', pad: 'x'.repeat(70_000) } });
    expect(decodeClient(huge)).toEqual({ ok: false, reason: 'Message too large.' });
  });

  it('refuses an unknown intent rather than ignoring it', () => {
    // Silently dropping an unknown type is how a client ends up waiting
    // forever for an answer to something the server never understood.
    expect(decodeClient(send({ type: 'DEAL_ME_A_BETTER_HAND' })).ok).toBe(false);
  });
});

describe('what a client is not trusted to assert', () => {
  it('gives a client no way to describe a combo', () => {
    // A Combo carries a type and a comparable value derived from its cards, so
    // accepting one off a wire accepts a claim about what those cards amount
    // to. The wire move has no room for the claim: there is nowhere to put it.
    const withCombo = {
      type: 'PLAY',
      move: { kind: 'PLAY', combo: { type: 'FOUR_OF_A_KIND', cards: [ACE], value: 99 } },
    };
    expect(decodeClient(send(withCombo)).ok).toBe(false);

    // And a well-formed play carries cards and nothing else.
    const decoded = decodeClient(send({ type: 'PLAY', move: { kind: 'PLAY', cards: [ACE], type: 'PAIR' } }));
    expect(decoded.ok).toBe(false);
  });

  it('strips anything the client added around a valid message', () => {
    const decoded = decodeClient(send({ type: 'CLAIM_PILE', pileIndex: 1, alsoGiveMe: 'the ace of spades' }));
    // The extra field is not carried forward, so nothing downstream can read
    // it by accident — validation rebuilds the message rather than blessing it.
    expect(decoded.ok && decoded.envelope.message).toEqual({ type: 'CLAIM_PILE', pileIndex: 1 });
  });
});

describe('the wire shapes track the session', () => {
  /*
   * The protocol deliberately restates the ceremony and prompt shapes instead
   * of importing them, so a client never has to depend on the package that
   * runs the game. Restating invites drift, so these assert assignability at
   * compile time: if the session changes one of them, this file stops
   * compiling and somebody has to decide whether the wire changes too.
   */
  it('accepts a session ceremony wherever a wire ceremony is expected', () => {
    const fromSession: CeremonyState = { kind: 'picking', claims: [], remaining: [0, 1], picker: 'seat-1' };
    const onTheWire: WireCeremony = fromSession;
    expect(onTheWire.kind).toBe('picking');
  });

  it('accepts a session prompt wherever a wire prompt is expected', () => {
    const fromSession: TurnPrompt = {
      playerId: 'seat-1',
      legalMoves: [],
      canPass: true,
      constraint: { kind: 'NONE' },
    };
    const onTheWire: WirePrompt = fromSession;
    expect(onTheWire.canPass).toBe(true);
  });
});

describe('table settings', () => {
  it('refuses a seed or difficulty that is not one', () => {
    expect(decodeClient(send({ type: 'SET_SEED', seed: 'lower case' })).ok).toBe(false);
    expect(decodeClient(send({ type: 'SET_SEED', seed: 'X'.repeat(40) })).ok).toBe(false);
    expect(decodeClient(send({ type: 'SET_DIFFICULTY', seat: 1, difficulty: 'impossible' })).ok).toBe(false);
    expect(decodeClient(send({ type: 'SET_DIFFICULTY', seat: 9, difficulty: 'easy' })).ok).toBe(false);
  });

  it('accepts every seed the session makes, and every seed it normalises', () => {
    // The protocol restates the seed pattern; this is what holds it to the
    // session's. A generated seed refused on the wire would be a table whose
    // seed could never be set back to itself.
    for (let i = 0; i < 50; i++) {
      const seed = makeSeed();
      expect(SEED_PATTERN.test(seed)).toBe(true);
      expect(decodeClient(send({ type: 'SET_SEED', seed })).ok).toBe(true);
    }
    expect(decodeClient(send({ type: 'SET_SEED', seed: normalizeSeed(' abcd-2345 ') })).ok).toBe(true);
  });

  it('offers exactly the match lengths the session accepts, and nothing else', () => {
    expect([...WIRE_MATCH_POINT_TARGETS]).toEqual([...MATCH_POINT_TARGETS]);
    expect([...WIRE_MATCH_ROUND_COUNTS]).toEqual([...MATCH_ROUND_COUNTS]);
    expect(decodeClient(send({ type: 'SET_MATCH', rule: { kind: 'points', target: 50 } })).ok).toBe(true);
    expect(decodeClient(send({ type: 'SET_MATCH', rule: { kind: 'points', target: 20 } })).ok).toBe(false);
    expect(decodeClient(send({ type: 'SET_MATCH', rule: { kind: 'wins', count: 3 } } as never)).ok).toBe(false);
  });

  it('refuses a shuffle share that is not one, and keeps the audit shape in step', () => {
    expect(decodeClient(send({ type: 'DEAL_SHARE', round: 0, share: 'a'.repeat(64) })).ok).toBe(false);
    expect(decodeClient(send({ type: 'DEAL_SHARE', round: 2, share: 'not-hex' })).ok).toBe(false);
    // Both directions, so neither side can grow a field the other lacks.
    const toWire: WireRoundAudit = {} as RoundAudit;
    const fromWire: RoundAudit = {} as WireRoundAudit;
    expect([toWire, fromWire]).toHaveLength(2);
  });

  it('keeps the wire difficulties identical to the computer difficulties', () => {
    // Both directions, so neither side can grow a difficulty the other lacks.
    const toWire: WireDifficulty = 'hard' as Difficulty;
    const fromWire: Difficulty = 'easy' as WireDifficulty;
    expect([toWire, fromWire]).toEqual(['hard', 'easy']);
  });
});
