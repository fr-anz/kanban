import { useEffect, useRef, useState } from "react";
import { useBoard } from "./useBoard";
import type { BoardStorage } from "../storage/boardStorage";

/** Auto-loads once on mount; auto-saves on every change after load. */
export function usePersistentBoard(storage: BoardStorage) {
  const api = useBoard();
  const [loaded, setLoaded] = useState(false);
  const readyRef = useRef(false);
  const saveRef = useRef(storage.save.bind(storage));
  saveRef.current = storage.save.bind(storage);

  useEffect(() => {
    let live = true;
    storage.load().then((b) => {
      if (!live) return;
      if (b) api.setBoard(b);
      readyRef.current = true;
      setLoaded(true);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { id, title, columns, cards, tags } = api;
  useEffect(() => {
    if (!readyRef.current) return;
    void saveRef.current({ id, title, columns, cards, tags });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, title, JSON.stringify(columns), JSON.stringify(cards), JSON.stringify(tags)]);

  return { ...api, loaded };
}
