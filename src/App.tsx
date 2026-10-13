import { useEffect, useMemo, useState } from "react";
import { usePersistentBoards } from "./hooks/usePersistentBoards";
import { resolveBoardCollectionStorage } from "./storage/tauriFileStorage";
import BoardWorkspace from "./components/BoardWorkspace";
import BoardSidebar from "./components/BoardSidebar";
import BoardDialog, { type BoardDialogAction } from "./components/BoardDialog";
import "./App.css";

const MOBILE_QUERY = "(max-width: 700px)";

export default function App() {
  const storage = useMemo(() => resolveBoardCollectionStorage(), []);
  const workspace = usePersistentBoards(storage);
  const [mobile, setMobile] = useState(() => window.matchMedia?.(MOBILE_QUERY).matches ?? false);
  const [sidebarOpen, setSidebarOpen] = useState(!mobile);
  const [dragging, setDragging] = useState(false);
  const [dialog, setDialog] = useState<BoardDialogAction | null>(null);
  const active = workspace.activeBoard;

  useEffect(() => {
    const media = window.matchMedia?.(MOBILE_QUERY);
    if (!media) return;
    const change = () => { setMobile(media.matches); setSidebarOpen(!media.matches); };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  const closeSidebar = () => setSidebarOpen(false);
  const openDialog = (action: BoardDialogAction) => {
    if (dragging || !workspace.loaded) return;
    if (mobile) closeSidebar();
    setDialog(action);
  };
  const toggleSidebar = () => setSidebarOpen((open) => !open);
  const navigation = <button className="kb-btn kb-sidebar-toggle" onClick={toggleSidebar}
    aria-expanded={sidebarOpen} aria-controls="board-sidebar">Boards</button>;

  return (
    <div className="kb-root">
      <BoardSidebar boards={workspace.boards} activeBoardId={active?.id ?? null} open={sidebarOpen}
        mobile={mobile} disabled={dragging || !workspace.loaded} dialogOpen={dialog !== null} onClose={closeSidebar}
        onSelect={(id) => {
          if (dragging) return;
          workspace.selectBoard(id);
          if (mobile) closeSidebar();
        }} onAction={openDialog} />
      <div className="kb-content" inert={dialog !== null || (mobile && sidebarOpen)}>
        {workspace.saveError && <div className="kb-storage-error" role="alert">
          Changes could not be saved locally. Keep the app open and retry.
          <button className="kb-btn" onClick={workspace.retrySave}>Retry save</button>
        </div>}
        {!workspace.loaded ? <>
          <header className="kb-header">{navigation}</header>
          <main className="kb-empty">
            {workspace.loadError ? <div role="alert">
              <p>Could not load your boards. Your saved data has not been changed.</p>
              <button className="kb-btn" onClick={workspace.retryLoad}>Retry load</button>
            </div> : <p role="status">Loading boards…</p>}
          </main>
        </> : active ? <BoardWorkspace key={active.id} snapshot={active}
          setBoard={(update) => workspace.updateBoard(active.id, update)}
          onToggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} onDragChange={setDragging} /> : <>
          <header className="kb-header">{navigation}</header>
          <main className="kb-empty">
            <h1>No boards yet</h1>
            <p className="kb-muted">Create a board to organize your work.</p>
            <button className="kb-btn primary" onClick={() => openDialog({ kind: "create" })}>+ Add board</button>
          </main>
        </>}
      </div>
      {dialog && <BoardDialog action={dialog} onClose={() => setDialog(null)} onSubmit={(name) => {
        if (dialog.kind === "create") workspace.addBoard(name);
        else if (dialog.kind === "rename") workspace.renameBoard(dialog.board.id, name);
        else workspace.deleteBoard(dialog.board.id);
        setDialog(null);
      }} />}
    </div>
  );
}
