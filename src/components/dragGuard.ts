/** Window (ms) after a card drop during which taps don't open the editor. */
export const DRAG_CLICK_SUPPRESS_MS = 250;

let lastDragEnd = 0;

/** Call from the DnD onDragEnd handler. */
export function markDragEnd(now: number = Date.now()): void {
  lastDragEnd = now;
}

/** True when a click immediately follows a drag — swallow it. */
export function wasJustDragged(now: number = Date.now()): boolean {
  return now - lastDragEnd < DRAG_CLICK_SUPPRESS_MS;
}
