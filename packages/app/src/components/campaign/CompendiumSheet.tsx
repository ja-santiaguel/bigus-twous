import { useEffect, useRef } from 'react';
import { CLASS_IDS, CLASSES, MEDALLIONS, type ClassId, type MedallionDef } from '@big-two/campaign';
import { useCampaignStore } from '../../store/campaignStore.js';
import { foundCount, levelCount } from '../../lib/compendium.js';
import { MedallionCard } from './MedallionCard.js';

/**
 * The compendium: every Medallion there is, by whose pool it belongs to, and
 * every level of each as a card of its own — the ones you have found written
 * out, the rest sealed. Found means the game has shown it to you at that
 * level (or a higher one), in any run: carried, sold, won, in a coffer, or on
 * a player at a table you could choose. Every card is one size, so a pool
 * reads as an even row of them however much each one says.
 *
 * Opened from the main menu, and from the menu during a run. It reads like
 * How to play: a sheet over the screen, closed by its button, Escape, or a
 * click outside it.
 */

const RARITY_ORDER = { common: 0, rare: 1, legendary: 2 } as const;

/** The pools, in the order the classes are chosen, then the Medallions any class can carry. */
const POOLS: { classId: ClassId | null; name: string; medallions: MedallionDef[] }[] = [
  ...CLASS_IDS.map((classId) => ({ classId, name: CLASSES[classId].name })),
  { classId: null, name: 'Any class' },
].map((pool) => ({
  ...pool,
  medallions: Object.values(MEDALLIONS)
    .filter((m) => m.classId === pool.classId)
    .sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.name.localeCompare(b.name)),
}));

export function CompendiumSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const discovered = useCampaignStore((s) => s.discovered);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      returnTo?.focus();
    };
  }, [open]);

  if (!open) return null;
  const levelFound = (m: MedallionDef) => Math.min(discovered[m.id] ?? 0, m.levels.length);
  const count = foundCount(discovered);
  const total = levelCount();

  return (
    <div
      className="rules"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="rules__box compendium" role="dialog" aria-modal="true" aria-labelledby="compendium-title">
        <header className="rules__head">
          <div className="compendium__title">
            <h2 id="compendium-title">Compendium</h2>
            <span>
              {count} of {total} Medallions found
            </span>
          </div>
          <button ref={closeRef} type="button" className="btn btn--quiet" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="rules__body">
          {POOLS.map((pool) => (
            <section key={pool.name} className="compendium__pool">
              <h3 className={pool.classId ? `classtag--${pool.classId}` : undefined}>
                {pool.name}
                <small>
                  {pool.medallions.reduce((n, m) => n + levelFound(m), 0)} of{' '}
                  {pool.medallions.reduce((n, m) => n + m.levels.length, 0)}
                </small>
              </h3>
              <ul className="compendium__list">
                {pool.medallions.flatMap((m) =>
                  m.levels.map((_, i) => (
                    <li key={`${m.id}-${i + 1}`}>
                      <MedallionCard id={m.id} level={i + 1} sealed={i + 1 > levelFound(m)} />
                    </li>
                  )),
                )}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
