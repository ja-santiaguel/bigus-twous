import { copyWithNotice } from '../lib/copy.js';
import { PixelIcon } from './PixelIcon.js';

/**
 * The seed, with a way to deal a new one and a way to copy it.
 *
 * Copying is a button rather than something the field does on click: the field
 * is somewhere you type, select and paste, and a click that also copied got in
 * the way of all three.
 *
 * One component for both lobbies, because it is one idea: a seed means the
 * same thing alone and at a shared table, and a seed copied from one deals the
 * same cards in the other.
 */
export function SeedField({
  seed,
  onChange,
  onNew,
  disabled = false,
}: {
  seed: string;
  onChange: (seed: string) => void;
  onNew: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor="seed">Seed</label>
      <div className="field__row">
        <input
          id="seed"
          value={seed}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          autoCapitalize="characters"
          disabled={disabled}
          data-hint="Not connected to the table"
        />
        <button
          type="button"
          className="btn btn--flat btn--icon"
          onClick={onNew}
          aria-label="New seed"
          title="New seed"
          disabled={disabled}
          data-hint="Not connected to the table"
        >
          <PixelIcon name="refresh" />
        </button>
        <button
          type="button"
          className="btn btn--flat btn--icon"
          onClick={(e) => void copyWithNotice(seed, 'Seed copied', e)}
          aria-label="Copy seed"
          title="Copy seed"
        >
          <PixelIcon name="copy" />
        </button>
      </div>
      <p className="field__hint">The same seed deals the same cards, alone or at a shared table.</p>
    </div>
  );
}
