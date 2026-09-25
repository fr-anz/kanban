import type { BoardApi } from "../hooks/useBoard";
import { getProgress } from "../domain/deadlines";
import DesktopUpdater from "./DesktopUpdater";

export default function Header({
  board,
  onAddColumn,
  onOpenTags,
}: {
  board: BoardApi;
  onAddColumn: () => void;
  onOpenTags: () => void;
}) {
  const { done, total } = getProgress(board.columns, board.cards);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return (
    <header className="kb-header">
      <div className="kb-titleblock">
        <h1 className="kb-title">{board.title}</h1>
        <span className="kb-date">{today}</span>
      </div>
      <div className="kb-actions">
        <DesktopUpdater />
        {total > 0 && (
          <div
            className="kb-progress"
            title={`${done} of ${total} done`}
            data-testid="progress"
          >
            <span className="kb-progress-label mono">
              {done} / {total} done
            </span>
            <div className="kb-progress-track">
              <div
                className="kb-progress-fill"
                style={{ width: `${(done / total) * 100}%` }}
              />
            </div>
          </div>
        )}
        <button className="kb-btn" onClick={onOpenTags}>
          Tags
        </button>
        <button className="kb-btn primary" onClick={onAddColumn}>
          + Add column
        </button>
      </div>
    </header>
  );
}
