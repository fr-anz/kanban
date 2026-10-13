import { describe, expect, it } from "vitest";
import type { Board } from "./types";
import { EMPTY_FILTERS, visibleCards } from "./boardFilters";

const board: Board = {
  id: "board", title: "Work", columns: [], tags: [{ id: "design", name: "Design", colorIndex: 0 }],
  cards: [
    { id: "a", columnId: "todo", title: "Logo", description: "Refine the mark", priority: "high", tagIds: ["design"], subtasks: [], createdAt: "", updatedAt: "", order: 0 },
    { id: "b", columnId: "done", title: "Ship", description: "Publish the release", priority: "low", tagIds: [], subtasks: [], createdAt: "", updatedAt: "", order: 0 },
  ],
};

describe("visible cards", () => {
  it("searches titles, descriptions, and known tags with trimmed case-insensitive input", () => {
    for (const query of ["  LOGO  ", "refine", "design"]) expect(visibleCards(board, query, EMPTY_FILTERS).map((card) => card.id)).toEqual(["a"]);
    expect(visibleCards(board, "missing", EMPTY_FILTERS)).toEqual([]);
  });
  it("combines filters without changing stored cards or ordering", () => {
    expect(visibleCards(board, "", { priority: "high", tagId: "design", columnId: "todo" })).toEqual([board.cards[0]]);
    expect(visibleCards(board, "", { priority: "low", tagId: "design", columnId: "all" })).toEqual([]);
    expect(visibleCards(board, "", EMPTY_FILTERS)).toEqual(board.cards);
    expect(board.cards).toHaveLength(2);
  });
});
