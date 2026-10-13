import { useId, useRef, useState } from "react";
import type { Board } from "../domain/types";
import { useDialogFocus } from "./useDialogFocus";

export type BoardDialogAction = { kind: "create" } | { kind: "rename" | "delete"; board: Board };

export default function BoardDialog({ action, onClose, onSubmit }: {
  action: BoardDialogAction;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(action.kind === "rename" ? action.board.title : "");
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const deleting = action.kind === "delete";
  const title = deleting ? "Delete board" : action.kind === "rename" ? "Rename board" : "New board";
  useDialogFocus(ref, true, onClose);
  return (
    <div className="kb-overlay" onClick={onClose}>
      <div className="kb-modal" ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
        tabIndex={-1} onClick={(event) => event.stopPropagation()}>
        <h2 id={titleId}>{title}</h2>
        <form onSubmit={(event) => {
          event.preventDefault();
          if (deleting || name.trim()) onSubmit(name.trim());
        }}>
          {deleting ? <p>Delete “{action.board.title}”? Its columns, cards, and tags will be permanently removed.</p> : (
            <label className="kb-field">Board name
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
          )}
          <div className="kb-modal-actions kb-board-dialog-actions">
            <button className="kb-btn" type="button" onClick={onClose}>Cancel</button>
            <button className={`kb-btn ${deleting ? "danger" : "primary"}`} type="submit"
              disabled={!deleting && !name.trim()}>
              {deleting ? "Delete board" : action.kind === "rename" ? "Save name" : "Create board"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
