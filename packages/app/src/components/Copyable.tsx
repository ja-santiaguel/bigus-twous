import type React from 'react';
import { copyWithNotice } from '../lib/copy.js';

/**
 * Something you copy by clicking it: a code or a link.
 *
 * A button, so it is reachable and announced like one, styled as the text it
 * is. Every copyable thing hovers the same way — pointer cursor, and the value
 * itself fades — so once one has been learned they all have. Only the value
 * fades, never its label or the box around it: the value is what gets copied.
 * Mark the value with `copyable__text` when passing children; plain values are
 * wrapped automatically. See `lib/copy.ts`.
 */
export function Copyable({
  value,
  message,
  label,
  className = '',
  children,
}: {
  value: string;
  /** What the toast says, e.g. "Code copied". */
  message: string;
  /** What this is, for assistive technology: "Seed", "Table code". */
  label: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`copyable ${className}`}
      aria-label={`${label} ${value}, click to copy`}
      onClick={(e) => void copyWithNotice(value, message, e)}
    >
      {children ?? <span className="copyable__text">{value}</span>}
    </button>
  );
}
