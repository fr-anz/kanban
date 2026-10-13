import type { BoardApi } from "../hooks/useBoard";
import { getProgress } from "../domain/deadlines";
import Icon from "./Icon";

export default function Header({ board, onAddColumn, onOpenTags, onToggleSidebar, sidebarOpen,
  onNewCard, view, onViewChange, onFilter, filterCount, locked }: {
  board: BoardApi;
  onAddColumn: () => void;
  onOpenTags: () => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  onNewCard: () => void;
  view: "board" | "list";
  onViewChange: (view: "board" | "list") => void;
  onFilter: () => void;
  filterCount: number;
  locked: boolean;
}) {
  const { done, total } = getProgress(board.columns, board.cards);
  return <header className="kb-header">
    <div className="kb-breadcrumb">
      <button className="kb-icon-btn kb-sidebar-toggle" aria-label="Boards" onClick={onToggleSidebar}
        aria-expanded={sidebarOpen} aria-controls="board-sidebar"><Icon name="panel" /></button>
      <span className="kb-breadcrumb-parent">Workspace</span><span className="kb-breadcrumb-divider">/</span>
      <span className="kb-breadcrumb-title" title={board.title}>{board.title}</span>
      <span className="kb-local-status"><Icon name="device" size={14} />Local workspace</span>
    </div>
    <div className="kb-heading-row">
      <div className="kb-titleblock"><h1 className="kb-title">{board.title}</h1></div>
      {total > 0 && <div className="kb-progress" title={`${done} of ${total} done`} data-testid="progress">
        <span className="kb-progress-label">{done} / {total} done</span>
        <div className="kb-progress-track"><div className="kb-progress-fill" style={{ width: `${done / total * 100}%` }} /></div>
      </div>}
    </div>
    <div className="kb-toolbar">
      <div className="kb-views" role="group" aria-label="View">
        <button className={`kb-btn subtle${view === "board" ? " selected" : ""}`} aria-pressed={view === "board"} disabled={locked}
          onClick={() => onViewChange("board")}><Icon name="board" size={15} />Board</button>
        <button className={`kb-btn subtle${view === "list" ? " selected" : ""}`} aria-pressed={view === "list"} disabled={locked}
          onClick={() => onViewChange("list")}><Icon name="list" size={15} />List</button>
      </div>
      <div className="kb-toolbar-rule" />
      <button className={`kb-btn subtle${filterCount ? " filtered" : ""}`} disabled={locked} onClick={onFilter}>
        <Icon name="filter" size={15} />Filter{filterCount > 0 && <span className="kb-filter-count">{filterCount}</span>}</button>
      <button className="kb-btn subtle" onClick={onOpenTags} disabled={locked}><Icon name="tag" size={15} />Tags</button>
      <div className="kb-toolbar-spacer" />
      <button className="kb-btn subtle" onClick={onAddColumn} disabled={locked} aria-label="+ Add column"><Icon name="plus" size={15} />Add column</button>
      <button className="kb-btn primary" onClick={onNewCard} disabled={locked || board.columns.length === 0}><Icon name="plus" size={15} />New card</button>
    </div>
  </header>;
}
