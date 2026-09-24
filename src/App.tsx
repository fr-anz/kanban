import { useEffect, useMemo, useRef, useState } from "react";
import { usePersistentBoard } from "./hooks/usePersistentBoard";
import { resolveBoardStorage } from "./storage/tauriFileStorage";
import Header from "./components/Header";
import ColumnView from "./components/ColumnView";
import CardModal from "./components/CardModal";
import TagManager from "./components/TagManager";
import {
  PAN_THRESHOLD_PX,
  computeVelocity,
  shouldStartPan,
  type PanSample,
} from "./components/boardPan";
import "./App.css";

export default function App() {
  const storage = useMemo(() => resolveBoardStorage(), []);
  const board = usePersistentBoard(storage);
  const [freshColId, setFreshColId] = useState<string | null>(null);
  const [cardModal, setCardModal] = useState<
    { columnId: string; cardId?: string } | null
  >(null);
  const [tagsOpen, setTagsOpen] = useState(false);

  const sorted = [...board.columns].sort((a, b) => a.order - b.order);
  const boardRef = useRef<HTMLElement>(null);

  // Trello-style hand pan: drag empty board space to move the board.
  // Touch/pen only; cards and controls are excluded, and vertical swipes
  // stay with native column scrolling.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    let pid: number | null = null;
    let engaged = false;
    let startX = 0;
    let startY = 0;
    let startScroll = 0;
    let samples: PanSample[] = [];
    let raf = 0;
    const stopMomentum = () => {
      if (raf && typeof cancelAnimationFrame === "function")
        cancelAnimationFrame(raf);
      raf = 0;
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || e.isPrimary === false) return;
      if (!shouldStartPan(e.target)) return;
      stopMomentum();
      pid = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      startScroll = el.scrollLeft;
      samples = [{ x: e.clientX, t: performance.now() }];
      engaged = false;
      if (typeof el.setPointerCapture === "function") {
        try {
          el.setPointerCapture(pid);
        } catch {
          // Already released — moves still arrive via bubbling.
        }
      }
    };
    const move = (e: PointerEvent) => {
      if (pid === null || e.pointerId !== pid) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!engaged) {
        if (Math.hypot(dx, dy) < PAN_THRESHOLD_PX) return;
        if (Math.abs(dx) <= Math.abs(dy)) {
          // Vertical — hand off to native column scrolling.
          pid = null;
          return;
        }
        engaged = true;
        el.style.touchAction = "none";
        el.classList.add("panning");
      }
      el.scrollLeft = startScroll - dx;
      samples.push({ x: e.clientX, t: performance.now() });
      if (samples.length > 6) samples.shift();
    };
    const end = (fling: boolean, e: PointerEvent) => {
      if (pid === null || e.pointerId !== pid) return;
      pid = null;
      el.style.touchAction = "";
      el.classList.remove("panning");
      if (!fling || !engaged) return;
      if (typeof requestAnimationFrame !== "function") return;
      const v = -computeVelocity(samples); // scrollLeft direction, px/ms
      if (Math.abs(v) < 0.15) return;
      let vel = v;
      const step = () => {
        el.scrollLeft += vel * 16;
        vel *= 0.94;
        raf = Math.abs(vel) > 0.05 ? requestAnimationFrame(step) : 0;
      };
      raf = requestAnimationFrame(step);
    };
    const up = (e: PointerEvent) => end(true, e);
    const cancel = (e: PointerEvent) => end(false, e);

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    return () => {
      stopMomentum();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
    };
  }, []);

  // Pager for narrow screens: jump one column at a time.
  const page = (dir: 1 | -1) => {
    const el = boardRef.current;
    if (!el) return;
    const col = el.querySelector(".kb-col") as HTMLElement | null;
    const step = col ? col.getBoundingClientRect().width + 16 : el.clientWidth * 0.85;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <div className="kb-root">
      <Header
        board={board}
        onAddColumn={() => setFreshColId(board.addColumn("New column"))}
        onOpenTags={() => setTagsOpen(true)}
      />
      <div className="kb-pager" role="group" aria-label="Scroll columns">
        <button aria-label="Previous column" onClick={() => page(-1)}>
          ‹
        </button>
        <button aria-label="Next column" onClick={() => page(1)}>
          ›
        </button>
      </div>
      <main ref={boardRef} className="kb-board">
        {sorted.map((c) => (
          <ColumnView
            key={c.id}
            column={c}
            board={board}
            autoRename={freshColId === c.id}
            onAddCard={() => setCardModal({ columnId: c.id })}
            onOpenCard={(cardId) =>
              setCardModal({ columnId: c.id, cardId })
            }
            onDropCard={(cardId, to) => board.moveCard(cardId, to)}
          />
        ))}
        <button
          className="kb-ghost"
          onClick={() => setFreshColId(board.addColumn("New column"))}
          aria-label="Add column"
        >
          +
        </button>
      </main>
      {cardModal && (
        <CardModal
          board={board}
          columnId={cardModal.columnId}
          cardId={cardModal.cardId}
          onClose={() => setCardModal(null)}
          onOpenTags={() => setTagsOpen(true)}
        />
      )}
      {tagsOpen && <TagManager board={board} onClose={() => setTagsOpen(false)} />}
    </div>
  );
}
