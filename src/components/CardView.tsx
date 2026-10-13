import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { deadlineLabel, formatDueAt, getCardDeadlineStatus } from "../domain/deadlines";
import { submissionLabel } from "../domain/classroom";
import type { Card, Tag } from "../domain/types";
import { wasJustDragged } from "./dragGuard";
import Icon from "./Icon";

export default function CardView({ card, tags, done, onOpen, onDelete, draggable = true }: {
  card: Card; tags: Tag[]; done: boolean; onOpen: () => void; onDelete: () => void; draggable?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, disabled: !draggable });
  const status = getCardDeadlineStatus(card);
  const label = deadlineLabel(status);
  const cardTags = tags.filter((tag) => card.tagIds.includes(tag.id));
  return <article ref={setNodeRef} className={`kb-card${done ? " is-done" : ""}`}
    style={{ transform: CSS.Transform.toString(transform), transition: transition ? `${transition}, border-color 160ms ease, background-color 160ms ease` : undefined, opacity: isDragging ? 0.35 : undefined }}
    {...attributes} {...listeners} role="button" tabIndex={0} aria-label={`Edit ${card.title}`}
    onClick={() => { if (!wasJustDragged()) onOpen(); }}
    onKeyDown={(event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter") { event.preventDefault(); onOpen(); }
      else listeners?.onKeyDown?.(event);
    }}
    data-testid={`card-${card.id}`}>
    <div className="kb-card-top">
      <h3 className="kb-card-title">{card.title}</h3>
      <span className={`kb-priority-bars ${card.priority}`} title={`${card.priority} priority`} aria-label={`${card.priority} priority`}><i /><i /><i /></span>
      <button className="kb-x" aria-label={`Delete ${card.title}`} onMouseDown={(event) => event.stopPropagation()} onTouchStart={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); onDelete(); }}><Icon name="close" size={13} /></button>
    </div>
    {card.description && <p className="kb-card-desc">{card.description}</p>}
    {card.source && <div className="kb-source-badge">Google Classroom
      {submissionLabel(card.source.submissionState) && <span> · {submissionLabel(card.source.submissionState)}</span>}
      {card.source.late && <span> · Late</span>}{card.source.unavailable && <span> · Unavailable</span>}
    </div>}
    {(cardTags.length > 0 || label || done) && <div className="kb-card-meta">
      <span className="kb-tagrow">{cardTags.map((tag) => <span key={tag.id} className={`kb-tag tone-${tag.colorIndex % 8}`}><span className="kb-tag-dot" />{tag.name}</span>)}</span>
      {done ? <span className="kb-completed"><Icon name="check" size={13} />Completed</span> : label && <span title={card.dueAt ? formatDueAt(card.dueAt) : undefined} className={`kb-deadline status-${status.kind}`}><Icon name="calendar" size={13} />{label}</span>}
    </div>}
  </article>;
}
