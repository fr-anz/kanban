import { describe, expect, it, vi, afterEach } from "vitest";
import { columnIdFromPoint } from "./touchDrag";

function fakeColumn(id: string) {
  return {
    getAttribute: (name: string) =>
      name === "data-column-id" ? id : null,
  };
}

describe("columnIdFromPoint", () => {
  const orig = document.elementFromPoint;

  afterEach(() => {
    document.elementFromPoint = orig;
  });

  it("returns the column id when the touch lands inside a column", () => {
    const col = fakeColumn("c-42");
    document.elementFromPoint = vi.fn(() => ({ closest: () => col }) as never);
    expect(columnIdFromPoint(100, 200)).toBe("c-42");
  });

  it("returns null when nothing is hit", () => {
    document.elementFromPoint = vi.fn(() => null);
    expect(columnIdFromPoint(10, 10)).toBeNull();
  });

  it("returns null when the hit is outside any column", () => {
    document.elementFromPoint = vi.fn(() => ({ closest: () => null }) as never);
    expect(columnIdFromPoint(10, 10)).toBeNull();
  });
});
