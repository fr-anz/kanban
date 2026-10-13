import { describe, expect, it } from "vitest";
import {
  accountState,
  applySnapshots,
  dueInstant,
  importKey,
  localDate,
  mergeCourse,
  resetToSource,
  safeLink,
  setSubscriptions,
  submissionLabel,
  subscribedCourses,
  suppressDeleted,
  trackOverrides,
  unlinkBoard,
  type CourseSnapshot,
  type CourseWork,
} from "./classroom";
import { deadlineLabel, getCardDeadlineStatus } from "./deadlines";
import type { Board, BoardCollection, Card } from "./types";
import { parseBoardCollection } from "../storage/boardCollectionStorage";

const ACCOUNT = "acct-1";
const NOW = "2026-10-14T08:00:00.000Z";

const board = (): Board => ({
  id: "b1", title: "Biology", tags: [],
  columns: [{ id: "todo", title: "To Do", order: 0, colorIndex: 0 }, { id: "doing", title: "In Progress", order: 1, colorIndex: 1 }, { id: "done", title: "Done", order: 2, colorIndex: 2 }],
  cards: [],
});

const work = (id: string, extra: Partial<CourseWork> = {}): CourseWork => ({
  id, title: `Work ${id}`, description: `About ${id}`, alternateLink: `https://classroom.google.com/c/x/a/${id}`, workType: "ASSIGNMENT", ...extra,
});

const snapshot = (courseWork: CourseWork[], submissions: CourseSnapshot["submissions"] = []): CourseSnapshot => ({ courseId: "c1", courseWork, submissions });

const merge = (target: Board, snap: CourseSnapshot, ignored: string[] = [], now = NOW) =>
  mergeCourse(target, snap, new Set(ignored), { accountId: ACCOUNT, now });

const imported = (target: Board, id: string): Card => target.cards.find((card) => card.source?.courseWorkId === id)!;

describe("dueInstant", () => {
  it("treats Classroom dates and times as UTC", () => {
    expect(dueInstant({ year: 2026, month: 11, day: 2 }, { hours: 23, minutes: 59 })).toBe("2026-11-02T23:59:00.000Z");
    expect(dueInstant({ year: 2026, month: 1, day: 5 }, { hours: 4 })).toBe("2026-01-05T04:00:00.000Z");
  });

  it("uses the end of the UTC day when no time is given", () => {
    expect(dueInstant({ year: 2026, month: 11, day: 2 })).toBe("2026-11-02T23:59:59.000Z");
    expect(dueInstant({ year: 2026, month: 11, day: 2 }, {})).toBe("2026-11-02T00:00:00.000Z");
  });

  it("returns undefined for missing or partial dates", () => {
    expect(dueInstant(undefined)).toBeUndefined();
    expect(dueInstant({ year: 2026, month: 11 })).toBeUndefined();
  });
});

describe("getCardDeadlineStatus with exact instants", () => {
  const dueAt = "2026-10-14T15:30:00.000Z";
  it("is not overdue one second before the instant and overdue at it", () => {
    expect(getCardDeadlineStatus({ dueAt }, new Date(Date.parse(dueAt) - 1000)).kind).not.toBe("overdue");
    const at = getCardDeadlineStatus({ dueAt }, new Date(dueAt));
    expect(at.kind).toBe("overdue");
    expect(deadlineLabel(at)).toMatch(/overdue/i);
  });

  it("counts whole local days once past", () => {
    expect(getCardDeadlineStatus({ dueAt }, new Date(Date.parse(dueAt) + 3 * 86_400_000))).toEqual({ kind: "overdue", daysOverdue: 3 });
  });

  it("keeps date-only semantics for local deadlines", () => {
    const local = getCardDeadlineStatus({ deadline: "2026-10-14" }, new Date(2026, 9, 14, 23, 0));
    expect(local).toEqual({ kind: "today" });
  });
});

