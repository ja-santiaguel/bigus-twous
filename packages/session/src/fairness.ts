import {
  createNewRound,
  createRng,
  dealPiles,
  playTurn,
  type Card,
  type GameEvent,
  type GameState,
  type Move,
  type PileClaim,
  type Player,
  type PlayerId,
} from '@big-two/engine';

/**
 * Keeping a table honest when one player's browser runs it (9.18).
 *
 * The browser that runs a table knows every hand, so nothing here can stop its
 * owner looking. What it does stop is the two cheats that change the game:
 *
 *  - **Stacking the deal.** Before a deal the host seals a hash of its own
 *    secret, every other device answers with a random share, and the deck is
 *    shuffled from all of them together. The host is bound to a secret before
 *    it sees anyone's share, and the picks are made before the shuffle exists,
 *    so nobody — the host included — can steer who gets what.
 *  - **Faking a move or a score.** When the round ends the host hands every
 *    seat the full record, and each device rebuilds the deal from the shares
 *    and replays every move through the same rules engine. A single illegal
 *    play, a changed score or a doctored deal fails the check on every device.
 */

/** Everything a seat needs to check a round, sent by the host when it ends. */
export interface RoundAudit {
  roundNumber: number;
  /** The seal sent before the deal: SHA-256 of `hostSecret`. */
  commit: string;
  hostSecret: string;
  /** The shares the deal was made from, by seat. */
  shares: Record<PlayerId, string>;
  dealSeed: string;
  /** The round as it was set up — see `RoundRecord`. */
  seats: PlayerId[];
  previousWinner: PlayerId | null;
  roundsWon: Record<PlayerId, number>;
  points: Record<PlayerId, number> | null;
  claims: PileClaim[];
  /** The round's complete public history. */
  history: GameEvent[];
}

/** What one seat saw for itself, which the audit has to agree with. */
export interface RoundWitness {
  you: PlayerId;
  /** The seal this seat was sent before the deal. */
  commit: string;
  /** The share this seat answered with, or null if it never got to. */
  share: string | null;
  /** The pile this seat picked, or null if a computer picked for it. */
  pile: number | null;
  /** The hand this seat was dealt, or null if it arrived after cards were played. */
  hand: Card[] | null;
  /** The history and scores this seat was shown when the round ended. */
  history: GameEvent[];
  points: Record<PlayerId, number>;
}

export type Verdict = { ok: true } | { ok: false; reason: string };

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** 32 random bytes as hex, from the platform's cryptographic generator. */
export function randomSecret(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return hex(bytes);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return hex(new Uint8Array(digest));
}

/** The deal seed: the host's secret and every share, in a fixed order. */
export function combineDealSeed(hostSecret: string, shares: Record<PlayerId, string>): Promise<string> {
  const parts = Object.keys(shares)
    .sort()
    .map((id) => `${id}=${shares[id]}`);
  return sha256Hex(['deal', hostSecret, ...parts].join('|'));
}

/** Order-independent comparison, so a record that crossed the wire compares equal to one rebuilt here. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

const handKey = (cards: Card[]) =>
  cards
    .map((card) => `${card.rank}_${card.suit}`)
    .sort()
    .join(',');

/**
 * Check a round the host says was played. Pure: it trusts nothing in the audit
 * that it cannot rebuild, and nothing in the witness but what this seat saw.
 */
export async function verifyRound(audit: RoundAudit, witness: RoundWitness): Promise<Verdict> {
  const fail = (reason: string): Verdict => ({ ok: false, reason });

  if (audit.commit !== witness.commit) return fail('the host changed its sealed shuffle after the deal');
  if ((await sha256Hex(audit.hostSecret)) !== witness.commit) return fail("the host's shuffle does not match what it sealed");
  if (witness.share !== null && audit.shares[witness.you] !== witness.share) return fail('your part of the shuffle was left out');
  if ((await combineDealSeed(audit.hostSecret, audit.shares)) !== audit.dealSeed) {
    return fail("the deal was not made from everyone's shuffle");
  }
  if (witness.pile !== null && !audit.claims.some((c) => c.playerId === witness.you && c.pileIndex === witness.pile)) {
    return fail('the pile you picked is not the pile you were given');
  }

  let state: GameState;
  try {
    state = createNewRound(
      audit.seats,
      createRng(audit.dealSeed),
      audit.dealSeed,
      audit.roundNumber,
      audit.previousWinner,
      audit.roundsWon,
      {
        piles: dealPiles(audit.seats.length, createRng(audit.dealSeed)),
        claims: audit.claims,
        ...(audit.points ? { points: audit.points } : {}),
      },
    );
  } catch {
    return fail('the deal in the record could not be rebuilt');
  }

  const mine = state.players.find((p) => p.id === witness.you);
  if (witness.hand && (!mine || handKey(mine.hand) !== handKey(witness.hand))) {
    return fail('your hand is not the one the shuffle deals');
  }
  if (canonical(audit.history.slice(0, state.history.length)) !== canonical(state.history)) {
    return fail('the start of the round does not match the deal');
  }

  const moves: Move[] = [];
  for (const event of audit.history.slice(state.history.length)) {
    if (event.type === 'CARDS_PLAYED') moves.push({ kind: 'PLAY', combo: event.combo });
    else if (event.type === 'PLAYER_PASSED') moves.push({ kind: 'PASS' });
  }
  let next = 0;
  const players = new Map<PlayerId, Player>(
    audit.seats.map((id): [PlayerId, Player] => [
      id,
      {
        id,
        getMove: async () => {
          const move = moves[next++];
          if (!move) throw new Error('The record ran out of moves.');
          return move;
        },
      },
    ]),
  );

  try {
    // playTurn validates each move against the legal set, exactly as the
    // table did — so an illegal play in the record throws here.
    for (let turns = 0; state.phase !== 'ROUND_END'; turns++) {
      if (turns > 2_000) return fail('the round in the record never ends');
      state = await playTurn(state, players);
    }
  } catch {
    return fail('a move in the round was not legal');
  }

  if (next !== moves.length) return fail('the record has moves after the round ended');
  if (canonical(state.history) !== canonical(audit.history)) return fail('the round did not play out as recorded');
  if (canonical(witness.history) !== canonical(audit.history)) return fail('what you were shown differs from the record');
  if (canonical(witness.points) !== canonical(state.points)) return fail('the scores do not match the round');
  return { ok: true };
}
