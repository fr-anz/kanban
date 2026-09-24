/**
 * Trello-style "hand" pan: press empty board space and the board follows
 * the finger 1:1. Anything interactive (cards, buttons, inputs, modals,
 * pager) is excluded so taps, edits, and card drags keep working.
 */
const PAN_EXCLUDE =
  ".kb-card,button,input,textarea,select,a,[contenteditable],.kb-modal,.kb-overlay,.kb-pager";

/** Finger travel before an empty-space press becomes a pan. */
export const PAN_THRESHOLD_PX = 6;

/** True when a press target is empty space the hand may grab. */
export function shouldStartPan(target: EventTarget | null): boolean {
  const el = target as Element | null;
  if (!el || typeof el.closest !== "function") return false;
  return el.closest(PAN_EXCLUDE) === null;
}

export interface PanSample {
  x: number;
  t: number;
}

/** Finger velocity in px/ms from recent samples (clamped). */
export function computeVelocity(samples: PanSample[]): number {
  if (samples.length < 2) return 0;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = last.t - first.t;
  if (dt <= 0) return 0;
  return Math.max(-3, Math.min(3, (last.x - first.x) / dt));
}