describe("mergeCourse", () => {
  it("imports turned-in work into Done and other work into To Do with links and deadlines", () => {
    const merged = merge(board(), snapshot(
      [work("w1", { dueDate: { year: 2026, month: 11, day: 2 }, dueTime: { hours: 12 } }), work("w2", { workType: "SHORT_ANSWER_QUESTION", dueDate: undefined })],
      [{ courseWorkId: "w1", state: "TURNED_IN", late: true }],
    ));
    expect(merged.cards).toHaveLength(2);
    const first = imported(merged, "w1");
    expect(first).toMatchObject({ columnId: "done", priority: "medium", title: "Work w1", description: "About w1", dueAt: "2026-11-02T12:00:00.000Z", order: 0 });
    expect(first.deadline).toBe(localDate("2026-11-02T12:00:00.000Z"));
    expect(first.source).toMatchObject({ provider: "google-classroom", accountId: ACCOUNT, courseId: "c1", courseWorkId: "w1", submissionState: "TURNED_IN", late: true, link: "https://classroom.google.com/c/x/a/w1" });
    const second = imported(merged, "w2");
    expect(second.deadline).toBeUndefined();
    expect(second.dueAt).toBeUndefined();
    expect(second).toMatchObject({ columnId: "todo", order: 0 });
  });

  it("is idempotent and deduplicates repeated coursework", () => {
    const once = merge(board(), snapshot([work("w1"), work("w1")]));
    expect(once.cards).toHaveLength(1);
    const twice = merge(once, snapshot([work("w1")]), [], "2026-10-15T00:00:00.000Z");
    expect(twice).toBe(once);
  });

  it("moves existing turned-in work to Done, appends after existing cards, and preserves edits", () => {
    let current = merge(board(), snapshot([work("w1"), work("w2"), work("w3")]));
    current = { ...current, cards: current.cards.map((card) => card.source?.courseWorkId === "w1"
      ? { ...card, ...trackOverrides(card, { title: "My title" }), priority: "high", tagIds: ["local-tag"] }
      : card.source?.courseWorkId === "w3" ? { ...card, columnId: "done", order: 0 } : card) };
    const refreshed = merge(current, snapshot([work("w1"), work("w2"), work("w3")], [{ courseWorkId: "w1", state: "TURNED_IN" }]));
    expect(imported(refreshed, "w1")).toMatchObject({ columnId: "done", order: 1, title: "My title", priority: "high", tagIds: ["local-tag"] });
    expect(imported(refreshed, "w2")).toMatchObject({ columnId: "todo", order: 0 });
    expect(imported(refreshed, "w3")).toMatchObject({ columnId: "done", order: 0 });
    expect(merge(refreshed, snapshot([work("w1"), work("w2"), work("w3")], [{ courseWorkId: "w1", state: "TURNED_IN" }]))).toBe(refreshed);
  });

  it("routes older imports already marked turned-in to Done without reversing later unsubmission", () => {
    const importedBoard = merge(board(), snapshot([work("w1")], [{ courseWorkId: "w1", state: "TURNED_IN" }]));
    const previousVersion = { ...importedBoard, cards: importedBoard.cards.map((card) => ({ ...card, columnId: "todo" })) };
    const refreshed = merge(previousVersion, snapshot([work("w1")], [{ courseWorkId: "w1", state: "TURNED_IN" }]));
    expect(refreshed.cards[0].columnId).toBe("done");
    expect(merge(refreshed, snapshot([work("w1")], [{ courseWorkId: "w1", state: "RECLAIMED_BY_STUDENT" }])).cards[0].columnId).toBe("done");
  });

  it("keeps turned-in work when Done was removed and accepts a renamed lowercase done column", () => {
    const withoutDone = { ...board(), columns: board().columns.filter((column) => column.id !== "done") };
    const result = merge(withoutDone, snapshot([work("w1")], [{ courseWorkId: "w1", state: "TURNED_IN" }]));
    expect(result.cards[0].columnId).toBe("todo");
    expect(result.columns).toHaveLength(2);
    const lowercase = { ...board(), columns: board().columns.map((column) => column.id === "done" ? { ...column, title: " done " } : column) };
    expect(merge(lowercase, snapshot([work("w1")], [{ courseWorkId: "w1", state: "TURNED_IN" }])).cards[0].columnId).toBe("done");
  });

  it("refreshes untouched fields but never moves cards or changes local organization", () => {
    let current = merge(board(), snapshot([work("w1"), work("w2")]));
    const card = imported(current, "w1");
    current = {
      ...current,
      cards: current.cards.map((item) => item.id === card.id
        ? { ...item, columnId: "done", order: 5, priority: "high", tagIds: ["t"], notes: "mine", subtasks: [{ id: "s", title: "draft", done: true }] }
        : item),
    };
    const refreshed = merge(current, snapshot([work("w1", { title: "Renamed", description: "New text" }), work("w2")], [{ courseWorkId: "w1", state: "RETURNED" }]));
    const after = imported(refreshed, "w1");
    expect(after).toMatchObject({ title: "Renamed", description: "New text", columnId: "done", order: 5, priority: "high", tagIds: ["t"], notes: "mine" });
    expect(after.subtasks).toHaveLength(1);
    expect(after.source?.submissionState).toBe("RETURNED");
    expect(refreshed.cards.map((item) => item.id)).toEqual(current.cards.map((item) => item.id));
  });

  it("preserves overridden fields and reset restores Classroom values", () => {
    const start = merge(board(), snapshot([work("w1", { dueDate: { year: 2026, month: 11, day: 2 } })]));
    const card = imported(start, "w1");
    const patch = trackOverrides(card, { title: "My title", description: card.description, deadline: "2026-12-01" });
    const edited: Board = { ...start, cards: [{ ...card, ...patch }] };
    expect(edited.cards[0].source?.overrides).toEqual({ title: true, deadline: true });
    expect(edited.cards[0].dueAt).toBeUndefined();

    const refreshed = merge(edited, snapshot([work("w1", { title: "Teacher title", description: "Updated", dueDate: { year: 2026, month: 11, day: 9 } })]));
    const after = refreshed.cards[0];
    expect(after.title).toBe("My title");
    expect(after.deadline).toBe("2026-12-01");
    expect(after.dueAt).toBeUndefined();
    expect(after.description).toBe("Updated");
    expect(getCardDeadlineStatus(after, new Date(2026, 10, 30, 12)).kind).toBe("soon");

    const reset = resetToSource(after);
    expect(reset).toMatchObject({ title: "Teacher title", description: "Updated", dueAt: "2026-11-09T23:59:59.000Z" });
    expect(reset.source?.overrides).toEqual({});
  });

  it("does not reimport suppressed work", () => {
    const merged = merge(board(), snapshot([work("w1"), work("w2")]), [importKey(ACCOUNT, "c1", "w1")]);
    expect(merged.cards.map((card) => card.source?.courseWorkId)).toEqual(["w2"]);
  });

  it("marks missing work unavailable without deleting it and restores it when it returns", () => {
    const start = merge(board(), snapshot([work("w1"), work("w2")]));
    const missing = merge(start, snapshot([work("w2")]));
    expect(missing.cards).toHaveLength(2);
    expect(imported(missing, "w1").source?.unavailable).toBe(true);
    const back = merge(missing, snapshot([work("w1"), work("w2")]));
    expect(imported(back, "w1").source?.unavailable).toBeUndefined();
  });

  it("ignores cards from other accounts and courses and local cards", () => {
    const local: Card = { id: "local", columnId: "todo", title: "Mine", description: "", priority: "low", tagIds: [], subtasks: [], createdAt: NOW, updatedAt: NOW, order: 0 };
    const other = merge(board(), snapshot([work("w1")]), [], NOW);
    const otherAccount: Board = { ...other, cards: [local, ...other.cards.map((card) => ({ ...card, source: { ...card.source!, accountId: "acct-2" } }))] };
    const merged = merge(otherAccount, snapshot([work("w1")]));
    expect(merged.cards).toHaveLength(3);
    expect(merged.cards.find((card) => card.id === "local")).toBe(local);
    const mine = merged.cards.find((card) => card.source?.accountId === ACCOUNT)!;
    expect(mine.order).toBe(1);
    expect(merged.cards.filter((card) => card.source?.accountId === "acct-2")).toHaveLength(1);
  });

  it("rejects non-https links", () => {
    expect(safeLink("javascript:alert(1)")).toBeUndefined();
    expect(safeLink("http://classroom.google.com")).toBeUndefined();
    expect(safeLink("https://classroom.google.com/a")).toBe("https://classroom.google.com/a");
  });

  it("maps submission states to labels", () => {
    expect(submissionLabel("TURNED_IN")).toBe("Turned in");
    expect(submissionLabel("RETURNED")).toBe("Returned");
    expect(submissionLabel("NEW")).toBe("Not started");
    expect(submissionLabel("SUBMISSION_STATE_UNSPECIFIED")).toBeNull();
    expect(submissionLabel(undefined)).toBeNull();
  });
});

