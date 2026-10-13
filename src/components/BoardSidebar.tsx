import { useRef, type RefObject } from "react";
import type { Board } from "../domain/types";
import type { Appearance } from "../hooks/useAppearance";
import DesktopUpdater from "./DesktopUpdater";
import type { BoardDialogAction } from "./BoardDialog";
import { useDialogFocus } from "./useDialogFocus";
import Icon from "./Icon";
import Logo from "./Logo";

export default function BoardSidebar({ boards, activeBoardId, open, mobile, disabled, dialogOpen,
  onClose, onSelect, onAction, query, onQueryChange, searchRef, appearance, onToggleAppearance }: {
  boards: Board[]; activeBoardId: string | null; open: boolean; mobile: boolean; disabled: boolean;
  dialogOpen: boolean; onClose: () => void; onSelect: (id: string) => void;
  onAction: (action: BoardDialogAction) => void; query: string; onQueryChange: (query: string) => void;
  searchRef: RefObject<HTMLInputElement | null>; appearance: Appearance; onToggleAppearance: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref, mobile && open, onClose);
  return <>
    {mobile && open && <div className="kb-sidebar-backdrop" onClick={onClose} aria-hidden="true" />}
    <aside id="board-sidebar" ref={ref} className={`kb-sidebar${mobile ? " mobile" : ""}`}
      inert={dialogOpen} hidden={!open} role={mobile && open ? "dialog" : undefined}
      aria-modal={mobile && open ? true : undefined} aria-label="Boards" tabIndex={-1}>
      <div className="kb-sidebar-heading"><Logo /></div>
      <label className="kb-search"><Icon name="search" size={16} />
        <input ref={searchRef} aria-label="Search cards" placeholder="Search cards" value={query} disabled={disabled}
          onChange={(event) => onQueryChange(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter" && mobile) onClose();
            if (event.key === "Escape" && query) { event.stopPropagation(); onQueryChange(""); }
          }} /><kbd aria-hidden="true">/</kbd>
      </label>
      <div className="kb-nav-heading">Your boards</div>
      <nav aria-label="Board selection" className="kb-board-list">
        {boards.map((board) => <div className={`kb-board-row${board.id === activeBoardId ? " selected" : ""}`} key={board.id}>
          <button className="kb-board-select" aria-label={board.title} aria-current={board.id === activeBoardId ? "page" : undefined}
            title={board.title} disabled={disabled} onClick={() => onSelect(board.id)}>
            <Icon name="board" size={16} /><span className="kb-board-name">{board.title}</span>
            <span className="kb-board-count" aria-hidden="true">{board.cards.length}</span>
          </button>
          <div className="kb-board-row-actions">
            <button className="kb-board-action" aria-label={`Rename board ${board.title}`} title="Rename board" disabled={disabled}
              onClick={() => onAction({ kind: "rename", board })}><Icon name="edit" size={13} /></button>
            <button className="kb-board-action" aria-label={`Delete board ${board.title}`} title="Delete board" disabled={disabled}
              onClick={() => onAction({ kind: "delete", board })}><Icon name="trash" size={13} /></button>
          </div>
        </div>)}
      </nav>
      <button className="kb-btn subtle kb-add-board" aria-label="+ Add board" disabled={disabled} onClick={() => onAction({ kind: "create" })}><Icon name="plus" size={16} />Add board</button>
      <div className="kb-sidebar-footer">
        <div className="kb-device-note"><Icon name="device" size={15} /><span>Stored on this device</span></div>
        <p className="kb-sidebar-caption">A little space for your next idea.</p>
        <DesktopUpdater />
        <button className="kb-appearance" onClick={onToggleAppearance} aria-label={`Switch to ${appearance === "dark" ? "light" : "dark"} mode`}>
          <Icon name={appearance === "dark" ? "moon" : "sun"} size={16} /><span>Appearance</span><strong>{appearance === "dark" ? "Dark" : "Light"}</strong>
        </button>
      </div>
    </aside>
  </>;
}
