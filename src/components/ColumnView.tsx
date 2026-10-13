import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card, Column } from "../domain/types";
import CardView from "./CardView";
import type { BoardApi } from "../hooks/useBoard";
import { isDoneColumn } from "../domain/deadlines";
import { COLUMN_EASING, COLUMN_SETTLE_MS, COLUMN_SHIFT_MS } from "./columnMotion";
import Icon from "./Icon";

const COLUMN_TRANSITION = { duration: COLUMN_SHIFT_MS, easing: COLUMN_EASING };

export default function ColumnView({
  column,
  board,
  autoRename,
  onOpenCard,
  dropHighlight,
  visible,
  draggable = true,
  onStartAdd,
}: {
  column: Column;
  board: BoardApi;
  autoRename: boolean;
  onOpenCard: (cardId: string) => void;
  dropHighlight: boolean;
  visible?: Card[];
  draggable?: boolean;
  onStartAdd?: () => void;
}) {
  const {
    active,
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: column.id,
    data: { type: "column" },
    transition: COLUMN_TRANSITION,
    disabled: !draggable,
  });
  const [editing, setEditing] = useState(autoRename);
  const [draft, setDraft] = useState(column.title);
  const [addingCard, setAddingCard] = useState(false);
  const [cardTitle, setCardTitle] = useState("");
  const [isSettling, setIsSettling] = useState(false);
  const wasDragging = useRef(false);

  useLayoutEffect(() => {
    if (isDragging) {
      wasDragging.current = true;
      setIsSettling(false);
      return;
    }
    if (!wasDragging.current) return;
    wasDragging.current = false;
    setIsSettling(true);
    const timeout = window.setTimeout(() => setIsSettling(false), COLUMN_SETTLE_MS);
    return () => window.clearTimeout(timeout);
  }, [isDragging]);

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

  const cards = (visible ?? board.cards)
    .filter((c) => c.columnId === column.id)
    .sort((a, b) => a.order - b.order);
  const done = isDoneColumn(column.title);
  const highlightDrop = dropHighlight || (isOver && active?.data.current?.type !== "column");

  return (
    <section
      ref={setNodeRef}
      className={`kb-col${highlightDrop ? " drop-over" : ""}${isDragging ? " is-dragging" : ""}${isSettling ? " is-settling" : ""}`}
      style={{
        "--lane-color": `var(--lane-${column.colorIndex % 6})`,
        transform: CSS.Transform.toString(transform),
        transition: transition
          ? `${transition}, box-shadow ${COLUMN_SETTLE_MS}ms ${COLUMN_EASING}`
          : `box-shadow ${COLUMN_SETTLE_MS}ms ${COLUMN_EASING}`,
      } as CSSProperties}
      data-column-id={column.id}
      data-testid={`column-${column.id}`}
    >
      <div className="kb-col-head">
        <button
          ref={setActivatorNodeRef}
          className="kb-col-drag"
          aria-label={`Move ${column.title}`}
          title="Drag to reorder column"
          disabled={!draggable}
          {...attributes}
          {...listeners}
        >
          <Icon name="grip" size={15} />
        </button>
        <span className={`kb-status-dot${done ? " done" : column.order === 1 ? " active" : ""}`} aria-hidden="true">{done && <Icon name="check" size={10} />}</span>
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
            onClick={() => {
              setDraft(column.title);
              setEditing(true);
            }}
            title="Rename column"
          >
            {column.title}
          </button>
        )}
        <span className="kb-count">
          {cards.length}
        </span>
        <button
          className="kb-x"
          aria-label={`Delete ${column.title}`}
          onClick={() => board.deleteColumn(column.id)}
        >
          <Icon name="close" size={13} />
        </button>
        <button className="kb-icon-btn kb-col-add" aria-label={`New card in ${column.title}`} onClick={() => { onStartAdd?.(); setAddingCard(true); }}><Icon name="plus" size={14} /></button>
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
              draggable={draggable}
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
          <button className="kb-addcard" aria-label="+ Add card" onClick={() => { onStartAdd?.(); setAddingCard(true); }}>
            <Icon name="plus" size={14} />Add card
          </button>
        )}
      </div>
    </section>
  );
}