describe("collection subscriptions", () => {
  const empty = (): BoardCollection => ({ version: 1, boards: [{ ...board(), id: "personal", title: "Personal" }], activeBoardId: "personal" });
  const courses = [{ id: "c1", name: "Biology" }, { id: "c2", name: "History" }];

  it("creates one board per selected course and reuses it after reselecting", () => {
    let collection = setSubscriptions(empty(), ACCOUNT, courses, new Set(["c1", "c2"]));
    expect(collection.boards.map((item) => item.title)).toEqual(["Personal", "Biology", "History"]);
    expect(collection.boards[1].columns.map((column) => column.title)).toEqual(["To Do", "In Progress", "Done"]);
    const biology = collection.classroom!.courses.c1.boardId;
    expect(subscribedCourses(collection, ACCOUNT)).toEqual(["c1", "c2"]);

    collection = setSubscriptions(collection, ACCOUNT, courses, new Set(["c2"]));
    expect(collection.boards).toHaveLength(3);
    expect(subscribedCourses(collection, ACCOUNT)).toEqual(["c2"]);

    collection = setSubscriptions(collection, ACCOUNT, courses, new Set(["c1", "c2"]));
    expect(collection.boards).toHaveLength(3);
    expect(collection.classroom!.courses.c1.boardId).toBe(biology);
  });

  it("selects a newly imported board when the collection was empty", () => {
    const collection = setSubscriptions({ version: 1, boards: [], activeBoardId: null }, ACCOUNT, courses, new Set(["c1"]));
    expect(collection.activeBoardId).toBe(collection.classroom?.courses.c1.boardId);
  });

  it("drops stale results for unsubscribed courses, deleted boards, or other accounts", () => {
    let collection = setSubscriptions(empty(), ACCOUNT, courses, new Set(["c1"]));
    const result = (courseId: string) => ({ courseId, courseWork: [work("w1")], submissions: [] });
    expect(applySnapshots(collection, "acct-2", [result("c1")], NOW)).toBe(collection);
    const applied = applySnapshots(collection, ACCOUNT, [result("c1"), result("c2")], NOW);
    expect(applied.boards.find((item) => item.title === "Biology")!.cards).toHaveLength(1);
    expect(applied.classroom!.courses.c1.refreshedAt).toBe(NOW);
    expect(applied.classroom!.lastRefreshAt).toBe(NOW);

    const boardId = collection.classroom!.courses.c1.boardId!;
    collection = unlinkBoard({ ...collection, boards: collection.boards.filter((item) => item.id !== boardId) }, boardId);
    expect(collection.classroom!.courses.c1).toMatchObject({ subscribed: false, boardId: undefined });
    expect(subscribedCourses(collection, ACCOUNT)).toEqual([]);
  });

  it("does not carry subscriptions over to a different account", () => {
    const collection = setSubscriptions(empty(), ACCOUNT, courses, new Set(["c1"]));
    expect(subscribedCourses(collection, "acct-2")).toEqual([]);
    expect(Object.values(accountState(collection, "acct-2").courses).every((link) => !link.subscribed)).toBe(true);
    const other = setSubscriptions(collection, "acct-2", courses, new Set(["c1"]));
    expect(other.classroom?.courses.c1.boardId).not.toBe(collection.classroom?.courses.c1.boardId);
    expect(other.boards).toHaveLength(3);
  });

  it("suppresses reimport of deleted cards and deleted columns", () => {
    let collection = setSubscriptions(empty(), ACCOUNT, courses, new Set(["c1"]));
    collection = applySnapshots(collection, ACCOUNT, [snapshot([work("w1"), work("w2")])], NOW);
    const before = collection.boards.find((item) => item.title === "Biology")!;
    const after = { ...before, columns: before.columns.filter((column) => column.id !== before.columns[0].id), cards: [] };
    collection = suppressDeleted(collection, before, after);
    expect(collection.classroom!.ignored.sort()).toEqual([importKey(ACCOUNT, "c1", "w1"), importKey(ACCOUNT, "c1", "w2")]);
  });
});

