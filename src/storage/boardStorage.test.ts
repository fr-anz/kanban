import { describe, expect, it } from "vitest";
import {
  memoryBoardStorage,
  serializeBoard,
  parseBoard,
} from "./boardStorage";
import type { Board } from "../domain/types";

const sample: Board = {
  id: "b1",
  title: "My Board",
  columns: [{ id: "c1", title: "To Do", colorIndex: 0, order: 0 }],
  cards: [],
  tags: [],
};

describe("boardStorage (seam D)", () => {
  it("round-trips a board through save/load", async () => {
    const s = memoryBoardStorage();
    await s.save(sample);
    expect(await s.load()).toEqual(sample);
  });

  it("returns null when nothing stored", async () => {
    const s = memoryBoardStorage();
    expect(await s.load()).toBeNull();
  });

  it("recovers from corrupt JSON (serialize/parse)", () => {
    expect(parseBoard("not-json{{{")).toBeNull();
    expect(parseBoard(serializeBoard(sample))).toEqual(sample);
  });
});
