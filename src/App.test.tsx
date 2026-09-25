import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

  it("adds a card inline in the selected column on Enter", async () => {
    const user = userEvent.setup();
    render(<App />);
    const column = screen.getByText("In Progress").closest("section")!;
    await user.click(within(column).getByRole("button", { name: /add card/i }));
    const input = within(column).getByRole("textbox", {
      name: "New card title in In Progress",
    });
    await user.type(input, "  Hello  {enter}");
    expect(within(column).getByText("Hello")).toBeInTheDocument();
    expect(input).not.toBeInTheDocument();
    expect(screen.queryByText("New card")).not.toBeInTheDocument();
  });

  it("does not add an empty card and lets the inline editor cancel", async () => {
    const user = userEvent.setup();
    render(<App />);
    const column = screen.getByText("To Do").closest("section")!;
    await user.click(within(column).getByRole("button", { name: /add card/i }));
    const input = within(column).getByRole("textbox", {
      name: "New card title in To Do",
    });
    await user.type(input, "  {enter}");
    expect(column.querySelectorAll(".kb-card")).toHaveLength(0);
    await user.type(input, "Draft{escape}");
    expect(input).not.toBeInTheDocument();
    expect(within(column).queryByText("Draft")).not.toBeInTheDocument();
  });

  it("shows a drag handle on every column", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "Move To Do" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move In Progress" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move Done" })).toBeInTheDocument();
  });

  it("reorders columns when a header handle is dragged", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getAllByRole("button", { name: /add card/i })[0]);
    await user.type(screen.getByPlaceholderText(/card title/i), "Keep me{enter}");
    const columns = Array.from(document.querySelectorAll<HTMLElement>(".kb-col"));
    columns.forEach((column, index) => {
      vi.spyOn(column, "getBoundingClientRect").mockReturnValue(
        new DOMRect(index * 300, 100, 260, 400),
      );
    });

    const handle = screen.getByRole("button", { name: "Move To Do" });
    fireEvent.mouseDown(handle, { button: 0, clientX: 130, clientY: 120 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 730, clientY: 120 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 735, clientY: 120 });
    fireEvent.mouseUp(document, { button: 0, clientX: 735, clientY: 120 });

    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll(".kb-col-label"), (label) => label.textContent),
      ).toEqual(["In Progress", "Done", "To Do"]),
    );
    expect(
      within(document.querySelectorAll<HTMLElement>(".kb-col")[2]).getByText("Keep me"),
    ).toBeInTheDocument();
  });

  it("still moves cards between columns by dragging", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getAllByRole("button", { name: /add card/i })[0]);
    await user.type(screen.getByPlaceholderText(/card title/i), "Move me{enter}");
    const columns = Array.from(document.querySelectorAll<HTMLElement>(".kb-col"));
    columns.forEach((column, index) => {
      vi.spyOn(column, "getBoundingClientRect").mockReturnValue(
        new DOMRect(index * 300, 100, 260, 400),
      );
    });
    const card = screen.getByText("Move me").closest("article")!;
    vi.spyOn(card, "getBoundingClientRect").mockReturnValue(
      new DOMRect(10, 160, 240, 100),
    );

    fireEvent.mouseDown(card, { button: 0, clientX: 130, clientY: 200 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 430, clientY: 300 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 435, clientY: 300 });
    await waitFor(() => expect(columns[1]).toHaveClass("drop-over"));
    fireEvent.mouseUp(document, { button: 0, clientX: 435, clientY: 300 });

    await waitFor(() =>
      expect(within(columns[1]).getByText("Move me")).toBeInTheDocument(),
    );
  });
});
