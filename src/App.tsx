import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePersistentBoard } from "./hooks/usePersistentBoard";
import { resolveBoardStorage } from "./storage/tauriFileStorage";
import Header from "./components/Header";
import ColumnView from "./components/ColumnView";
import CardModal from "./components/CardModal";
import TagManager from "./components/TagManager";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { markDragEnd } from "./components/dragGuard";
import { COLUMN_EASING, COLUMN_SETTLE_MS } from "./components/columnMotion";
import type { Card } from "./domain/types";
import {
  PAN_THRESHOLD_PX,
  computeVelocity,
  shouldStartPan,
  type PanSample,
} from "./components/boardPan";
import "./App.css";

const collisionDetection: CollisionDetection = (args) => {
  if (args.active.data.current?.type === "column") {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (item) => item.data.current?.type === "column",
      ),
    });
  }
  const targets = args.droppableContainers.filter(
    (item) => item.id !== args.active.id,
  );
  const pointerTargets = pointerWithin({ ...args, droppableContainers: targets });
  return pointerTargets.length
    ? pointerTargets
    : closestCenter({ ...args, droppableContainers: targets });
};

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
  const columnDropRects = useRef<Map<string, DOMRect> | null>(null);
  const [columnDropRevision, setColumnDropRevision] = useState(0);

  // Capture the actual on-screen positions, including the dragged column's pointer offset.
  const captureColumnPositions = () => {
    const columns = boardRef.current?.querySelectorAll<HTMLElement>(".kb-col[data-column-id]");
    const rects = new Map<string, DOMRect>();
    columns?.forEach((element) => {
      const id = element.dataset.columnId;
      if (id) rects.set(id, element.getBoundingClientRect());
    });
    columnDropRects.current = rects;
  };

  useLayoutEffect(() => {
    const before = columnDropRects.current;
    if (!before) return;
    columnDropRects.current = null;
    const columns = boardRef.current?.querySelectorAll<HTMLElement>(".kb-col[data-column-id]");
    columns?.forEach((element) => {
      const id = element.dataset.columnId;
      const previous = id ? before.get(id) : undefined;
      if (!previous) return;
      const current = element.getBoundingClientRect();
      const dx = previous.left - current.left;
      const dy = previous.top - current.top;
      if (Math.hypot(dx, dy) < 1) return;
      // Ease from the released position into the reordered layout without replaying a swap.
      element.animate(
        [
          { transform: `translate3d(${dx}px, ${dy}px, 0)` },
          { transform: "translate3d(0, 0, 0)" },
        ],
        { duration: COLUMN_SETTLE_MS, easing: COLUMN_EASING },
      );
    });
  }, [columnDropRevision]);

  // Single DnD system (dnd-kit): mouse drags immediately past a small
  // distance; touch keeps the long-press so scrolling still works.
  // Scrollable ancestors (board + column bodies) auto-scroll near edges.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
  );
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [showCardOverlay, setShowCardOverlay] = useState(false);
  const cardOverlayTimer = useRef<number | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
  const dragSnapshot = useRef<Card[]>([]);
  const activeCard = activeCardId
    ? board.cards.find((c) => c.id === activeCardId)
    : undefined;

  useEffect(() => () => {
    if (cardOverlayTimer.current !== null) window.clearTimeout(cardOverlayTimer.current);
  }, []);

  const clearCardOverlayTimer = () => {
    if (cardOverlayTimer.current !== null) window.clearTimeout(cardOverlayTimer.current);
    cardOverlayTimer.current = null;
  };

  const finishCardOverlay = () => {
    clearCardOverlayTimer();
    // Keep the overlay mounted through dnd-kit's 250 ms card drop animation.
    cardOverlayTimer.current = window.setTimeout(() => {
      setShowCardOverlay(false);
      cardOverlayTimer.current = null;
    }, 300);
  };

  // Live placement while dragging: other cards make space, so the drop
  // target is visible before release. Same helper finalizes on drop.
  const belowOverItem = (e: DragOverEvent | DragEndEvent): boolean => {
    const translated = e.active.rect.current.translated;
    const overRect = e.over?.rect;
    if (!translated || !overRect) return false;
    return translated.top + translated.height / 2 > overRect.top + overRect.height / 2;
  };

  const placeForOver = (activeId: string, overId: string, below: boolean) => {
    const overCard = board.cards.find((c) => c.id === overId);
    if (overCard) {
      const colCards = board.cards
        .filter((c) => c.columnId === overCard.columnId)
        .sort((a, b) => a.order - b.order);
      let idx = colCards.findIndex((c) => c.id === overId);
      if (below) idx += 1;
      const activeIdx = colCards.findIndex((c) => c.id === activeId);
      if (activeIdx !== -1 && activeIdx < idx) idx -= 1;
      board.moveCardTo(activeId, overCard.columnId, idx);
      return;
    }
    // Over a column surface (empty column): append — unless the card
    // already lives there, where hovering gaps must not yank it to the end.
    const col = board.columns.find((c) => c.id === overId);
    if (!col) return;
    const home = board.cards.find((c) => c.id === activeId)?.columnId;
    if (home !== col.id) board.moveCardTo(activeId, col.id);
  };

  const restoreSnapshot = () =>
    board.setBoard({
      id: board.id,
      title: board.title,
      columns: board.columns,
      cards: dragSnapshot.current,
      tags: board.tags,
    });

  const onDragStart = (e: DragStartEvent) => {
    clearCardOverlayTimer();
    if (e.active.data.current?.type === "column") {
      setShowCardOverlay(false);
      return;
    }
    dragSnapshot.current = board.cards;
    setActiveCardId(String(e.active.id));
    setShowCardOverlay(true);
    setOverColumnId(null);
  };
  const onDragOver = (e: DragOverEvent) => {
    if (e.active.data.current?.type === "column") return;
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    setOverColumnId(
      overId
        ? (board.cards.find((c) => c.id === overId)?.columnId ?? overId)
        : null,
    );
    if (!overId || overId === activeId) return;
    placeForOver(activeId, overId, belowOverItem(e));
  };
  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    setActiveCardId(null);
    setOverColumnId(null);
    if (e.active.data.current?.type === "column") {
      clearCardOverlayTimer();
      setShowCardOverlay(false);
      captureColumnPositions();
      const from = sorted.findIndex((c) => c.id === activeId);
      const to = sorted.findIndex((c) => c.id === overId);
      if (from !== -1 && to !== -1 && from !== to) {
        board.reorderColumns(arrayMove(sorted, from, to).map((c) => c.id));
      }
      setColumnDropRevision((revision) => revision + 1);
      return;
    }
    finishCardOverlay();
    markDragEnd();
    if (!overId) {
      restoreSnapshot(); // dropped outside any destination
      return;
    }
    if (overId !== activeId) placeForOver(activeId, overId, belowOverItem(e));
  };
  const onDragCancel = (e: DragCancelEvent) => {
    if (e.active.data.current?.type !== "column") {
      restoreSnapshot();
      finishCardOverlay();
    } else {
      clearCardOverlayTimer();
      setShowCardOverlay(false);
      captureColumnPositions();
      setColumnDropRevision((revision) => revision + 1);
    }
    setActiveCardId(null);
    setOverColumnId(null);
  };

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
      // Touch, pen, and left-button mouse may all grab empty board space.
      // Cards own their own DnD system and never reach this handler.
      if (e.isPrimary === false) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
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
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
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
        <SortableContext
          items={sorted.map((c) => c.id)}
          strategy={horizontalListSortingStrategy}
        >
          {sorted.map((c) => (
            <ColumnView
              key={c.id}
              column={c}
              board={board}
              autoRename={freshColId === c.id}
              onOpenCard={(cardId) =>
                setCardModal({ columnId: c.id, cardId })
              }
              dropHighlight={overColumnId === c.id}
            />
          ))}
        </SortableContext>
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
    {showCardOverlay && (
      <DragOverlay>
        {activeCard ? (
          <div className="kb-card kb-drag-overlay">
            <h3 className="kb-card-title">{activeCard.title}</h3>
            {activeCard.description && (
              <p className="kb-card-desc">{activeCard.description}</p>
            )}
          </div>
        ) : null}
      </DragOverlay>
    )}
    </DndContext>
  );
}
