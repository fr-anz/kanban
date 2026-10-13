import type { BoardCollection } from "../domain/types";
import { BOARD_STORAGE_KEY, parseBoard } from "./boardStorage";

export interface BoardCollectionStorage {
  load(): Promise<BoardCollection | null>;
  save(collection: BoardCollection): Promise<void>;
}

export const BOARDS_STORAGE_KEY = "kanban.boards.v1";

/** Existing collection data must never silently fall back to a fresh board. */
export function parseBoardCollection(raw: string): BoardCollection {
  const value = JSON.parse(raw) as BoardCollection;
  if (
    !value || value.version !== 1 || !Array.isArray(value.boards) ||
    !value.boards.every((board) =>
      board && typeof board.id === "string" && board.id.length > 0 &&
      typeof board.title === "string" && parseBoard(JSON.stringify(board)) !== null,
    ) ||
    new Set(value.boards.map((board) => board.id)).size !== value.boards.length ||
    (value.activeBoardId !== null && typeof value.activeBoardId !== "string")
  ) throw new Error("Invalid board collection");

  return {
    version: 1,
    boards: value.boards,
    activeBoardId: value.boards.some((board) => board.id === value.activeBoardId)
      ? value.activeBoardId
      : value.boards[0]?.id ?? null,
  };
}

export function localStorageBoardCollectionStorage(): BoardCollectionStorage {
  return {
    load: async () => {
      const raw = localStorage.getItem(BOARDS_STORAGE_KEY);
      if (raw !== null) return parseBoardCollection(raw);
      const legacy = parseBoard(localStorage.getItem(BOARD_STORAGE_KEY));
      return legacy ? { version: 1, boards: [legacy], activeBoardId: legacy.id } : null;
    },
    save: async (collection) => {
      localStorage.setItem(BOARDS_STORAGE_KEY, JSON.stringify(collection));
    },
  };
}
