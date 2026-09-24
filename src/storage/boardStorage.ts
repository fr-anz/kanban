import type { Board } from "../domain/types";

/** Seam D: persistence backend (memory / localStorage / Tauri file). */
export interface BoardStorage {
  load(): Promise<Board | null>;
  save(board: Board): Promise<void>;
}

export const BOARD_STORAGE_KEY = "kanban.board.v1";

export function serializeBoard(board: Board): string {
  return JSON.stringify(board);
}

/** Null on corrupt/missing — caller falls back to defaults. */
export function parseBoard(raw: string | null | undefined): Board | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Board>;
    if (
      typeof v !== "object" ||
      v === null ||
      !Array.isArray(v.columns) ||
      !Array.isArray(v.cards) ||
      !Array.isArray(v.tags)
    )
      return null;
    return v as Board;
  } catch {
    return null;
  }
}

export function memoryBoardStorage(): BoardStorage & { raw(): string | null } {
  let data: string | null = null;
  return {
    raw: () => data,
    load: async () => parseBoard(data),
    save: async (b) => {
      data = serializeBoard(b);
    },
  };
}

export function localStorageBoardStorage(
  key = BOARD_STORAGE_KEY,
): BoardStorage {
  return {
    load: async () => {
      try {
        return parseBoard(localStorage.getItem(key));
      } catch {
        return null;
      }
    },
    save: async (b) => {
      try {
        localStorage.setItem(key, serializeBoard(b));
      } catch {
        // quota/private-mode: persistence is best-effort
      }
    },
  };
}
