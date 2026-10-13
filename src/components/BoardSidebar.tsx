import { useRef } from "react";
import type { Board } from "../domain/types";
import DesktopUpdater from "./DesktopUpdater";
import type { BoardDialogAction } from "./BoardDialog";
import { useDialogFocus } from "./useDialogFocus";

export default function BoardSidebar({ boards, activeBoardId, open, mobile, disabled, dialogOpen, onClose, onSelect, onAction }: {
  boards: Board[];
  activeBoardId: string | null;
  open: boolean;
  mobile: boolean;
  disabled: boolean;
  dialogOpen: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onAction: (action: BoardDialogAction) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref, mobile && open, onClose);
  return (
    <>
      {mobile && open && <div className="kb-sidebar-backdrop" onClick={onClose} aria-hidden="true" />}
      <aside id="board-sidebar" ref={ref} className={`kb-sidebar${mobile ? " mobile" : ""}`}
        inert={dialogOpen}
        hidden={!open} role={mobile && open ? "dialog" : undefined}
        aria-modal={mobile && open ? true : undefined} aria-label="Boards" tabIndex={-1}>
        <div className="kb-sidebar-heading">
          <h2>Boards</h2>
          <button className="kb-x static" aria-label="Close boards sidebar" onClick={onClose}>×</button>
        </div>
        <nav aria-label="Board selection" className="kb-board-list">
          {boards.map((board) => (
            <div className={`kb-board-row${board.id === activeBoardId ? " selected" : ""}`} key={board.id}>
              <button className="kb-board-select" aria-current={board.id === activeBoardId ? "page" : undefined}
                title={board.title} disabled={disabled} onClick={() => onSelect(board.id)}>{board.title}</button>
              <button className="kb-board-action" aria-label={`Rename board ${board.title}`} title="Rename board"
                disabled={disabled} onClick={() => onAction({ kind: "rename", board })}>✎</button>
              <button className="kb-board-action" aria-label={`Delete board ${board.title}`} title="Delete board"
                disabled={disabled} onClick={() => onAction({ kind: "delete", board })}>×</button>
            </div>
          ))}
        </nav>
        <button className="kb-btn kb-add-board" disabled={disabled} onClick={() => onAction({ kind: "create" })}>+ Add board</button>
        <div className="kb-sidebar-footer"><DesktopUpdater /></div>
      </aside>
    </>
  );
}
