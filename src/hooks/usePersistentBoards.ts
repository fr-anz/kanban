import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import type { Board, BoardCollection } from "../domain/types";
import type { BoardCollectionStorage } from "../storage/boardCollectionStorage";
import { createBoard } from "./useBoard";

export function usePersistentBoards(storage: BoardCollectionStorage) {
  const [collection, setCollection] = useState<BoardCollection | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const writes = useRef(Promise.resolve());
  const revision = useRef(0);

  useEffect(() => {
    let live = true;
    setLoadError(false);
    storage.load().then((saved) => {
      if (!live) return;
      if (saved) setCollection(saved);
      else {
        const board = createBoard();
        setCollection({ version: 1, boards: [board], activeBoardId: board.id });
      }
    }).catch(() => {
      if (live) setLoadError(true);
    });
    return () => { live = false; };
  }, [storage, loadAttempt]);

  useEffect(() => {
    if (!collection) return;
    let live = true;
    const currentRevision = ++revision.current;
    writes.current = writes.current.catch(() => {}).then(() => storage.save(collection)).then(
      () => { if (live && revision.current === currentRevision) setSaveError(false); },
      () => { if (live && revision.current === currentRevision) setSaveError(true); },
    );
    return () => { live = false; };
  }, [collection, storage, saveAttempt]);

  const updateBoard = useCallback((id: string, update: SetStateAction<Board>) => {
    setCollection((current) => current && ({
      ...current,
      boards: current.boards.map((board) => board.id === id
        ? typeof update === "function" ? update(board) : update
        : board),
    }));
  }, []);

  const addBoard = (name: string) => {
    const title = name.trim();
    if (!title) return;
    const board = createBoard(title);
    setCollection((current) => current && ({
      ...current, boards: [...current.boards, board], activeBoardId: board.id,
    }));
  };

  const selectBoard = (id: string) => setCollection((current) => {
    if (!current || current.activeBoardId === id || !current.boards.some((board) => board.id === id)) return current;
    return { ...current, activeBoardId: id };
  });

  const renameBoard = (id: string, name: string) => {
    const title = name.trim();
    if (title) updateBoard(id, (board) => ({ ...board, title }));
  };

  const deleteBoard = (id: string) => setCollection((current) => {
    if (!current) return current;
    const boards = current.boards.filter((board) => board.id !== id);
    return { ...current, boards, activeBoardId: current.activeBoardId === id
      ? boards[0]?.id ?? null : current.activeBoardId };
  });

  return {
    boards: collection?.boards ?? [],
    activeBoard: collection?.boards.find((board) => board.id === collection.activeBoardId) ?? null,
    loaded: collection !== null,
    loadError, saveError,
    retryLoad: () => setLoadAttempt((attempt) => attempt + 1),
    retrySave: () => setSaveAttempt((attempt) => attempt + 1),
    addBoard, selectBoard, renameBoard, deleteBoard, updateBoard,
  };
}
