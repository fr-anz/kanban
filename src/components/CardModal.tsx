import { useState } from "react";
import { TAG_SWATCHES, type Priority } from "../domain/types";
import type { BoardApi } from "../hooks/useBoard";
import Modal from "./Modal";
import { resetToSource, safeLink, submissionLabel, trackOverrides, workTypeLabel } from "../domain/classroom";
import { formatDueAt } from "../domain/deadlines";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

const PRIORITIES: Priority[] = ["low", "medium", "high"];

export default function CardModal({
  board,
  columnId,
  cardId,
  onClose,
  onOpenTags,
  hidden = false,
}: {
  board: BoardApi;
  columnId: string;
  cardId?: string;
  onClose: () => void;
  onOpenTags: () => void;
  hidden?: boolean;
}) {
  const existing = cardId ? board.cards.find((c) => c.id === cardId) : undefined;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [deadline, setDeadline] = useState(existing?.deadline ?? "");
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? "medium");
  const [tagIds, setTagIds] = useState<string[]>(existing?.tagIds ?? []);
  const [moveTo, setMoveTo] = useState(columnId);
  const [resetSource, setResetSource] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const link = safeLink(existing?.source?.link);

  const submit = () => {
    if (!title.trim()) return;
    if (existing) {
      const patch = {
        title: title.trim(),
        description,
        deadline: deadline || undefined,
        priority,
        tagIds,
      };
      const base = resetSource ? resetToSource(existing) : existing;
      board.updateCard(existing.id, resetSource ? trackOverrides(base, { ...patch, dueAt: base.dueAt }) : patch);
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
    <Modal title={existing ? "Edit card" : "New card"} onClose={onClose} sheet open={!hidden} testId="card-modal-overlay">
        <p className="kb-editor-context">{board.title}</p>
        {existing?.source && <div className="kb-source-info">
          <p>Google Classroom · {workTypeLabel(existing.source.workType)}{submissionLabel(existing.source.submissionState) ? ` · ${submissionLabel(existing.source.submissionState)}` : ""}{existing.source.late ? " · Late" : ""}</p>
          {existing.source.unavailable && <p role="status">This coursework is unavailable in the latest Classroom refresh. Your local card is kept.</p>}
          {existing.dueAt && !resetSource && <p>Due: {formatDueAt(existing.dueAt)}</p>}
          {link && <a className="kb-link" href={link} target="_blank" rel="noreferrer" onClick={(event) => {
            if (isTauri()) { event.preventDefault(); void openUrl(link).catch(() => setLinkError("Could not open Classroom in your browser.")); }
          }}>Open in Classroom</a>}
          {linkError && <p role="alert">{linkError}</p>}
          <p className="kb-muted">Title, description, and deadline edits override Classroom values. Priority and tags stay local; turned-in work moves to Done on refresh.</p>
          <button className="kb-btn" type="button" onClick={() => {
            const reset = resetToSource(existing);
            setTitle(reset.title); setDescription(reset.description); setDeadline(reset.deadline ?? ""); setResetSource(true);
          }}>Reset to Classroom values</button>
        </div>}
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
                aria-pressed={priority === p}
              >
                <span className={`kb-dot priority-${p}`} /> {p}
              </button>
            ))}
          </div>
        </div>
        <div className="kb-field">
          <span>Tags</span>
          <div className="kb-tagpick">
            {board.tags.map((t) => {
              const on = tagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`kb-tag toggle tone-${t.colorIndex % TAG_SWATCHES.length}${on ? " on" : ""}`}
                  aria-pressed={on}
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
          <button className="kb-btn primary" onClick={submit} disabled={!title.trim()}>
            {existing ? "Save" : "Add"}
          </button>
        </div>
    </Modal>
  );
}
