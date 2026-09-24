import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "../App";
import {
  PAN_THRESHOLD_PX,
  computeVelocity,
  shouldStartPan,
} from "./boardPan";

function el(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  return host.firstElementChild as HTMLElement;
}

describe("shouldStartPan (empty-space hand)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("starts on empty board / column / header space", () => {
    const board = el(`<main class="kb-board"></main>`);
    expect(shouldStartPan(board)).toBe(true);
    const body = el(
      `<section class="kb-col"><div class="kb-col-body"></div></section>`,
    );
    expect(
      shouldStartPan(body.querySelector(".kb-col-body")),
    ).toBe(true);
  });

  it("never starts on cards, controls, or overlays", () => {
    const host = el(`<div>
      <article class="kb-card"><h3>t</h3></article>
      <button class="kb-addcard">+ Add card</button>
      <input value="x" />
      <div class="kb-modal"><input value="y" /></div>
      <div class="kb-pager"><button>›</button></div>
    </div>`);
    for (const target of [
      host.querySelector(".kb-card")!,
      host.querySelector("h3")!,
      host.querySelector(".kb-addcard")!,
      host.querySelector("input")!,
      host.querySelector(".kb-modal input")!,
      host.querySelector(".kb-pager button")!,
    ]) {
      expect(shouldStartPan(target)).toBe(false);
    }
  });

  it("rejects non-element targets", () => {
    expect(shouldStartPan(null)).toBe(false);
    expect(shouldStartPan({} as EventTarget)).toBe(false);
  });
});

describe("computeVelocity", () => {
  it("is the x slope in px/ms", () => {
    expect(
      computeVelocity([
        { x: 0, t: 0 },
        { x: 100, t: 100 },
      ]),
    ).toBeCloseTo(1);
  });

  it("is 0 without enough samples or time", () => {
    expect(computeVelocity([])).toBe(0);
    expect(computeVelocity([{ x: 5, t: 5 }])).toBe(0);
    expect(
      computeVelocity([
        { x: 0, t: 10 },
        { x: 50, t: 10 },
      ]),
    ).toBe(0);
  });

  it("clamps wild values", () => {
    expect(
      computeVelocity([
        { x: 0, t: 0 },
        { x: 10000, t: 1 },
      ]),
    ).toBe(3);
  });
});

describe("board pan gesture (App)", () => {
  function pointerEvent(type: string, init: Record<string, unknown>) {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, {
      pointerId: 9,
      button: 0,
      isPrimary: true,
      clientX: 0,
      clientY: 0,
      ...init,
    });
    return e;
  }

  it("touch swipe on empty space pans the board 1:1", () => {
    render(<App />);
    const boardEl = document.querySelector(".kb-board") as HTMLElement;
    boardEl.scrollLeft = 0;
    fireEvent(
      boardEl,
      pointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 300,
        clientY: 300,
      }),
    );
    fireEvent(
      boardEl,
      pointerEvent("pointermove", {
        pointerType: "touch",
        clientX: 300 - PAN_THRESHOLD_PX - 100,
        clientY: 300,
      }),
    );
    expect(boardEl.scrollLeft).toBe(100 + PAN_THRESHOLD_PX);
    expect(boardEl.classList.contains("panning")).toBe(true);
    fireEvent(
      boardEl,
      pointerEvent("pointerup", {
        pointerType: "touch",
        clientX: 200,
        clientY: 300,
      }),
    );
    expect(boardEl.classList.contains("panning")).toBe(false);
  });

  it("vertical swipe on empty space does not pan (native column scroll owns it)", () => {
    render(<App />);
    const boardEl = document.querySelector(".kb-board") as HTMLElement;
    boardEl.scrollLeft = 0;
    fireEvent(
      boardEl,
      pointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 300,
        clientY: 300,
      }),
    );
    fireEvent(
      boardEl,
      pointerEvent("pointermove", {
        pointerType: "touch",
        clientX: 302,
        clientY: 420,
      }),
    );
    expect(boardEl.scrollLeft).toBe(0);
    expect(boardEl.classList.contains("panning")).toBe(false);
  });

  it("pressing a card never starts a board pan", () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: /add card/i })[0]);
    fireEvent.change(screen.getByPlaceholderText(/card title/i), {
      target: { value: "Card" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    const cardEl = screen.getByText("Card").closest("article")!;
    const boardEl = document.querySelector(".kb-board") as HTMLElement;
    fireEvent(
      cardEl,
      pointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 60,
        clientY: 200,
      }),
    );
    fireEvent(
      cardEl,
      pointerEvent("pointermove", {
        pointerType: "touch",
        clientX: -200,
        clientY: 200,
      }),
    );
    expect(boardEl.scrollLeft).toBe(0);
    expect(boardEl.classList.contains("panning")).toBe(false);
  });
});
