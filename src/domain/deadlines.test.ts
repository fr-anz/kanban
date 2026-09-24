import { describe, expect, it } from "vitest";
import {
  deadlineLabel,
  getDeadlineStatus,
  getProgress,
  isDoneColumn,
  visibleTags,
} from "./deadlines";

const noon = (iso: string) => new Date(`${iso}T12:00:00`);

describe("getDeadlineStatus", () => {
  it("returns none when no deadline", () => {
    expect(getDeadlineStatus(undefined, noon("2026-10-01"))).toEqual({
      kind: "none",
    });
  });

  it("marks past dates overdue with day count", () => {
    expect(getDeadlineStatus("2026-09-20", noon("2026-09-24"))).toEqual({
      kind: "overdue",
      daysOverdue: 4,
    });
  });

  it("marks today", () => {
    expect(getDeadlineStatus("2026-09-24", noon("2026-09-24"))).toEqual({
      kind: "today",
    });
  });

  it("marks within 3 days as soon", () => {
    expect(getDeadlineStatus("2026-09-26", noon("2026-09-24"))).toEqual({
      kind: "soon",
      daysLeft: 2,
    });
  });

  it("marks distant dates on track with formatted label", () => {
    const s = getDeadlineStatus("2026-10-12", noon("2026-09-24"));
    expect(s.kind).toBe("ontrack");
    if (s.kind === "ontrack") expect(s.label).toBe("Oct 12");
  });
});

describe("deadlineLabel", () => {
  it("formats each state from spec examples", () => {
    expect(deadlineLabel({ kind: "overdue", daysOverdue: 2 })).toBe(
      "2d overdue",
    );
    expect(deadlineLabel({ kind: "today" })).toBe("Due today");
    expect(deadlineLabel({ kind: "soon", daysLeft: 2 })).toBe("2d left");
    expect(deadlineLabel({ kind: "ontrack", label: "Oct 12" })).toBe("Oct 12");
    expect(deadlineLabel({ kind: "none" })).toBeNull();
  });
});

describe("isDoneColumn", () => {
  it("matches case-insensitively", () => {
    expect(isDoneColumn("Done")).toBe(true);
    expect(isDoneColumn("done")).toBe(true);
    expect(isDoneColumn("DONE")).toBe(true);
    expect(isDoneColumn("Todo")).toBe(false);
  });
});

describe("getProgress", () => {
  it("counts cards in done column", () => {
    const columns = [
      { id: "a", title: "Todo" },
      { id: "b", title: "Done" },
    ];
    const cards = [
      { columnId: "a" },
      { columnId: "b" },
      { columnId: "b" },
    ];
    expect(getProgress(columns, cards)).toEqual({ done: 2, total: 3 });
  });
});

describe("visibleTags", () => {
  it("filters out tags deleted from manager", () => {
    const tags = [{ id: "t1", name: "bug", colorIndex: 0 }];
    expect(
      visibleTags({ tagIds: ["t1", "ghost"] }, tags).map((t) => t.id),
    ).toEqual(["t1"]);
  });
});
