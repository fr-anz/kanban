import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../App";
import { BOARD_STORAGE_KEY } from "./boardStorage";

describe("persistence auto-load (App)", () => {
  it("restores columns and cards after reload", async () => {
    localStorage.setItem(
      BOARD_STORAGE_KEY,
      JSON.stringify({
        id: "b1",
        title: "My Board",
        columns: [{ id: "c1", title: "Backlog", colorIndex: 0, order: 0 }],
        cards: [
          {
            id: "k1",
            columnId: "c1",
            title: "Restored card",
            description: "",
            priority: "medium",
            tagIds: [],
            subtasks: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            order: 0,
          },
        ],
        tags: [],
      }),
    );
    render(<App />);
    expect(await screen.findByText("Backlog")).toBeInTheDocument();
    expect(await screen.findByText("Restored card")).toBeInTheDocument();
  });
});
