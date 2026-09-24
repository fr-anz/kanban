import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useBoard } from "./useBoard";

function setup() {
  const { result } = renderHook(() => useBoard());
  const cols = result.current.columns;
  const todo = cols[0].id;
  const prog = cols[1].id;
  const done = cols[2].id;
  let a = "";
  let b = "";
  let c = "";
  act(() => {
    a = result.current.addCard(todo, { title: "A" });
    b = result.current.addCard(todo, { title: "B" });
    c = result.current.addCard(prog, { title: "C" });
  });
  return { result, todo, prog, done, a, b, c };
}

const titles = (r: { current: { cards: { columnId: string; order: number; title: string }[] } }, col: string) =>
  r.current.cards
    .filter((x) => x.columnId === col)
    .sort((x, y) => x.order - y.order)
    .map((x) => x.title);

const orders = (r: { current: { cards: { columnId: string; order: number }[] } }, col: string) =>
  r.current.cards
    .filter((x) => x.columnId === col)
    .sort((x, y) => x.order - y.order)
    .map((x) => x.order);

describe("useBoard.moveCardTo (positional DnD)", () => {
  it("reorders within one column", () => {
    const { result, todo, b } = setup();
    act(() => {
      result.current.moveCardTo(b, todo, 0);
    });
    expect(titles(result, todo)).toEqual(["B", "A"]);
    expect(orders(result, todo)).toEqual([0, 1]);
  });

  it("moves across columns at an explicit index", () => {
    const { result, todo, prog, b } = setup();
    act(() => {
      result.current.moveCardTo(b, prog, 0);
    });
    expect(titles(result, prog)).toEqual(["B", "C"]);
    expect(titles(result, todo)).toEqual(["A"]);
    expect(orders(result, prog)).toEqual([0, 1]);
    expect(orders(result, todo)).toEqual([0]);
  });

  it("moves into an empty column", () => {
    const { result, done, a } = setup();
    act(() => {
      result.current.moveCardTo(a, done, 0);
    });
    expect(titles(result, done)).toEqual(["A"]);
    expect(orders(result, done)).toEqual([0]);
  });

  it("appends at the end when no index given", () => {
    const { result, todo, c } = setup();
    act(() => {
      result.current.moveCardTo(c, todo);
    });
    expect(titles(result, todo)).toEqual(["A", "B", "C"]);
  });

  it("clamps out-of-range indices", () => {
    const { result, todo, a } = setup();
    act(() => {
      result.current.moveCardTo(a, todo, 99);
    });
    expect(titles(result, todo)).toEqual(["B", "A"]);
    act(() => {
      result.current.moveCardTo(a, todo, -5);
    });
    expect(titles(result, todo)).toEqual(["A", "B"]);
  });

  it("leaves unknown cards and other columns alone", () => {
    const { result, prog } = setup();
    act(() => {
      result.current.moveCardTo("nope", prog, 0);
    });
    expect(result.current.cards).toHaveLength(3);
    expect(titles(result, prog)).toEqual(["C"]);
    expect(orders(result, prog)).toEqual([0]);
  });
});
