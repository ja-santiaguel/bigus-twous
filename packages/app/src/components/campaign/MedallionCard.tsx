import { MEDALLIONS, type MedallionId } from '@big-two/campaign';
import { Terms } from '../Terms.js';
import { MedallionSprite } from './MedallionArt.js';
import { medallionEffect, medallionName } from './medallionText.js';

const RARITY_NAMES = { common: 'Common', rare: 'Rare', legendary: 'Legendary' } as const;

/**
 * A Medallion as a card, one size everywhere it is offered: its emblem on a
 * plate edged in its rarity's colour, its name at the level on offer, its
 * rarity (or what else to say of it), what that level does, a note, and the
 * way to take it. Laid side by side, a set of them reads as a hand to choose
 * from rather than a list to read down.
 */
export function MedallionCard({
  id,
  level,
  tag,
  note,
  action,
  sealed = false,
}: {
  id: MedallionId;
  level: number;
  /** In place of the rarity: "Level up", "Spoils". */
  tag?: string | undefined;
  note?: string | undefined;
  action?: { label: string; onClick: () => void; disabled?: boolean; hint?: string; primary?: boolean };
  /** Not yet found: a card with its emblem as a shadow and nothing written on it. */
  sealed?: boolean;
}) {
  const def = MEDALLIONS[id];
  return (
    <div className={`medcard rarity--${def.rarity} ${sealed ? 'is-sealed' : ''}`}>
      <div className="medcard__plate">
        <MedallionSprite id={id} sealed={sealed} />
      </div>
      <strong className="medcard__name">{sealed ? '???' : medallionName(id, level)}</strong>
      <span className="medcard__tag">
        {sealed ? 'Not yet found' : (tag ?? `${RARITY_NAMES[def.rarity]}${def.classId === null ? ' · any class' : ''}`)}
      </span>
      <p className="medcard__effect">{sealed ? '' : <Terms>{medallionEffect(id, level)}</Terms>}</p>
      {note && !sealed && <span className="medcard__note">{note}</span>}
      {action && (
        <button
          className={action.primary ? 'btn btn--primary' : 'btn'}
          onClick={action.onClick}
          disabled={action.disabled}
          data-hint={action.hint}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
