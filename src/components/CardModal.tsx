import { useState } from "react";
import { TAG_SWATCHES, type Priority } from "../domain/types";
import type { BoardApi } from "../hooks/useBoard";

const PRIORITIES: Priority[] = ["low", "medium", "high"];
const DOT: Record<Priority, string> = {
  high: "#f87171",
  medium: "#f5c897",
  low: "#a8cff5",
};

export default function CardModal({
  board,
  columnId,
  cardId,
  onClose,
  onOpenTags,
}: {
  board: BoardApi;
  columnId: string;
  cardId?: string;
  onClose: () => void;
  onOpenTags: () => void;
}) {
  const existing = cardId ? board.cards.find((c) => c.id === cardId) : undefined;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [deadline, setDeadline] = useState(existing?.deadline ?? "");
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? "medium");
  const [tagIds, setTagIds] = useState<string[]>(existing?.tagIds ?? []);
  const [moveTo, setMoveTo] = useState(columnId);

  const submit = () => {
    if (!title.trim()) return;
    if (existing) {
      board.updateCard(existing.id, {
        title: title.trim(),
        description,
        deadline: deadline || undefined,
        priority,
        tagIds,
      });
      if (moveTo !== existing.columnId) board.moveCard(existing.id, moveTo);
    } else {
      board.addCard(moveTo, {
        title: title.trim(),
        description,
        deadline: deadline || undefined,
        priority,
        tagIds,
      });
    }
    onClose();
  };

  const toggleTag = (id: string) =>
    setTagIds((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  return (
    <div
      className="kb-overlay"
      onClick={onClose}
      data-testid="card-modal-overlay"
    >
      <div className="kb-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{existing ? "Edit card" : "New card"}</h2>
        <label className="kb-field">
          <span>Title</span>
          <input
            placeholder="Card title"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onClose();
            }}
          />
        </label>
        <label className="kb-field">
          <span>Description</span>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="kb-row2">
          <label className="kb-field">
            <span>Deadline</span>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </label>
          <label className="kb-field">
            <span>Column</span>
            <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              {board.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="kb-field">
          <span>Priority</span>
          <div className="kb-prio-row">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                className={`kb-prio${priority === p ? " active" : ""}`}
                onClick={() => setPriority(p)}
                title={p}
              >
                <span className="kb-dot" style={{ background: DOT[p] }} /> {p}
              </button>
            ))}
          </div>
        </div>
        <div className="kb-field">
          <span>Tags</span>
          <div className="kb-tagpick">
            {board.tags.map((t) => {
              const sw = TAG_SWATCHES[t.colorIndex % TAG_SWATCHES.length];
              const on = tagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`kb-tag toggle${on ? " on" : ""}`}
                  style={{ background: sw.bg, color: sw.text }}
                  onClick={() => toggleTag(t.id)}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
          <button type="button" className="kb-link" onClick={onOpenTags}>
            Manage tags
          </button>
        </div>
        <div className="kb-modal-actions">
          <button className="kb-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="kb-btn primary" onClick={submit}>
            {existing ? "Save" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
