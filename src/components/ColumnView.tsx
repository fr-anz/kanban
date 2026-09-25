import { useEffect, useState } from "react";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { COLUMN_PRESETS, type Column } from "../domain/types";
import CardView from "./CardView";
import type { BoardApi } from "../hooks/useBoard";
import { isDoneColumn } from "../domain/deadlines";

export default function ColumnView({
  column,
  board,
  autoRename,
  onOpenCard,
  dropHighlight,
}: {
  column: Column;
  board: BoardApi;
  autoRename: boolean;
  onOpenCard: (cardId: string) => void;
  dropHighlight: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: column.id, data: { type: "column" } });
  const preset = COLUMN_PRESETS[column.colorIndex % COLUMN_PRESETS.length];
  const [editing, setEditing] = useState(autoRename);
  const [draft, setDraft] = useState(column.title);
  const [addingCard, setAddingCard] = useState(false);
  const [cardTitle, setCardTitle] = useState("");

  useEffect(() => {
    if (autoRename) setEditing(true);
  }, [autoRename]);

  const commit = () => {
    if (draft.trim()) board.renameColumn(column.id, draft.trim());
    else setDraft(column.title);
    setEditing(false);
  };

  const addCard = () => {
    const title = cardTitle.trim();
    if (!title) return;
    board.addCard(column.id, { title });
    setCardTitle("");
    setAddingCard(false);
  };

  const cards = board.cards
    .filter((c) => c.columnId === column.id)
    .sort((a, b) => a.order - b.order);
  const done = isDoneColumn(column.title);

  return (
    <section
      ref={setNodeRef}
      className={`kb-col${isOver || dropHighlight ? " drop-over" : ""}${isDragging ? " is-dragging" : ""}`}
      style={{
        background: preset.field,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      data-testid={`column-${column.id}`}
    >
      <div className="kb-col-head" style={{ background: preset.header }}>
        <button
          ref={setActivatorNodeRef}
          className="kb-col-drag"
          aria-label={`Move ${column.title}`}
          title="Drag to reorder column"
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
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
        {addingCard ? (
          <form
            className="kb-addcard-form"
            onSubmit={(e) => {
              e.preventDefault();
              addCard();
            }}
          >
            <input
              autoFocus
              aria-label={`New card title in ${column.title}`}
              placeholder="Card title"
              value={cardTitle}
              onChange={(e) => setCardTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setCardTitle("");
                  setAddingCard(false);
                }
              }}
            />
            <div className="kb-addcard-actions">
              <button type="submit" className="kb-btn primary">Add</button>
              <button
                type="button"
                className="kb-btn"
                onClick={() => {
                  setCardTitle("");
                  setAddingCard(false);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button className="kb-addcard" onClick={() => setAddingCard(true)}>
            + Add card
          </button>
        )}
      </div>
    </section>
  );
}
