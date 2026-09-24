import { describe, expect, it } from 'vitest';
import { startRun, type RunState } from '@big-two/campaign';
import { seenIn } from '../src/lib/compendium.js';

/**
 * What goes into the compendium: every Medallion a run has shown you, and
 * nothing it has not — a sealed coffer keeps its secret until it is opened.
 */
describe('the compendium', () => {
  const run = startRun('compendium', 'tyrant');

  it('finds what you carry, and what players at the tables on offer carry', () => {
    const carrying: RunState = { ...run, medallions: [{ id: 'hoard', level: 1 }] };
    expect(seenIn(carrying)).toContain('hoard');
    const onOffer = Object.values(run.offers).flatMap((o) => o.lineup.flatMap((p) => p.medallions.map((m) => m.id)));
    for (const id of onOffer) expect(seenIn(run)).toContain(id);
  });

  it('finds what the Bone Merchant sells and what a won table offers, only while they are shown', () => {
    expect(seenIn({ ...run, phase: 'shop', shopOffers: ['tithe'] })).toContain('tithe');
    expect(seenIn({ ...run, phase: 'map', shopOffers: ['tithe'] })).not.toContain('tithe');
    expect(seenIn({ ...run, phase: 'reward', rewards: [{ kind: 'new', id: 'unbowed', level: 1 }] })).toContain(
      'unbowed',
    );
  });

  it('keeps a coffer sealed until one is opened', () => {
    const coffers = [
      { weight: 'light' as const, holds: { kind: 'medallion' as const, id: 'iron-crown' as const } },
      { weight: 'between' as const, holds: { kind: 'gold' as const, amount: 100 } },
      { weight: 'heavy' as const, holds: { kind: 'gold' as const, amount: 200 } },
    ];
    const sealed: RunState = { ...run, phase: 'event', event: { id: 'reliquary', coffers, opened: null } };
    expect(seenIn(sealed)).not.toContain('iron-crown');
    expect(seenIn({ ...sealed, event: { id: 'reliquary', coffers, opened: 2 } })).toContain('iron-crown');
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
    expect(seenIn(null, [vestige])).toEqual(['intrigue']);
  });
});