describe("persistence", () => {
  it("loads older collections without connector data", () => {
    const parsed = parseBoardCollection(JSON.stringify({ version: 1, boards: [board()], activeBoardId: "b1" }));
    expect(parsed.classroom).toBeUndefined();
    expect(parsed.boards[0].cards).toEqual([]);
  });

  it("round-trips connector state, card sources, and instants", () => {
    let collection = setSubscriptions({ version: 1, boards: [], activeBoardId: null }, ACCOUNT, [{ id: "c1", name: "Biology" }], new Set(["c1"]));
    collection = applySnapshots(collection, ACCOUNT, [snapshot([work("w1", { dueDate: { year: 2026, month: 11, day: 2 } })])], NOW);
    collection = { ...collection, classroom: { ...collection.classroom!, ignored: ["acct-1:c1:w9"] } };
    const parsed = parseBoardCollection(JSON.stringify(collection));
    expect(parsed.classroom).toEqual(collection.classroom);
    expect(parsed.boards[0].cards[0].source).toEqual(collection.boards[0].cards[0].source);
    expect(parsed.boards[0].cards[0].dueAt).toBe("2026-11-02T23:59:59.000Z");
  });

  it("drops malformed connector data without rejecting the boards", () => {
    const parsed = parseBoardCollection(JSON.stringify({ version: 1, boards: [board()], activeBoardId: "b1", classroom: "bad" }));
    expect(parsed.classroom).toBeUndefined();
    expect(parsed.boards).toHaveLength(1);
  });
});
