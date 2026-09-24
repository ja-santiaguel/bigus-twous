import { useEffect, useRef } from 'react';
import { CLASS_IDS, CLASSES, MEDALLIONS, type ClassId, type MedallionDef } from '@big-two/campaign';
import { useCampaignStore } from '../../store/campaignStore.js';
import { Terms } from '../Terms.js';
import { pathsOf, type Drawing } from './ClassArt.js';

/**
 * The compendium: every Medallion there is, by whose pool it belongs to —
 * the ones you have found written out whole, every level of them, and the
 * rest sealed. Found means the game has shown it to you, in any run: carried,
 * sold, won, in a coffer, or on a player at a table you could choose.
 *
 * Opened from the main menu, and from the menu during a run. It reads like
 * How to play: a sheet over the screen, closed by its button, Escape, or a
 * click outside it.
 */

const RARITY_ORDER = { common: 0, rare: 1, legendary: 2 } as const;
const RARITY_NAMES = { common: 'Common', rare: 'Rare', legendary: 'Legendary' } as const;
const NUMERALS = ['I', 'II', 'III', 'IV'];

/** A medallion on its ribbon, nine art pixels wide: struck in its rarity's colour, or sealed. */
const MEDAL: Drawing = {
  rows: [
    '.rr...rr.',
    '..rr.rr..',
    '...###...',
    '..#mmm#..',
    '.#mmhmm#.',
    '.#mhmmm#.',
    '.#mmmmm#.',
    '..#mmm#..',
    '...###...',
  ],
  palette: { r: 'var(--table-hi)', '#': 'var(--ink)', m: 'currentColor', h: 'var(--medal-light, var(--bone))' },
};
const MEDAL_PATHS = pathsOf(MEDAL);

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
  const found = new Set(discovered);
  const total = Object.keys(MEDALLIONS).length;
  const count = Object.keys(MEDALLIONS).filter((id) => found.has(id as keyof typeof MEDALLIONS)).length;

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
                  {pool.medallions.filter((m) => found.has(m.id)).length} of {pool.medallions.length}
                </small>
              </h3>
              <ul className="compendium__list">
                {pool.medallions.map((m) =>
                  found.has(m.id) ? (
                    <li key={m.id} className={`compendium__entry rarity--${m.rarity}`}>
                      <Medal />
                      <div className="compendium__text">
                        <span className="compendium__name">
                          <strong>{m.name}</strong>
                          <small>{RARITY_NAMES[m.rarity]}</small>
                        </span>
                        <ol className="compendium__levels">
                          {m.levels.map((line, i) => (
                            <li key={i}>
                              {m.levels.length > 1 && <span className="compendium__numeral">{NUMERALS[i]}</span>}
                              <span>
                                <Terms>{line}</Terms>
                              </span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </li>
                  ) : (
                    <li key={m.id} className="compendium__entry is-sealed" aria-label="A Medallion not yet found">
                      <Medal />
                      <div className="compendium__text">
                        <span className="compendium__name">
                          <strong>???</strong>
                        </span>
                        <span className="compendium__sealed">Not yet found</span>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function Medal() {
  return (
    <svg className="compendium__medal" viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden="true">
      {MEDAL_PATHS.map(({ color, d }) => (
        <path key={color} d={d} fill={color} />
      ))}
    </svg>
  );
}
