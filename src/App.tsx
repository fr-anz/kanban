import { useEffect, useMemo, useRef, useState } from "react";
import { usePersistentBoards } from "./hooks/usePersistentBoards";
import { resolveBoardCollectionStorage } from "./storage/tauriFileStorage";
import BoardWorkspace from "./components/BoardWorkspace";
import BoardSidebar from "./components/BoardSidebar";
import BoardDialog, { type BoardDialogAction } from "./components/BoardDialog";
import Icon from "./components/Icon";
import { useAppearance } from "./hooks/useAppearance";
import { resolveConnector } from "./connectors/classroomConnector";
import { useClassroom } from "./hooks/useClassroom";
import ClassroomDialog from "./components/ClassroomDialog";
import "./App.css";

const MOBILE_QUERY = "(max-width: 700px)";

export default function App() {
  const storage = useMemo(() => resolveBoardCollectionStorage(), []);
  const workspace = usePersistentBoards(storage);
  const [mobile, setMobile] = useState(() => window.matchMedia?.(MOBILE_QUERY).matches ?? false);
  const [sidebarOpen, setSidebarOpen] = useState(!mobile);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [classroomOpen, setClassroomOpen] = useState(false);
  const [dialog, setDialog] = useState<BoardDialogAction | null>(null);
  const [query, setQuery] = useState("");
  const [focusSearch, setFocusSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { appearance, toggleAppearance } = useAppearance();
  const active = workspace.activeBoard;
  const connector = useMemo(() => resolveConnector(), []);
  const classroom = useClassroom(connector, workspace.collection, workspace.mutateCollection,
    dragging || editing || dialog !== null || classroomOpen);

  useEffect(() => {
    const media = window.matchMedia?.(MOBILE_QUERY);
    if (!media) return;
    const change = () => { setMobile(media.matches); setSidebarOpen(!media.matches); };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    if (sidebarOpen && focusSearch) {
      searchRef.current?.focus();
      setFocusSearch(false);
    }
  }, [sidebarOpen, focusSearch]);

  useEffect(() => {
    const search = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement).closest?.("input, textarea, select, [contenteditable]");
      if (document.querySelector('[aria-modal="true"]') || dragging) return;
      if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") || (event.key === "/" && !typing)) {
        event.preventDefault();
        setSidebarOpen(true);
        setFocusSearch(true);
      }
    };
    document.addEventListener("keydown", search);
    return () => document.removeEventListener("keydown", search);
  }, [dragging]);

  const closeSidebar = () => setSidebarOpen(false);
  const openDialog = (action: BoardDialogAction) => {
    if (dragging || !workspace.loaded) return;
    if (mobile) closeSidebar();
    setDialog(action);
  };
  const toggleSidebar = () => setSidebarOpen((open) => !open);
  const navigation = <button className="kb-icon-btn kb-sidebar-toggle" onClick={toggleSidebar} aria-label="Boards"
    aria-expanded={sidebarOpen} aria-controls="board-sidebar"><Icon name="panel" /></button>;

  return (
    <div className="kb-root">
      <BoardSidebar boards={workspace.boards} activeBoardId={active?.id ?? null} open={sidebarOpen}
        mobile={mobile} disabled={dragging || !workspace.loaded} dialogOpen={dialog !== null || classroomOpen} onClose={closeSidebar}
        onOpenClassroom={() => { if (mobile) closeSidebar(); setClassroomOpen(true); }}
        query={query} onQueryChange={setQuery} searchRef={searchRef} appearance={appearance} onToggleAppearance={toggleAppearance}
        onSelect={(id) => {
          if (dragging) return;
          workspace.selectBoard(id);
          setQuery("");
          if (mobile) closeSidebar();
        }} onAction={openDialog} />
      <div className="kb-content" inert={dialog !== null || classroomOpen || (mobile && sidebarOpen)}>
        {classroom.error && !classroomOpen && <div className="kb-storage-error" role="alert">{classroom.error}
          <button className="kb-btn" onClick={() => setClassroomOpen(true)}>Classroom settings</button></div>}
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
          query={query} onClearQuery={() => setQuery("")}
          onToggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} onDragChange={setDragging} onEditChange={setEditing} /> : <>
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
      {classroomOpen && workspace.collection && <ClassroomDialog connector={connector} classroom={classroom}
        collection={workspace.collection} mutate={workspace.mutateCollection} onClose={() => setClassroomOpen(false)} />}
    </div>
  );
}
