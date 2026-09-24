import { useState } from "react";
import { TAG_SWATCHES } from "../domain/types";
import type { BoardApi } from "../hooks/useBoard";

export default function TagManager({
  board,
  onClose,
}: {
  board: BoardApi;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(0);

  const submit = () => {
    if (!name.trim()) return;
    board.addTag(name.trim(), color);
    setName("");
  };

  return (
    <div className="kb-overlay" onClick={onClose}>
      <div className="kb-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Tags</h2>
        <div className="kb-taglist">
          {board.tags.map((t) => {
            const sw = TAG_SWATCHES[t.colorIndex % TAG_SWATCHES.length];
            return (
              <div key={t.id} className="kb-tagitem">
                <span
                  className="kb-tag"
                  style={{ background: sw.bg, color: sw.text }}
                >
                  {t.name}
                </span>
                <button
                  className="kb-x static"
                  aria-label={`Delete tag ${t.name}`}
                  onClick={() => board.deleteTag(t.id)}
                >
                  ×
                </button>
              </div>
            );
          })}
          {board.tags.length === 0 && (
            <p className="kb-muted">No tags yet.</p>
          )}
        </div>
        <div className="kb-newtag">
          <input
            placeholder="Tag name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <div className="kb-swatches">
            {TAG_SWATCHES.map((s, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Swatch ${i + 1}`}
                className={`kb-sw${color === i ? " active" : ""}`}
                style={{ background: s.bg }}
                onClick={() => setColor(i)}
              />
            ))}
          </div>
          <button className="kb-btn primary" onClick={submit}>
            Add tag
          </button>
        </div>
        <div className="kb-modal-actions">
          <button className="kb-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
