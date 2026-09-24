/** Attribute marking a drop-target column in the DOM. */
export const COLUMN_ATTR = "data-column-id";

/** Long-press duration before a touch becomes a card drag. */
export const LONG_PRESS_MS = 350;
/** Finger travel that cancels a pending long-press (it's a scroll). */
export const MOVE_CANCEL_PX = 10;

/** Which column (if any) sits under the given viewport point. */
export function columnIdFromPoint(x: number, y: number): string | null {
  if (
    typeof document === "undefined" ||
    typeof document.elementFromPoint !== "function"
  )
    return null;
  const el = document.elementFromPoint(x, y) as Element | null;
  const col = el?.closest?.(`[${COLUMN_ATTR}]`) ?? null;
  return col?.getAttribute(COLUMN_ATTR) ?? null;
}

/** Highlight exactly the column under the finger during a touch drag. */
export function highlightColumnAt(x: number, y: number): string | null {
  const id = columnIdFromPoint(x, y);
  document
    .querySelectorAll(`[${COLUMN_ATTR}]`)
    .forEach((c) =>
      c.classList.toggle("drop-over", c.getAttribute(COLUMN_ATTR) === id),
    );
  return id;
}
