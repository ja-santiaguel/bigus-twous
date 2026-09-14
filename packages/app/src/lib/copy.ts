/**
 * Copying, and saying so where you are looking.
 *
 * There are no copy buttons. The thing worth copying — a seed, a table code, an
 * invite link — is itself what you click, and a small toast appears at the
 * pointer that clicked it. A button beside every code was one more control per
 * row for something the code could simply do.
 */

export interface CopyNotice {
  id: number;
  message: string;
  /** Where the toast appears, in viewport pixels. */
  x: number;
  y: number;
}

type Listener = (notice: CopyNotice) => void;

const listeners = new Set<Listener>();
let nextId = 0;

/** Hear about every successful copy. Returns the unsubscribe. */
export function onCopied(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function writeClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Clipboard access is refused on insecure origins and in some embedded
    // views. The old selection route still works almost everywhere.
    const scratch = document.createElement('textarea');
    scratch.value = value;
    scratch.style.position = 'fixed';
    scratch.style.opacity = '0';
    document.body.appendChild(scratch);
    scratch.select();
    const ok = document.execCommand('copy');
    scratch.remove();
    return ok;
  }
}

/**
 * Copies `value` and announces it at the pointer.
 *
 * A click that came from the keyboard has no pointer position (`detail` is 0),
 * so the toast appears over the element instead of in the viewport's corner.
 */
export async function copyWithNotice(
  value: string,
  message: string,
  event: { clientX: number; clientY: number; detail: number; currentTarget: Element },
): Promise<void> {
  const fromKeyboard = event.detail === 0;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = fromKeyboard ? rect.left + rect.width / 2 : event.clientX;
  const y = fromKeyboard ? rect.top : event.clientY;

  if (!(await writeClipboard(value))) return;
  const notice: CopyNotice = { id: ++nextId, message, x, y };
  for (const listener of listeners) listener(notice);
}
