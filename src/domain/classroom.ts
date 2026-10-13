/**
 * Google Classroom import: pure mapping and merge of fetched course snapshots
 * into the latest local collection. Native code only fetches; every decision
 * about local cards is made here so it can be tested without a network.
 */
import { createBoard } from "../hooks/useBoard";
import { isDoneColumn } from "./deadlines";
import {
  newId,
  type Board,
  type BoardCollection,
  type Card,
  type ClassroomSource,
  type ClassroomState,
  type SourceField,
} from "./types";

export interface ClassroomDate { year?: number; month?: number; day?: number }
export interface ClassroomTime { hours?: number; minutes?: number; seconds?: number }

export interface CourseWork {
  id: string;
  title: string;
  description?: string;
  alternateLink?: string;
  workType?: string;
  dueDate?: ClassroomDate;
  dueTime?: ClassroomTime;
}

export interface Submission { courseWorkId: string; state?: string; late?: boolean }

export interface CourseSnapshot { courseId: string; courseWork: CourseWork[]; submissions: Submission[] }

export interface Course { id: string; name: string; section?: string; alternateLink?: string }

export const PROVIDER = "google-classroom";

export const EMPTY_CLASSROOM: ClassroomState = { courses: {}, ignored: [] };

export function importKey(accountId: string, courseId: string, courseWorkId: string): string {
  return `${accountId}:${courseId}:${courseWorkId}`;
}

export function sourceKey(source: Pick<ClassroomSource, "accountId" | "courseId" | "courseWorkId">): string {
  return importKey(source.accountId, source.courseId, source.courseWorkId);
}

/**
 * Classroom due dates and times are UTC. A due date without a time is due at
 * the end of that UTC day, matching Classroom's display.
 */
