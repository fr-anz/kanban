import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAG_CLICK_SUPPRESS_MS,
  markDragEnd,
  wasJustDragged,
} from "./dragGuard";

describe("dragGuard (click-after-drag suppression)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is quiet with no recent drag", () => {
    expect(wasJustDragged()).toBe(false);
  });

  it("suppresses clicks right after a drag ends", () => {
    markDragEnd();
    expect(wasJustDragged()).toBe(true);
  });

  it("lets clicks through after the window expires", () => {
    markDragEnd();
    vi.advanceTimersByTime(DRAG_CLICK_SUPPRESS_MS + 50);
    expect(wasJustDragged()).toBe(false);
  });
});
