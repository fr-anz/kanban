import type { Board, Card, Priority } from "./types";

export interface BoardFilters {
  priority: "all" | Priority;
  tagId: string;
  columnId: string;
}
export const EMPTY_FILTERS: BoardFilters = { priority: "all", tagId: "all", columnId: "all" };

export function visibleCards(board: Board, query: string, filters: BoardFilters): Card[] {
  const text = query.trim().toLocaleLowerCase();
  return board.cards.filter((card) =>
    (filters.priority === "all" || card.priority === filters.priority) &&
    (filters.tagId === "all" || card.tagIds.includes(filters.tagId)) &&
    (filters.columnId === "all" || card.columnId === filters.columnId) &&
    (!text || [card.title, card.description, ...board.tags.filter((tag) => card.tagIds.includes(tag.id)).map((tag) => tag.name)]
      .some((value) => value.toLocaleLowerCase().includes(text))),
  );
}
