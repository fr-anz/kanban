import { useEffect, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { COLUMN_PRESETS, type Column } from "../domain/types";
import CardView from "./CardView";
import type { BoardApi } from "../hooks/useBoard";
import { isDoneColumn } from "../domain/deadlines";

export default function ColumnView({
  column,
  board,
  autoRename,
  onAddCard,
  onOpenCard,
  dropHighlight,
}: {
  column: Column;
  board: BoardApi;
  autoRename: boolean;
  onAddCard: () => void;
  onOpenCard: (cardId: string) => void;
  dropHighlight: boolean;
}) {
  // Droppable so cards can land in empty columns; cards themselves are
  // the drop targets once the column has content.
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const preset = COLUMN_PRESETS[column.colorIndex % COLUMN_PRESETS.length];
  const [editing, setEditing] = useState(autoRename);
  const [draft, setDraft] = useState(column.title);

  useEffect(() => {
    if (autoRename) setEditing(true);
  }, [autoRename]);

  const commit = () => {
    if (draft.trim()) board.renameColumn(column.id, draft.trim());
    else setDraft(column.title);
    setEditing(false);
  };

  const cards = board.cards
    .filter((c) => c.columnId === column.id)
    .sort((a, b) => a.order - b.order);
  const done = isDoneColumn(column.title);

  return (
    <section
      ref={setNodeRef}
      className={`kb-col${isOver || dropHighlight ? " drop-over" : ""}`}
      style={{ background: preset.field }}
      data-testid={`column-${column.id}`}
    >
      <div className="kb-col-head" style={{ background: preset.header }}>
        {editing ? (
          <input
            className="kb-rename"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(column.title);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            className="kb-col-label"
            style={{ color: preset.accent }}
            onClick={() => {
              setDraft(column.title);
              setEditing(true);
            }}
            title="Rename column"
          >
            {column.title}
          </button>
        )}
        <span className="kb-count mono" style={{ color: preset.accent }}>
          {cards.length}
        </span>
        <button
          className="kb-x"
          aria-label={`Delete ${column.title}`}
          onClick={() => board.deleteColumn(column.id)}
        >
          ×
        </button>
      </div>
      <div className="kb-col-body">
        <SortableContext
          items={cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((c) => (
            <CardView
              key={c.id}
              card={c}
              tags={board.tags}
              done={done}
              onOpen={() => onOpenCard(c.id)}
              onDelete={() => board.deleteCard(c.id)}
            />
          ))}
        </SortableContext>
        <button className="kb-addcard" onClick={onAddCard}>
          + Add card
        </button>
      </div>
    </section>
  );
}
