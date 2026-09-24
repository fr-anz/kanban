import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePersistentBoard } from "./usePersistentBoard";
import { memoryBoardStorage } from "../storage/boardStorage";
import type { Board } from "../domain/types";

const stored: Board = {
  id: "b9",
  title: "Restored",
  columns: [{ id: "c1", title: "To Do", colorIndex: 0, order: 0 }],
  cards: [],
  tags: [],
};

describe("usePersistentBoard", () => {
  it("auto-loads stored board on start", async () => {
    const storage = memoryBoardStorage();
    await storage.save(stored);
    const { result } = renderHook(() => usePersistentBoard(storage));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.title).toBe("Restored");
  });

  it("falls back to defaults when storage empty", async () => {
    const storage = memoryBoardStorage();
    const { result } = renderHook(() => usePersistentBoard(storage));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.columns.map((c) => c.title)).toEqual([
      "To Do",
      "In Progress",
      "Done",
    ]);
  });

  it("auto-saves after mutations", async () => {
    const storage = memoryBoardStorage();
    const { result } = renderHook(() => usePersistentBoard(storage));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => {
      result.current.addColumn("QA");
    });
    await waitFor(async () => {
      const saved = await storage.load();
      expect(saved?.columns.map((c) => c.title)).toContain("QA");
    });
  });
});
