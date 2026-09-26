import { describe, expect, it } from 'vitest';
import { startRun, type RunState } from '@big-two/campaign';
import { merged, seenIn } from '../src/lib/compendium.js';

/** The Medallions found, by id. */
const ids = (run: Parameters<typeof seenIn>[0], vestiges?: Parameters<typeof seenIn>[1]) =>
  Object.keys(seenIn(run, vestiges));

/**
 * What goes into the compendium: every Medallion a run has shown you, and
 * nothing it has not — a sealed coffer keeps its secret until it is opened.
 */
describe('the compendium', () => {
  const run = startRun('compendium', 'tyrant');

  it('finds what you carry, and what players at the tables on offer carry', () => {
    const carrying: RunState = { ...run, medallions: [{ id: 'hoard', level: 1 }] };
    expect(ids(carrying)).toContain('hoard');
    const onOffer = Object.values(run.offers).flatMap((o) => o.lineup.flatMap((p) => p.medallions.map((m) => m.id)));
    for (const id of onOffer) expect(ids(run)).toContain(id);
  });

  it('finds what the Bone Merchant sells and what a won table offers, only while they are shown', () => {
    expect(ids({ ...run, phase: 'shop', shopOffers: ['tithe'] })).toContain('tithe');
    expect(ids({ ...run, phase: 'map', shopOffers: ['tithe'] })).not.toContain('tithe');
    expect(ids({ ...run, phase: 'reward', rewards: [{ kind: 'new', id: 'unbowed', level: 1 }] })).toContain('unbowed');
  });

  it('keeps a coffer sealed until one is opened', () => {
    const coffers = [
      { weight: 'light' as const, holds: { kind: 'medallion' as const, id: 'iron-crown' as const } },
      { weight: 'between' as const, holds: { kind: 'gold' as const, amount: 100 } },
      { weight: 'heavy' as const, holds: { kind: 'gold' as const, amount: 200 } },
    ];
    const sealed: RunState = { ...run, phase: 'event', event: { id: 'reliquary', coffers, opened: null } };
    expect(ids(sealed)).not.toContain('iron-crown');
    expect(ids({ ...sealed, event: { id: 'reliquary', coffers, opened: 2 } })).toContain('iron-crown');
  });

  it('finds what your Vestiges carried', () => {
    const vestige = {
      key: 'v',
      name: 'Vesper',
      classId: 'courtier' as const,
      medallions: [{ id: 'intrigue' as const, level: 1 }],
      temperament: 'steady' as const,
      wonAt: '',
    };
    expect(ids(null, [vestige])).toEqual(['intrigue']);
  });

  it('finds each level as it is shown, and the ones below it with it', () => {
    const upgrade: RunState = {
      ...run,
      phase: 'reward',
      medallions: [{ id: 'blood-rite', level: 1 }],
      rewards: [{ kind: 'upgrade', id: 'blood-rite', level: 2 }],
    };
    expect(seenIn(upgrade)['blood-rite']).toBe(2);
    // Sold as its next level: what you carry, one up.
    const shop: RunState = { ...run, phase: 'shop', medallions: [{ id: 'frugal', level: 1 }], shopOffers: ['frugal'] };
    expect(seenIn(shop).frugal).toBe(2);
  });

  it('keeps the higher level, and says when nothing new was found', () => {
    expect(merged({ uprising: 2 }, { uprising: 1 })).toBeNull();
    expect(merged({ uprising: 1 }, { uprising: 2, hoard: 1 })).toEqual({ uprising: 2, hoard: 1 });
  });
});
