import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useBoard } from "./useBoard";

describe("useBoard (in-memory)", () => {
  it("starts with 3 default columns", () => {
    const { result } = renderHook(() => useBoard());
    expect(result.current.columns.map((c) => c.title)).toEqual([
      "To Do",
      "In Progress",
      "Done",
    ]);
  });

  it("creates, renames, deletes columns", () => {
    const { result } = renderHook(() => useBoard());
    let id = "";
    act(() => {
      id = result.current.addColumn("Review");
    });
    expect(result.current.columns).toHaveLength(4);
    act(() => result.current.renameColumn(id, "QA"));
    expect(
      result.current.columns.find((c) => c.id === id)?.title,
    ).toBe("QA");
    act(() => result.current.deleteColumn(id));
    expect(result.current.columns).toHaveLength(3);
  });

  it("creates, edits, deletes, moves cards", () => {
    const { result } = renderHook(() => useBoard());
    const colId = result.current.columns[0].id;
    const doneId = result.current.columns[2].id;
    let cardId = "";
    act(() => {
      cardId = result.current.addCard(colId, { title: "Ship it" });
    });
    expect(result.current.cards).toHaveLength(1);
    act(() =>
      result.current.updateCard(cardId, {
        title: "Ship it!",
        priority: "high",
      }),
    );
    expect(
      result.current.cards.find((c) => c.id === cardId)?.title,
    ).toBe("Ship it!");
    act(() => result.current.moveCard(cardId, doneId));
    expect(
      result.current.cards.find((c) => c.id === cardId)?.columnId,
    ).toBe(doneId);
    act(() => result.current.deleteCard(cardId));
    expect(result.current.cards).toHaveLength(0);
  });

  it("creates and deletes tags; deleted tags vanish from lookup", () => {
    const { result } = renderHook(() => useBoard());
    let tagId = "";
    act(() => {
      tagId = result.current.addTag("bug", 2);
    });
    expect(result.current.tags.map((t) => t.name)).toContain("bug");
    const colId = result.current.columns[0].id;
    let cardId = "";
    act(() => {
      cardId = result.current.addCard(colId, {
        title: "Fix",
        tagIds: [tagId],
      });
    });
    act(() => result.current.deleteTag(tagId));
    expect(result.current.tags).toHaveLength(0);
    expect(
      result.current.cards.find((c) => c.id === cardId)?.tagIds,
    ).toEqual([tagId]); // stored, filtered at render via visibleTags
  });

  it("reorders columns", () => {
    const { result } = renderHook(() => useBoard());
    const ids = result.current.columns.map((c) => c.id);
    act(() => result.current.reorderColumns([ids[2], ids[0], ids[1]]));
    expect(result.current.columns.map((c) => c.id)).toEqual([
      ids[2],
      ids[0],
      ids[1],
    ]);
  });
});
