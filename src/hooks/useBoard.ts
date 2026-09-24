import { useState } from "react";
import {
  newId,
  nextPresetIndex,
  type Board,
  type Card,
  type Column,
  type Priority,
  type Tag,
} from "../domain/types";

export interface NewCard {
  title: string;
  description?: string;
  deadline?: string;
  priority?: Priority;
  tagIds?: string[];
}

const nowIso = () => new Date().toISOString();

function defaults(): Board {
  const mk = (title: string, i: number): Column => ({
    id: newId(),
    title,
    colorIndex: nextPresetIndex(i),
    order: i,
  });
  const columns = [mk("To Do", 0), mk("In Progress", 1), mk("Done", 2)];
  return { id: newId(), title: "My Board", columns, cards: [], tags: [] };
}

export function useBoard(initial?: Board) {
  const [board, setBoard] = useState<Board>(initial ?? defaults);

  const addColumn = (title: string): string => {
    const col: Column = {
      id: newId(),
      title: title || "New column",
      colorIndex: nextPresetIndex(board.columns.length),
      order: board.columns.length,
    };
    setBoard((b) => ({ ...b, columns: [...b.columns, col] }));
    return col.id;
  };

  const renameColumn = (id: string, title: string) =>
    setBoard((b) => ({
      ...b,
      columns: b.columns.map((c) =>
        c.id === id ? { ...c, title: title || c.title } : c,
      ),
    }));

  const deleteColumn = (id: string) =>
    setBoard((b) => ({
      ...b,
      columns: b.columns.filter((c) => c.id !== id),
      cards: b.cards.filter((c) => c.columnId !== id),
    }));

  const reorderColumns = (orderedIds: string[]) =>
    setBoard((b) => ({
      ...b,
      columns: orderedIds
        .map((id) => b.columns.find((c) => c.id === id))
        .filter((c): c is Column => Boolean(c))
        .map((c, i) => ({ ...c, order: i })),
    }));

  const addCard = (columnId: string, input: NewCard): string => {
    const count = board.cards.filter((c) => c.columnId === columnId).length;
    const card: Card = {
      id: newId(),
      columnId,
      title: input.title,
      description: input.description ?? "",
      deadline: input.deadline,
      priority: input.priority ?? "medium",
      tagIds: input.tagIds ?? [],
      subtasks: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      order: count,
    };
    setBoard((b) => ({ ...b, cards: [...b.cards, card] }));
    return card.id;
  };

  const updateCard = (id: string, patch: Partial<Card>) =>
    setBoard((b) => ({
      ...b,
      cards: b.cards.map((c) =>
        c.id === id ? { ...c, ...patch, id, updatedAt: nowIso() } : c,
      ),
    }));

  const deleteCard = (id: string) =>
    setBoard((b) => ({ ...b, cards: b.cards.filter((c) => c.id !== id) }));

  /** Positional move: sets ownership + index, renormalizes both columns. */
  const moveCardTo = (id: string, toColumnId: string, toIndex?: number) =>
    setBoard((b) => {
      const card = b.cards.find((c) => c.id === id);
      if (!card) return b;
      const from = card.columnId;
      const moved: Card = {
        ...card,
        columnId: toColumnId,
        updatedAt: nowIso(),
      };
      const rest = b.cards.filter((c) => c.id !== id);
      const inTarget = rest
        .filter((c) => c.columnId === toColumnId)
        .sort((x, y) => x.order - y.order);
      const at = Math.max(
        0,
        Math.min(toIndex ?? inTarget.length, inTarget.length),
      );
      const nextTarget = [
        ...inTarget.slice(0, at),
        moved,
        ...inTarget.slice(at),
      ].map((c, i) => ({ ...c, order: i }));
      const targetIds = new Set(nextTarget.map((c) => c.id));
      const untouched = rest.filter((c) => !targetIds.has(c.id));
      // Close the gap left in the source column (no-op for same-column).
      const sourceIds =
        from === toColumnId
          ? new Set<string>()
          : new Set(
              untouched.filter((c) => c.columnId === from).map((c) => c.id),
            );
      const sourceRenorm = untouched
        .filter((c) => sourceIds.has(c.id))
        .sort((x, y) => x.order - y.order)
        .map((c, i) => ({ ...c, order: i }));
      const renormIds = new Set(sourceRenorm.map((c) => c.id));
      return {
        ...b,
        cards: [
          ...untouched.filter((c) => !renormIds.has(c.id)),
          ...sourceRenorm,
          ...nextTarget,
        ],
      };
    });

  const moveCard = (id: string, toColumnId: string) =>
    moveCardTo(id, toColumnId);

  const addTag = (name: string, colorIndex = 0): string => {
    const tag: Tag = { id: newId(), name, colorIndex };
    setBoard((b) => ({ ...b, tags: [...b.tags, tag] }));
    return tag.id;
  };

  const deleteTag = (id: string) =>
    setBoard((b) => ({ ...b, tags: b.tags.filter((t) => t.id !== id) }));

  return {
    ...board,
    addColumn,
    renameColumn,
    deleteColumn,
    reorderColumns,
    addCard,
    updateCard,
    deleteCard,
    moveCard,
    moveCardTo,
    addTag,
    deleteTag,
    setBoard,
  };
}

export type BoardApi = ReturnType<typeof useBoard>;
