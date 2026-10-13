import { describe, expect, it } from "vitest";
import type { BoardCollection } from "../domain/types";
import { createBoard } from "../hooks/useBoard";
import { BOARD_STORAGE_KEY } from "./boardStorage";
import { BOARDS_STORAGE_KEY, localStorageBoardCollectionStorage, parseBoardCollection } from "./boardCollectionStorage";

describe("board collection browser storage", () => {
  it("migrates a legacy board unchanged and preserves its source", async () => {
    const board = createBoard("Existing work");
    const raw = JSON.stringify(board);
    localStorage.setItem(BOARD_STORAGE_KEY, raw);
    const storage = localStorageBoardCollectionStorage();
    const migrated = await storage.load();
    expect(migrated).toEqual({ version: 1, boards: [board], activeBoardId: board.id });
    await storage.save(migrated!);
    expect(localStorage.getItem(BOARD_STORAGE_KEY)).toBe(raw);
    expect(await storage.load()).toEqual(migrated);
  });

  it("round-trips boards and selection", async () => {
    const boards = [createBoard("Work"), createBoard("Personal")];
    const collection: BoardCollection = { version: 1, boards, activeBoardId: boards[1].id };
    const storage = localStorageBoardCollectionStorage();
    await storage.save(collection);
    expect(await storage.load()).toEqual(collection);
  });

  it("an explicitly empty collection takes precedence over legacy data", async () => {
    localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(createBoard()));
    const empty: BoardCollection = { version: 1, boards: [], activeBoardId: null };
    const storage = localStorageBoardCollectionStorage();
    await storage.save(empty);
    expect(await storage.load()).toEqual(empty);
  });

  it("rejects corrupt collections rather than replacing existing data", async () => {
    localStorage.setItem(BOARDS_STORAGE_KEY, "not-json");
    await expect(localStorageBoardCollectionStorage().load()).rejects.toThrow();
    expect(localStorage.getItem(BOARDS_STORAGE_KEY)).toBe("not-json");
    const board = createBoard();
    expect(() => parseBoardCollection(JSON.stringify({ version: 1, boards: [board, board], activeBoardId: board.id }))).toThrow();
  });

  it("recovers an invalid selection using the first existing board", () => {
    const board = createBoard();
    expect(parseBoardCollection(JSON.stringify({ version: 1, boards: [board], activeBoardId: "missing" })).activeBoardId).toBe(board.id);
  });
});
