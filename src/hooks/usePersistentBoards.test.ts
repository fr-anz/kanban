import { createElement, StrictMode, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BoardCollection } from "../domain/types";
import { usePersistentBoards } from "./usePersistentBoards";
import { createBoard, useBoard } from "./useBoard";

function memoryStorage(initial: BoardCollection | null = null) {
  let data = initial;
  return {
    load: vi.fn(async () => data),
    save: vi.fn(async (collection: BoardCollection) => { data = collection; }),
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("usePersistentBoards", () => {
  it("loads once and saves the default board even without edits", async () => {
    const storage = memoryStorage();
    const { result } = renderHook(() => usePersistentBoards(storage));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.activeBoard?.columns.map((column) => column.title)).toEqual(["To Do", "In Progress", "Done"]);
    await waitFor(async () => expect((await storage.load())?.boards).toHaveLength(1));
  });

  it("preserves board ownership through edits, card moves, and rapid selection", async () => {
    const storage = memoryStorage();
    const { result } = renderHook(() => {
      const workspace = usePersistentBoards(storage);
      const active = workspace.activeBoard;
      const board = useBoard(undefined, active ? {
        board: active, setBoard: (update) => workspace.updateBoard(active.id, update),
      } : undefined);
      return { workspace, board };
    });
    await waitFor(() => expect(result.current.workspace.loaded).toBe(true));
    const firstId = result.current.board.id;
    const [todo, progress] = result.current.board.columns;
    let cardId = "";
    act(() => {
      result.current.board.addColumn("QA");
      cardId = result.current.board.addCard(todo.id, { title: "First task" });
      result.current.board.addTag("First tag");
    });
    act(() => result.current.board.moveCardTo(cardId, progress.id, 0));
    act(() => result.current.workspace.addBoard("  Second  "));
    expect(result.current.board.title).toBe("Second");
    expect(result.current.board.cards).toEqual([]);
    expect(result.current.board.tags).toEqual([]);
    const secondId = result.current.board.id;
    act(() => result.current.board.addCard(result.current.board.columns[0].id, { title: "Second task" }));
    act(() => result.current.workspace.selectBoard(firstId));
    expect(result.current.board.columns[result.current.board.columns.length - 1]?.title).toBe("QA");
    expect(result.current.board.cards[0]).toMatchObject({ id: cardId, columnId: progress.id, order: 0 });
    act(() => result.current.workspace.selectBoard(secondId));
    await waitFor(async () => {
      const saved = await storage.load();
      expect(saved?.activeBoardId).toBe(secondId);
      expect(saved?.boards[0].tags[0].name).toBe("First tag");
      expect(saved?.boards[1].cards[0].title).toBe("Second task");
    });
  });

  it("renames, deletes inactive/active boards, and persists zero boards", async () => {
    const boards = [createBoard("First"), createBoard("Second"), createBoard("Third")];
    const storage = memoryStorage({ version: 1, boards, activeBoardId: boards[1].id });
    const { result } = renderHook(() => usePersistentBoards(storage));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.renameBoard(boards[1].id, "  Renamed  "));
    expect(result.current.activeBoard?.title).toBe("Renamed");
    act(() => result.current.deleteBoard(boards[2].id));
    expect(result.current.activeBoard?.id).toBe(boards[1].id);
    act(() => result.current.deleteBoard(boards[1].id));
    expect(result.current.activeBoard?.id).toBe(boards[0].id);
    act(() => result.current.deleteBoard(boards[0].id));
    expect(result.current.activeBoard).toBeNull();
    await waitFor(async () => expect(await storage.load()).toEqual({ version: 1, boards: [], activeBoardId: null }));
    act(() => result.current.addBoard("Restart"));
    expect(result.current.activeBoard?.title).toBe("Restart");
    await waitFor(async () => expect((await storage.load())?.boards[0].title).toBe("Restart"));
  });

  it("does not save defaults before a delayed load, including StrictMode", async () => {
    const gate = deferred();
    const board = createBoard("Saved");
    const storage = memoryStorage({ version: 1, boards: [board], activeBoardId: board.id });
    storage.load.mockImplementation(async () => { await gate.promise; return { version: 1, boards: [board], activeBoardId: board.id }; });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);
    // createElement avoids JSX in this .ts hook test.
    const { result } = renderHook(() => usePersistentBoards(storage), { wrapper });
    expect(storage.save).not.toHaveBeenCalled();
    await act(async () => gate.resolve());
    await waitFor(() => expect(result.current.activeBoard?.title).toBe("Saved"));
    expect(storage.save.mock.calls.every(([saved]) => saved.boards[0].id === board.id)).toBe(true);
  });

  it("surfaces load errors without writing and supports retry", async () => {
    const storage = memoryStorage();
    storage.load.mockRejectedValueOnce(new Error("denied"));
    const { result } = renderHook(() => usePersistentBoards(storage));
    await waitFor(() => expect(result.current.loadError).toBe(true));
    expect(result.current.loaded).toBe(false);
    expect(storage.save).not.toHaveBeenCalled();
    act(() => result.current.retryLoad());
    await waitFor(() => expect(result.current.loaded).toBe(true));
  });

  it("serializes snapshots and retries the latest state after a save failure", async () => {
    const storage = memoryStorage();
    const gate = deferred();
    storage.save.mockImplementationOnce(async () => { await gate.promise; throw new Error("quota"); });
    const { result } = renderHook(() => usePersistentBoards(storage));
    await waitFor(() => expect(storage.save).toHaveBeenCalledTimes(1));
    act(() => result.current.addBoard("Second"));
    expect(storage.save).toHaveBeenCalledTimes(1);
    await act(async () => gate.resolve());
    await waitFor(async () => expect((await storage.load())?.boards).toHaveLength(2));
    expect(result.current.saveError).toBe(false);
    storage.save.mockRejectedValueOnce(new Error("quota"));
    act(() => result.current.renameBoard(result.current.activeBoard!.id, "Latest"));
    await waitFor(() => expect(result.current.saveError).toBe(true));
    act(() => result.current.retrySave());
    await waitFor(() => expect(result.current.saveError).toBe(false));
    expect((await storage.load())?.boards[1].title).toBe("Latest");
  });
});
