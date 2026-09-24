import { useEffect, useRef } from "react";
import { deadlineLabel, getDeadlineStatus } from "../domain/deadlines";
import { TAG_SWATCHES, type Card, type Tag } from "../domain/types";
import {
  COLUMN_ATTR,
  LONG_PRESS_MS,
  MOVE_CANCEL_PX,
  columnIdFromPoint,
  highlightColumnAt,
} from "./touchDrag";

const PRIORITY_COLORS: Record<string, string> = {
  high: "#f87171",
  medium: "#f5c897",
  low: "#a8cff5",
};

export default function CardView({
  card,
  tags,
  done,
  onOpen,
  onDelete,
  onDropCard,
}: {
  card: Card;
  tags: Tag[];
  done: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onDropCard: (cardId: string, toColumnId: string) => void;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const suppressClick = useRef(false);
  const dropRef = useRef(onDropCard);
  dropRef.current = onDropCard;

  // Touch/pen drag (Pointer Events — the unified input model in browsers
  // AND the WebView2 desktop shell, where TouchEvents are unreliable).
  // Long-press a card, then drag it onto another column. The mouse keeps
  // native HTML5 drag-and-drop; plain swipes keep scrolling the board
  // (a pending long-press cancels as soon as the pointer travels).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: number | null = null;
    let dragging = false;
    let ghost: HTMLElement | null = null;
    let startX = 0;
    let startY = 0;
    let pointerId: number | null = null;

    const canCapture = typeof el.setPointerCapture === "function";

    const cleanup = () => {
      ghost?.remove();
      ghost = null;
      el.classList.remove("dragging-touch");
      el.style.touchAction = "";
      document.body.classList.remove("kb-touch-drag");
      document
        .querySelectorAll(`[${COLUMN_ATTR}]`)
        .forEach((c) => c.classList.remove("drop-over"));
    };

    const onDown = (e: PointerEvent) => {
      // Mouse owns HTML5 DnD; multi-touch contacts are ignored.
      if (e.pointerType === "mouse" || e.isPrimary === false) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      timer = window.setTimeout(() => {
        dragging = true;
        // Claimed before the first move, this stops the board scrolling
        // mid-drag; restored in cleanup.
        el.style.touchAction = "none";
        if (canCapture) {
          try {
            el.setPointerCapture(pointerId as number);
          } catch {
            // Already released — moves still arrive via bubbling.
          }
        }
        const rect = el.getBoundingClientRect();
        ghost = el.cloneNode(true) as HTMLElement;
        ghost.className = "kb-card kb-touch-ghost";
        ghost.style.width = `${rect.width}px`;
        ghost.style.left = `${rect.left}px`;
        ghost.style.top = `${rect.top}px`;
        document.body.appendChild(ghost);
        el.classList.add("dragging-touch");
        document.body.classList.add("kb-touch-drag");
        navigator.vibrate?.(20);
      }, LONG_PRESS_MS);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      if (!dragging) {
        if (
          timer !== null &&
          Math.hypot(e.clientX - startX, e.clientY - startY) >
            MOVE_CANCEL_PX
        ) {
          window.clearTimeout(timer);
          timer = null;
          pointerId = null;
        }
        return;
      }
      if (ghost) {
        const w = ghost.offsetWidth;
        ghost.style.left = `${e.clientX - w / 2}px`;
        ghost.style.top = `${e.clientY - 24}px`;
      }
      highlightColumnAt(e.clientX, e.clientY);
    };
    const finish = (drop: boolean, e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (!dragging) return;
      dragging = false;
      const target = drop
        ? columnIdFromPoint(e.clientX, e.clientY)
        : null;
      const from = card.columnId;
      cleanup();
      if (target && target !== from) {
        // A real drop — don't also open the editor on the tap.
        suppressClick.current = true;
        window.setTimeout(() => (suppressClick.current = false), 0);
        dropRef.current(card.id, target);
      }
    };
    const onUp = (e: PointerEvent) => finish(true, e);
    const onCancel = (e: PointerEvent) => finish(false, e);

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      cleanup();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
    };
  }, [card.id, card.columnId]);
  const status = getDeadlineStatus(card.deadline);
  const label = deadlineLabel(status);
  const statusColor =
    status.kind === "overdue"
      ? "#ef4444"
      : status.kind === "today" || status.kind === "soon"
        ? "#f97316"
        : "#6b7280";
  const known = new Set(tags.map((t) => t.id));
  const cardTags = tags.filter((t) => card.tagIds.includes(t.id) && known.has(t.id));

  return (
    <article
      ref={ref}
      className={`kb-card${done ? " is-done" : ""}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/card-id", card.id)}
      onClick={() => {
        if (suppressClick.current) return;
        onOpen();
      }}
      data-testid={`card-${card.id}`}
    >
      <button
        className="kb-x"
        aria-label={`Delete ${card.title}`}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        ×
      </button>
      <div className="kb-card-top">
        <span
          className="kb-dot"
          title={card.priority}
          style={{ background: PRIORITY_COLORS[card.priority] }}
        />
        <span className="kb-tagrow">
          {cardTags.map((t) => {
            const sw = TAG_SWATCHES[t.colorIndex % TAG_SWATCHES.length];
            return (
              <span
                key={t.id}
                className="kb-tag"
                style={{ background: sw.bg, color: sw.text }}
              >
                {t.name}
              </span>
            );
          })}
        </span>
      </div>
      <h3 className="kb-card-title">{card.title}</h3>
      {card.description && <p className="kb-card-desc">{card.description}</p>}
      {label && (
        <div className="kb-deadline mono" style={{ color: statusColor }}>
          <span aria-hidden>📅</span> {label}
        </div>
      )}
    </article>
  );
}
