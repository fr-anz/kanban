import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";

// Drives the gesture with raw PointerEvents — the same events WebView2
// (desktop shell) delivers for touch/pen, where TouchEvents are unreliable.
function pointerEvent(type: string, init: Record<string, unknown>) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, {
    pointerId: 7,
    button: 0,
    isPrimary: true,
    clientX: 0,
    clientY: 0,
    ...init,
  });
  return e;
}

describe("pointer drag (touch/pen, incl. desktop shell)", () => {
  const origEFP = document.elementFromPoint;

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    document.elementFromPoint = origEFP;
    document.body.querySelector(".kb-touch-ghost")?.remove();
    document.body.classList.remove("kb-touch-drag");
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function addCard(title: string) {
    fireEvent.click(screen.getAllByRole("button", { name: /add card/i })[0]);
    fireEvent.change(screen.getByPlaceholderText(/card title/i), {
      target: { value: title },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
  }

  it("long-press touch drag moves the card to the column under the pointer", () => {
    render(<App />);
    addCard("DragMe");
    const cardEl = screen.getByText("DragMe").closest("article")!;

    fireEvent(
      cardEl,
      pointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 60,
        clientY: 200,
      }),
    );
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(document.body.querySelector(".kb-touch-ghost")).not.toBeNull();

    const doneCol = screen.getByText("Done").closest("section")!;
    document.elementFromPoint = () => doneCol;
    fireEvent(
      cardEl,
      pointerEvent("pointermove", {
        pointerType: "touch",
        clientX: 600,
        clientY: 200,
      }),
    );
    expect(doneCol.classList.contains("drop-over")).toBe(true);
    fireEvent(
      cardEl,
      pointerEvent("pointerup", {
        pointerType: "touch",
        clientX: 600,
        clientY: 200,
      }),
    );

    const moved = screen.getByText("DragMe").closest("article")!;
    expect(moved).toHaveClass("is-done");
    expect(document.body.querySelector(".kb-touch-ghost")).toBeNull();
  });

  it("mouse pointers never start a touch drag (HTML5 DnD owns the mouse)", () => {
    render(<App />);
    addCard("NoDrag");
    const cardEl = screen.getByText("NoDrag").closest("article")!;
    fireEvent(
      cardEl,
      pointerEvent("pointerdown", {
        pointerType: "mouse",
        clientX: 60,
        clientY: 200,
      }),
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(document.body.querySelector(".kb-touch-ghost")).toBeNull();
  });
});
