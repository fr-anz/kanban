import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { deadlineLabel, getDeadlineStatus } from "../domain/deadlines";
import { TAG_SWATCHES, type Card, type Tag } from "../domain/types";
import { wasJustDragged } from "./dragGuard";

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
}: {
  card: Card;
  tags: Tag[];
  done: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

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
      ref={setNodeRef}
      className={`kb-card${done ? " is-done" : ""}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : undefined,
      }}
      {...attributes}
      {...listeners}
      onClick={() => {
        // A drag-end tap must not open the editor.
        if (wasJustDragged()) return;
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
