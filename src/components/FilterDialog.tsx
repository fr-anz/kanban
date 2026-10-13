import type { BoardFilters } from "../domain/boardFilters";
import { EMPTY_FILTERS } from "../domain/boardFilters";
import type { Board } from "../domain/types";
import Modal from "./Modal";

export default function FilterDialog({ board, filters, onChange, onClose }: {
  board: Board; filters: BoardFilters; onChange: (value: BoardFilters) => void; onClose: () => void;
}) {
  return <Modal title="Filter cards" onClose={onClose}>
    <p className="kb-muted">Show the work you want to focus on.</p>
    <label className="kb-field">Priority<select aria-label="Priority" value={filters.priority} onChange={(event) => onChange({ ...filters, priority: event.target.value as BoardFilters["priority"] })}>
      <option value="all">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
    </select></label>
    <label className="kb-field">Tag<select aria-label="Tag" value={filters.tagId} onChange={(event) => onChange({ ...filters, tagId: event.target.value })}>
      <option value="all">All tags</option>{board.tags.map((tag) => <option value={tag.id} key={tag.id}>{tag.name}</option>)}
    </select></label>
    <label className="kb-field">Column<select aria-label="Column" value={filters.columnId} onChange={(event) => onChange({ ...filters, columnId: event.target.value })}>
      <option value="all">All columns</option>{board.columns.map((column) => <option value={column.id} key={column.id}>{column.title}</option>)}
    </select></label>
    <div className="kb-modal-actions"><button className="kb-btn" onClick={() => onChange(EMPTY_FILTERS)}>Clear filters</button><button className="kb-btn primary" onClick={onClose}>Done</button></div>
  </Modal>;
}
