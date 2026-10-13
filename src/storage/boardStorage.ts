import type { Board } from "../domain/types";

/** Legacy single-board key, retained only for migration. */
export const BOARD_STORAGE_KEY = "kanban.board.v1";

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
