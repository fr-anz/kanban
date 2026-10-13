import type { Card, Column, Tag } from "./types";

export type DeadlineState =
  | { kind: "none" }
  | { kind: "overdue"; daysOverdue: number }
  | { kind: "today" }
  | { kind: "soon"; daysLeft: number }
  | { kind: "ontrack"; label: string };

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Pure deadline classifier. `now` injectable for tests. */
export function getDeadlineStatus(
  deadline: string | undefined,
  now: Date = new Date(),
): DeadlineState {
  if (!deadline) return { kind: "none" };
  const due = startOfDay(new Date(deadline));
  if (Number.isNaN(due.getTime())) return { kind: "none" };
  const today = startOfDay(now);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return { kind: "overdue", daysOverdue: Math.abs(diffDays) };
  if (diffDays === 0) return { kind: "today" };
  if (diffDays <= 3) return { kind: "soon", daysLeft: diffDays };
  return { kind: "ontrack", label: formatDate(due) };
}

/**
 * Deadline for a card. An exact `dueAt` instant (imported work) is overdue
 * from that moment; date-only deadlines keep whole-day semantics.
 */
export function getCardDeadlineStatus(
  card: { deadline?: string; dueAt?: string },
  now: Date = new Date(),
): DeadlineState {
  if (!card.dueAt) return getDeadlineStatus(card.deadline, now);
  const due = new Date(card.dueAt);
  if (Number.isNaN(due.getTime())) return getDeadlineStatus(card.deadline, now);
  const diffDays = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (due.getTime() <= now.getTime()) return { kind: "overdue", daysOverdue: Math.max(0, -diffDays) };
  if (diffDays === 0) return { kind: "today" };
  if (diffDays <= 3) return { kind: "soon", daysLeft: diffDays };
  return { kind: "ontrack", label: formatDate(due) };
}

/** Local date and time for an exact deadline, e.g. "Mon, Nov 2, 11:59 PM". */
export function formatDueAt(instant: string): string {
  return new Date(instant).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function deadlineLabel(s: DeadlineState): string | null {
  switch (s.kind) {
    case "none":
      return null;
    case "overdue":
      return s.daysOverdue > 0 ? `${s.daysOverdue}d overdue` : "Overdue";
    case "today":
      return "Due today";
    case "soon":
      return `${s.daysLeft}d left`;
    case "ontrack":
      return s.label;
  }
}

export function isDoneColumn(label: string): boolean {
  return label.trim().toLowerCase() === "done";
}

/** X/Y progress: done cards / total cards. Done = column labeled "done". */
export function getProgress(
  columns: Pick<Column, "id" | "title">[],
  cards: Pick<Card, "columnId">[],
): { done: number; total: number } {
  const doneIds = new Set(
    columns.filter((c) => isDoneColumn(c.title)).map((c) => c.id),
  );
  const done = cards.filter((c) => doneIds.has(c.columnId)).length;
  return { done, total: cards.length };
}

/** Tags removed from manager disappear from cards (filtered at render). */
export function visibleTags(card: Pick<Card, "tagIds">, tags: Tag[]): Tag[] {
  const known = new Set(tags.map((t) => t.id));
  return tags.filter((t) => card.tagIds.includes(t.id) && known.has(t.id));
}
