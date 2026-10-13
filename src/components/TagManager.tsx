import { useState } from "react";
import { TAG_SWATCHES } from "../domain/types";
import type { BoardApi } from "../hooks/useBoard";
import Modal from "./Modal";
import Icon from "./Icon";

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
    <Modal title="Tags" onClose={onClose}>
        <p className="kb-muted">Useful labels for {board.title}.</p>
        <div className="kb-taglist">
          {board.tags.map((t) => {
            return (
              <div key={t.id} className="kb-tagitem">
                <span
                  className={`kb-tag tone-${t.colorIndex % TAG_SWATCHES.length}`}
                >
                  {t.name}
                </span>
                <button
                  className="kb-x static"
                  aria-label={`Delete tag ${t.name}`}
                  onClick={() => board.deleteTag(t.id)}
                >
                  <Icon name="close" size={14} />
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
            aria-label="Tag name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <div className="kb-swatches">
            {TAG_SWATCHES.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Swatch ${i + 1}`}
                className={`kb-sw tone-${i}${color === i ? " active" : ""}`}
                aria-pressed={color === i}
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
    </Modal>
  );
}
