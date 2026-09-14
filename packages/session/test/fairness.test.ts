import { describe, expect, it } from 'vitest';
import type { Card, PlayerId } from '@big-two/engine';
import {
  combineDealSeed,
  createGameSession,
  randomSecret,
  sha256Hex,
  verifyRound,
  type RoundAudit,
  type RoundWitness,
  type SeatConfig,
} from '../src/index.js';

/**
 * The fairness check (9.18).
 *
 * An honest round passes, and every kind of tampering a host could attempt
 * after the fact fails: a different secret, a share left out, a pile swapped,
 * a move removed from the record.
 */

const IDS: PlayerId[] = ['seat-1', 'seat-2', 'seat-3', 'seat-4'];
const seats = (): SeatConfig[] =>
  IDS.map((id, seat) => ({ id, seat, occupant: { kind: 'cpu', difficulty: 'medium' } }));

async function honestRound(): Promise<{ audit: RoundAudit; witness: RoundWitness }> {
  const secret = randomSecret();
  const commit = await sha256Hex(secret);
  const share = randomSecret();
  const shares = { 'seat-1': share, 'seat-3': randomSecret() };

  let hand = null as Card[] | null;
  let ended = false;
  const s = createGameSession({ seats: seats(), seed: 'FAIR-TEST', dealSeed: () => combineDealSeed(secret, shares) });
  s.subscribe((e) => {
    if (e.type === 'ROUND_STARTED') hand = s.viewFor('seat-1')!.hand;
    if (e.type === 'ROUND_ENDED') ended = true;
  });
  s.start();
  const startedAt = Date.now();
  while (!ended) {
    if (Date.now() - startedAt > 5_000) throw new Error('round never ended');
    await new Promise((r) => setTimeout(r, 2));
  }
  const record = s.roundRecord()!;
  const view = s.viewFor('seat-1')!;
  s.dispose();

  return {
    audit: { ...record, commit, hostSecret: secret, shares, history: view.history },
    witness: {
      you: 'seat-1',
      commit,
      share,
      pile: record.claims.find((c) => c.playerId === 'seat-1')!.pileIndex,
      hand,
      history: view.history,
      points: view.points,
    },
  };
}

describe('checking a round', () => {
  it('passes a round played honestly, even after a trip through JSON', async () => {
    const { audit, witness } = await honestRound();
    expect(await verifyRound(audit, witness)).toEqual({ ok: true });
    expect(await verifyRound(JSON.parse(JSON.stringify(audit)), JSON.parse(JSON.stringify(witness)))).toEqual({
      ok: true,
    });
  });

  it('deals from the shares, not from the table seed', async () => {
    const { audit } = await honestRound();
    expect(audit.dealSeed).toBe(await combineDealSeed(audit.hostSecret, audit.shares));
  });

  it('fails a secret that is not the one the host sealed', async () => {
    const { audit, witness } = await honestRound();
    expect((await verifyRound({ ...audit, hostSecret: randomSecret() }, witness)).ok).toBe(false);
  });

  it('fails a deal that left your share out', async () => {
    const { audit, witness } = await honestRound();
    const { ['seat-1']: _dropped, ...others } = audit.shares;
    expect(await verifyRound({ ...audit, shares: others }, witness)).toMatchObject({
      ok: false,
      reason: 'your part of the shuffle was left out',
    });
  });

  it('fails when the pile you picked is not the pile you were given', async () => {
    const { audit, witness } = await honestRound();
    const other = [0, 1, 2, 3].find((p) => p !== witness.pile)!;
    expect(await verifyRound(audit, { ...witness, pile: other })).toMatchObject({ ok: false });
  });

  it('fails a record with a move taken out', async () => {
    const { audit, witness } = await honestRound();
    const pass = audit.history.findIndex((e) => e.type === 'PLAYER_PASSED');
    const at = pass !== -1 ? pass : audit.history.map((e) => e.type).lastIndexOf('CARDS_PLAYED');
    const doctored = { ...audit, history: audit.history.filter((_, i) => i !== at) };
    expect((await verifyRound(doctored, { ...witness, history: doctored.history })).ok).toBe(false);
  });
});
