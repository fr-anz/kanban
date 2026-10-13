import type { BoardApi } from "../hooks/useBoard";
import type { Card } from "../domain/types";
import { formatDueAt, isDoneColumn } from "../domain/deadlines";
import Icon from "./Icon";

export default function CardList({ board, cards, onOpenCard }: {
  board: BoardApi; cards: Card[]; onOpenCard: (columnId: string, cardId?: string) => void;
}) {
  return <div className="kb-list" aria-label="Cards in list view">
    {[...board.columns].sort((a, b) => a.order - b.order).map((column) => {
      const items = cards.filter((card) => card.columnId === column.id).sort((a, b) => a.order - b.order);
      const done = isDoneColumn(column.title);
      return <section className="kb-list-group" key={column.id}>
        <div className="kb-list-heading"><span className={`kb-status-dot${done ? " done" : column.order === 1 ? " active" : ""}`}>{done && <Icon name="check" size={10} />}</span>
          <h2>{column.title}</h2><span className="kb-count">{items.length}</span>
          <button className="kb-icon-btn" aria-label={`New card in ${column.title}`} onClick={() => onOpenCard(column.id)}><Icon name="plus" size={15} /></button>
        </div>
        {items.map((card) => <button className={`kb-list-row${done ? " is-done" : ""}`} key={card.id} onClick={() => onOpenCard(column.id, card.id)} aria-label={`Edit ${card.title}`}>
          <span className={`kb-priority-bars ${card.priority}`} title={`${card.priority} priority`}><i /><i /><i /></span>
          <span className="kb-list-card-title">{card.title}{card.source && <small className="kb-source-badge">Google Classroom{card.source.unavailable ? " · Unavailable" : ""}</small>}</span><span className="kb-tagrow">{board.tags.filter((tag) => card.tagIds.includes(tag.id)).map((tag) => <span className={`kb-tag tone-${tag.colorIndex % 8}`} key={tag.id}>{tag.name}</span>)}</span>
          <span className="kb-list-due">{done ? "Completed" : card.dueAt ? formatDueAt(card.dueAt) : card.deadline ? new Date(`${card.deadline}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
          <Icon name="arrowRight" size={14} />
        </button>)}
        {items.length === 0 && <p className="kb-list-empty">No cards in this column.</p>}
      </section>;
    })}
  </div>;
}