export function dueInstant(date?: ClassroomDate, time?: ClassroomTime): string | undefined {
  if (!date?.year || !date.month || !date.day) return undefined;
  // Protobuf omits zero-valued fields; an empty time object is midnight UTC.
  const hasTime = time !== undefined && time !== null;
  const ms = hasTime
    ? Date.UTC(date.year, date.month - 1, date.day, time.hours ?? 0, time.minutes ?? 0, time.seconds ?? 0)
    : Date.UTC(date.year, date.month - 1, date.day, 23, 59, 59);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

/** Local yyyy-mm-dd for an instant, used for date-only displays and filters. */
export function localDate(instant: string): string {
  const date = new Date(instant);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function safeLink(link?: string): string | undefined {
  if (!link) return undefined;
  try {
    const url = new URL(link);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

const SUBMISSION_LABELS: Record<string, string> = {
  NEW: "Not started",
  CREATED: "In progress",
  TURNED_IN: "Turned in",
  RETURNED: "Returned",
  RECLAIMED_BY_STUDENT: "Unsubmitted",
};

export function submissionLabel(state?: string): string | null {
  if (!state || state === "SUBMISSION_STATE_UNSPECIFIED") return null;
  return SUBMISSION_LABELS[state] ?? null;
}

export function workTypeLabel(type?: string): string {
  if (type === "SHORT_ANSWER_QUESTION") return "Short-answer question";
  if (type === "MULTIPLE_CHOICE_QUESTION") return "Multiple-choice question";
  return "Assignment";
}

function remoteValues(work: CourseWork): ClassroomSource["remote"] {
  return {
    title: work.title.trim() || "Untitled coursework",
    description: work.description ?? "",
    dueAt: dueInstant(work.dueDate, work.dueTime),
  };
}

/** Fields shown on the card for a source, honoring local overrides. */
function applyRemote(card: Card, source: ClassroomSource): Card {
  const next: Card = { ...card, source };
  if (!source.overrides.title) next.title = source.remote.title;
  if (!source.overrides.description) next.description = source.remote.description;
  if (!source.overrides.deadline) {
    next.dueAt = source.remote.dueAt;
    next.deadline = source.remote.dueAt ? localDate(source.remote.dueAt) : undefined;
  }
  return next;
}

/** Mark fields as locally overridden when an editor patch changes them. */
export function trackOverrides(card: Card, patch: Partial<Card>): Partial<Card> {
  if (!card.source) return patch;
  const overrides = { ...card.source.overrides };
  const changed = (field: SourceField) => { overrides[field] = true; };
  if (patch.title !== undefined && patch.title !== card.title) changed("title");
  if (patch.description !== undefined && patch.description !== card.description) changed("description");
  if ("deadline" in patch && patch.deadline !== card.deadline) {
    changed("deadline");
    // A local date-only deadline replaces the imported instant.
    patch = { ...patch, dueAt: undefined };
  }
  return { ...patch, source: { ...card.source, overrides } };
}

/** Restore imported title, description, and deadline. */
export function resetToSource(card: Card): Card {
  if (!card.source) return card;
  return applyRemote(card, { ...card.source, overrides: {} });
}

/** Board for a newly subscribed course. */
export function courseBoard(name: string): Board {
  return createBoard(name.trim() || "Classroom course");
}

export interface MergeContext {
  accountId: string;
  now: string;
}

/**
 * Apply one complete course snapshot. Turned-in imports move to Done;
 * local cards and source-field overrides are preserved. Never deletes cards.
 */
export function mergeCourse(board: Board, snapshot: CourseSnapshot, ignored: ReadonlySet<string>, context: MergeContext): Board {
  const { accountId, now } = context;
  const works = new Map<string, CourseWork>();
  for (const work of snapshot.courseWork) if (!works.has(work.id)) works.set(work.id, work);
  const submissions = new Map(snapshot.submissions.map((submission) => [submission.courseWorkId, submission]));
  const imported = new Set<string>();
  let changed = false;

  let cards = board.cards.map((card) => {
    const source = card.source;
    if (source?.provider !== PROVIDER || source.accountId !== accountId || source.courseId !== snapshot.courseId) return card;
    // Duplicates (e.g. from an older import) are left untouched.
    if (imported.has(source.courseWorkId)) return card;
    imported.add(source.courseWorkId);
    const work = works.get(source.courseWorkId);
    if (!work) {
      if (source.unavailable) return card;
      changed = true;
      return { ...card, source: { ...source, unavailable: true, syncedAt: now } };
    }
    const submission = submissions.get(work.id);
    const next = applyRemote(card, {
      ...source,
      link: safeLink(work.alternateLink),
      workType: work.workType,
      submissionState: submission?.state,
      late: submission?.late || undefined,
      remote: remoteValues(work),
      unavailable: undefined,
    });
    if (sameCard(card, next)) return card;
    changed = true;
    return { ...next, source: { ...next.source!, syncedAt: now }, updatedAt: now };
  });

  const todo = [...board.columns].sort((a, b) => a.order - b.order)[0];
  let order = todo ? cards.filter((card) => card.columnId === todo.id).reduce((max, card) => Math.max(max, card.order + 1), 0) : 0;
  for (const work of works.values()) {
    if (!todo || imported.has(work.id) || ignored.has(importKey(accountId, snapshot.courseId, work.id))) continue;
    const submission = submissions.get(work.id);
    const remote = remoteValues(work);
    changed = true;
    cards.push(applyRemote({
      id: newId(), columnId: todo.id, title: remote.title, description: remote.description,
      priority: "medium", tagIds: [], subtasks: [], createdAt: now, updatedAt: now, order: order++,
    }, {
      provider: PROVIDER, accountId, courseId: snapshot.courseId, courseWorkId: work.id,
      link: safeLink(work.alternateLink), workType: work.workType,
      submissionState: submission?.state, late: submission?.late || undefined,
      remote, overrides: {}, syncedAt: now,
    }));
  }
  const done = board.columns.find((column) => isDoneColumn(column.title));
  if (done) {
    const moving = cards.filter((card) => card.source?.provider === PROVIDER && card.source.accountId === accountId
      && card.source.courseId === snapshot.courseId && card.source.submissionState === "TURNED_IN" && card.columnId !== done.id);
    if (moving.length) {
      changed = true;
      const movedIds = new Set(moving.map((card) => card.id));
      const sourceColumns = new Set(moving.map((card) => card.columnId));
      let doneOrder = cards.filter((card) => card.columnId === done.id).reduce((max, card) => Math.max(max, card.order + 1), 0);
      cards = cards.map((card) => movedIds.has(card.id) ? { ...card, columnId: done.id, order: doneOrder++, updatedAt: now } : card);
      const remainingOrders = new Map<string, number>();
      for (const columnId of sourceColumns) {
        cards.filter((card) => card.columnId === columnId).sort((a, b) => a.order - b.order)
          .forEach((card, index) => remainingOrders.set(card.id, index));
      }
      cards = cards.map((card) => {
        const order = remainingOrders.get(card.id);
        return order !== undefined && order !== card.order ? { ...card, order } : card;
      });
    }
  }
  return changed ? { ...board, cards } : board;
}

function sameCard(a: Card, b: Card): boolean {
  const comparable = (card: Card) => JSON.stringify({ ...card, updatedAt: undefined, source: card.source && { ...card.source, syncedAt: undefined } });
  return comparable(a) === comparable(b);
}

/** Subscribe/unsubscribe courses; creates or reuses boards for selected ones. */
export function setSubscriptions(collection: BoardCollection, accountId: string, courses: Course[], selected: ReadonlySet<string>): BoardCollection {
  const state = accountState(collection, accountId);
  const boards = [...collection.boards];
  const links = { ...state.courses };
  for (const course of courses) {
    const link = links[course.id];
    const wanted = selected.has(course.id);
    if (!wanted) {
      if (link) links[course.id] = { ...link, name: course.name, subscribed: false };
      continue;
    }
    const board = link?.boardId ? boards.find((item) => item.id === link.boardId) : undefined;
    let boardId = board?.id;
    if (!boardId) {
      const created = courseBoard(course.name);
      boards.push(created);
      boardId = created.id;
    }
    links[course.id] = { ...link, name: course.name, subscribed: true, boardId };
  }
  return { ...collection, boards, activeBoardId: collection.activeBoardId ?? boards[0]?.id ?? null,
    classroom: { ...state, courses: links } };
}

/** Connector state for an account; subscriptions from another account are dropped. */
export function accountState(collection: BoardCollection, accountId: string): ClassroomState {
  const state = collection.classroom ?? EMPTY_CLASSROOM;
  if (state.accountId === accountId) return state;
  return { accountId, courses: {}, ignored: state.ignored };
}

/** Courses to refresh: subscribed and whose board still exists. */
export function subscribedCourses(collection: BoardCollection, accountId: string): string[] {
  const state = collection.classroom;
  if (!state || state.accountId !== accountId) return [];
  const boards = new Set(collection.boards.map((board) => board.id));
  return Object.entries(state.courses)
    .filter(([, link]) => link.subscribed && link.boardId && boards.has(link.boardId))
    .map(([id]) => id);
}

/**
 * Apply fetched snapshots to the latest collection. Results for another
 * account, unsubscribed courses, or deleted boards are discarded.
 */
export function applySnapshots(collection: BoardCollection, accountId: string, snapshots: CourseSnapshot[], now: string): BoardCollection {
  const state = collection.classroom;
  if (!state || state.accountId !== accountId) return collection;
  const ignored = new Set(state.ignored);
  const courses = { ...state.courses };
  let boards = collection.boards;
  for (const snapshot of snapshots) {
    const link = courses[snapshot.courseId];
    if (!link?.subscribed || !link.boardId) continue;
    const board = boards.find((item) => item.id === link.boardId);
    if (!board) continue;
    const merged = mergeCourse(board, snapshot, ignored, { accountId, now });
    if (merged !== board) boards = boards.map((item) => item.id === board.id ? merged : item);
    courses[snapshot.courseId] = { ...link, refreshedAt: now };
  }
  return { ...collection, boards, classroom: { ...state, courses, lastRefreshAt: now } };
}

/** Record deleted imported cards so refresh does not recreate them. */
export function suppressDeleted(collection: BoardCollection, previousBoard: Board | undefined, nextBoard: Board | undefined): BoardCollection {
  if (!previousBoard || !collection.classroom) return collection;
  const remaining = new Set(nextBoard?.cards.map((card) => card.id) ?? []);
  const keys = previousBoard.cards
    .filter((card) => card.source?.provider === PROVIDER && !remaining.has(card.id))
    .map((card) => sourceKey(card.source!));
  if (keys.length === 0) return collection;
  const ignored = [...new Set([...collection.classroom.ignored, ...keys])];
  return { ...collection, classroom: { ...collection.classroom, ignored } };
}

/** Deleting a course board unsubscribes that course. */
export function unlinkBoard(collection: BoardCollection, boardId: string): BoardCollection {
  const state = collection.classroom;
  if (!state) return collection;
  let changed = false;
  const courses = Object.fromEntries(Object.entries(state.courses).map(([id, link]) => {
    if (link.boardId !== boardId) return [id, link];
    changed = true;
    return [id, { ...link, subscribed: false, boardId: undefined }];
  }));
  return changed ? { ...collection, classroom: { ...state, courses } } : collection;
}
