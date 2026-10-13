import { describe, expect, it } from "vitest";
import { parseBoard } from "./boardStorage";
import type { Board } from "../domain/types";

const sample: Board = {
  id: "b1",
  title: "My Board",
  columns: [{ id: "c1", title: "To Do", colorIndex: 0, order: 0 }],
  cards: [],
  tags: [],
};

describe("legacy board parsing", () => {
  it("returns null when nothing stored", () => {
    expect(parseBoard(null)).toBeNull();
  });

  it("recovers from corrupt JSON (serialize/parse)", () => {
    expect(parseBoard("not-json{{{")).toBeNull();
    expect(parseBoard(JSON.stringify(sample))).toEqual(sample);
  });
});
