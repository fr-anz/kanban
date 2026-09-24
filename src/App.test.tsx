import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("Board UI", () => {
  it("renders header, 3 default columns, ghost add, and tags button", () => {
    render(<App />);
    expect(screen.getByText("My Board")).toBeInTheDocument();
    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "+ Add column" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /tags/i }),
    ).toBeInTheDocument();
  });

  it("adds a column via header button", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "+ Add column" }));
    expect(screen.getByDisplayValue("New column")).toBeInTheDocument();
  });

  it("adds a card via column add button", async () => {
    const user = userEvent.setup();
    render(<App />);
    const addBtns = screen.getAllByRole("button", { name: /add card/i });
    await user.click(addBtns[0]);
    expect(screen.getByText(/new card/i)).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/card title/i), "Hello");
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
