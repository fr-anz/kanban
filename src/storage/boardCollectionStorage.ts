import type { BoardCollection, ClassroomState } from "../domain/types";
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

  const classroom = parseClassroomState(value.classroom);
  return {
    version: 1,
    boards: value.boards,
    activeBoardId: value.boards.some((board) => board.id === value.activeBoardId)
      ? value.activeBoardId
      : value.boards[0]?.id ?? null,
    ...(classroom && { classroom }),
  };
}

/** Connector bookkeeping is optional; malformed data is dropped rather than blocking boards. */
export function parseClassroomState(value: unknown): ClassroomState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<ClassroomState>;
  if (!raw.courses || typeof raw.courses !== "object" || Array.isArray(raw.courses)) return undefined;
  const courses: ClassroomState["courses"] = {};
  for (const [id, course] of Object.entries(raw.courses)) {
    if (!course || typeof course !== "object" || typeof course.name !== "string") continue;
    courses[id] = {
      name: course.name,
      subscribed: course.subscribed === true,
      ...(typeof course.boardId === "string" && { boardId: course.boardId }),
      ...(typeof course.refreshedAt === "string" && { refreshedAt: course.refreshedAt }),
    };
  }
  return {
    courses,
    ignored: Array.isArray(raw.ignored) ? raw.ignored.filter((key) => typeof key === "string") : [],
    ...(typeof raw.accountId === "string" && { accountId: raw.accountId }),
    ...(typeof raw.lastRefreshAt === "string" && { lastRefreshAt: raw.lastRefreshAt }),
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
