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

  const moveCard = (id: string, toColumnId: string) =>
    setBoard((b) => ({
      ...b,
      cards: b.cards.map((c) =>
        c.id === id
          ? { ...c, columnId: toColumnId, updatedAt: nowIso() }
          : c,
      ),
    }));

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
    addTag,
    deleteTag,
    setBoard,
  };
}

export type BoardApi = ReturnType<typeof useBoard>;
