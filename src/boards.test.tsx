import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { BOARDS_STORAGE_KEY } from "./storage/boardCollectionStorage";
import type { BoardCollection } from "./domain/types";

const sidebar = () => within(document.getElementById("board-sidebar")!);
const heading = (name: string) => screen.getByRole("heading", { name, level: 1 });
const saved = () => JSON.parse(localStorage.getItem(BOARDS_STORAGE_KEY)!) as BoardCollection;

async function create(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(sidebar().getByRole("button", { name: "+ Add board" }));
  await user.type(screen.getByRole("textbox", { name: "Board name" }), `${name}{enter}`);
  expect(heading(name.trim())).toBeInTheDocument();
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("local boards", () => {
  it("creates and selects independent boards, then restores content and selection on reload", async () => {
    const user = userEvent.setup();
    const app = render(<StrictMode><App /></StrictMode>);
    await screen.findByRole("heading", { name: "My Board", level: 1 });
    const todo = screen.getByText("To Do").closest("section")!;
    await user.click(within(todo).getByRole("button", { name: /add card/i }));
    await user.type(screen.getByRole("textbox", { name: "New card title in To Do" }), "Original task{enter}");
    await user.click(screen.getByRole("button", { name: "Tags" }));
    await user.type(screen.getByPlaceholderText("Tag name"), "Original tag{enter}");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await create(user, "  Work  ");
    expect(screen.queryByText("Original task")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Move / })).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Tags" }));
    expect(screen.queryByText("Original tag")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(sidebar().getByRole("button", { name: "My Board" }));
    expect(screen.getByText("Original task")).toBeInTheDocument();
    await user.click(sidebar().getByRole("button", { name: "Work" }));
    await waitFor(() => expect(saved().boards.find((board) => board.id === saved().activeBoardId)?.title).toBe("Work"));
    app.unmount();
    render(<App />);
    await screen.findByRole("heading", { name: "Work", level: 1 });
    expect(sidebar().getByRole("button", { name: "Work" })).toHaveAttribute("aria-current", "page");
    await user.click(sidebar().getByRole("button", { name: "My Board" }));
    expect(screen.getByText("Original task")).toBeInTheDocument();
  });

  it("validates names, allows duplicates, and supports rename and cancellation", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "My Board", level: 1 });
    const add = sidebar().getByRole("button", { name: "+ Add board" });
    await user.click(add);
    const input = screen.getByRole("textbox", { name: "Board name" });
    expect(input).toHaveFocus();
    await user.type(input, "   ");
    expect(screen.getByRole("button", { name: "Create board" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(add).toHaveFocus();
    expect(sidebar().getAllByRole("button", { name: "My Board" })).toHaveLength(1);
    await create(user, "My Board");
    expect(sidebar().getAllByRole("button", { name: "My Board" })).toHaveLength(2);
    await user.click(sidebar().getAllByRole("button", { name: "Rename board My Board" })[1]);
    expect(screen.getByRole("textbox", { name: "Board name" })).toHaveValue("My Board");
    await user.clear(screen.getByRole("textbox", { name: "Board name" }));
    await user.type(screen.getByRole("textbox", { name: "Board name" }), "  Renamed  {enter}");
    expect(heading("Renamed")).toBeInTheDocument();
    expect(sidebar().getByRole("button", { name: "Renamed" })).toHaveAttribute("aria-current", "page");
    await user.click(sidebar().getByRole("button", { name: "Rename board Renamed" }));
    await user.clear(screen.getByRole("textbox", { name: "Board name" }));
    await user.type(screen.getByRole("textbox", { name: "Board name" }), "Discard me");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(heading("Renamed")).toBeInTheDocument();
  });

  it("confirms deletion, selects a remaining board, and preserves an empty workspace on reload", async () => {
    const user = userEvent.setup();
    const app = render(<App />);
    await screen.findByRole("heading", { name: "My Board", level: 1 });
    await create(user, "Work");
    await user.click(sidebar().getByRole("button", { name: "Delete board My Board" }));
    expect(screen.getByRole("dialog", { name: "Delete board" })).toHaveTextContent("My Board");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(heading("Work")).toBeInTheDocument();
    await user.click(sidebar().getByRole("button", { name: "Delete board Work" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete board" }));
    expect(heading("My Board")).toBeInTheDocument();
    await user.click(sidebar().getByRole("button", { name: "Delete board My Board" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete board" }));
    expect(heading("No boards yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tags" })).not.toBeInTheDocument();
    await waitFor(() => expect(saved().boards).toEqual([]));
    app.unmount();
    render(<App />);
    await screen.findByRole("heading", { name: "No boards yet" });
    await user.click(within(screen.getByRole("main")).getByRole("button", { name: "+ Add board" }));
    await user.type(screen.getByRole("textbox", { name: "Board name" }), "Fresh{enter}");
    expect(heading("Fresh")).toBeInTheDocument();
  });

  it("clears inline drafts, dialogs, and scrolling when switching", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "My Board", level: 1 });
    await create(user, "Work");
    await user.click(screen.getAllByRole("button", { name: /add card/i })[0]);
    await user.type(screen.getByPlaceholderText(/card title/i), "Unfinished");
    document.querySelector(".kb-board")!.scrollLeft = 400;
    await user.click(sidebar().getByRole("button", { name: "My Board" }));
    await user.click(sidebar().getByRole("button", { name: "Work" }));
    expect(screen.queryByDisplayValue("Unfinished")).not.toBeInTheDocument();
    expect(document.querySelector(".kb-board")!.scrollLeft).toBe(0);
    await user.click(screen.getByRole("button", { name: "Tags" }));
    // Programmatic selection exercises cleanup while a board-scoped overlay is open.
    fireEvent.click(sidebar().getByRole("button", { name: "My Board" }));
    expect(screen.queryByPlaceholderText("Tag name")).not.toBeInTheDocument();
  });

  it("collapses and reopens the desktop sidebar", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "My Board", level: 1 });
    const toggle = screen.getByRole("button", { name: "Boards" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(screen.queryByRole("navigation", { name: "Board selection" })).not.toBeInTheDocument();
    await user.click(toggle);
    expect(screen.getByRole("navigation", { name: "Board selection" })).toBeInTheDocument();
  });

  it("uses a dismissible mobile drawer with focus containment and closes after selection", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "My Board", level: 1 });
    const toggle = screen.getByRole("button", { name: "Boards" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    const drawer = screen.getByRole("dialog", { name: "Boards" });
    expect(within(drawer).getByRole("button", { name: "Close boards sidebar" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(drawer).getByRole("button", { name: "+ Add board" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(toggle).toHaveFocus();
    await user.click(toggle);
    await user.click(sidebar().getByRole("button", { name: "My Board" }));
    expect(screen.queryByRole("dialog", { name: "Boards" })).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
    await user.click(toggle);
    await user.click(sidebar().getByRole("button", { name: "+ Add board" }));
    expect(screen.getByRole("dialog", { name: "New board" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(toggle).toHaveFocus();
  });

  it("keeps corrupt stored data intact and retries loading", async () => {
    localStorage.setItem(BOARDS_STORAGE_KEY, "invalid");
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load");
    expect(sidebar().getByRole("button", { name: "+ Add board" })).toBeDisabled();
    expect(localStorage.getItem(BOARDS_STORAGE_KEY)).toBe("invalid");
    localStorage.removeItem(BOARDS_STORAGE_KEY);
    await user.click(screen.getByRole("button", { name: "Retry load" }));
    await screen.findByRole("heading", { name: "My Board", level: 1 });
  });

  it("shows save failures and retries without losing the current board", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "My Board", level: 1 });
    await waitFor(() => expect(localStorage.getItem(BOARDS_STORAGE_KEY)).not.toBeNull());
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new Error("quota"); });
    await create(user, "Work");
    expect(await screen.findByRole("alert")).toHaveTextContent("Changes could not be saved");
    await user.click(screen.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(saved().boards).toHaveLength(2);
    expect(heading("Work")).toBeInTheDocument();
    setItem.mockRestore();
  });

  it("locks board navigation during a column drag and unlocks on cancellation", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "My Board", level: 1 });
    const handle = screen.getByRole("button", { name: "Move To Do" });
    fireEvent.mouseDown(handle, { button: 0, clientX: 130, clientY: 120 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 150, clientY: 120 });
    await waitFor(() => expect(sidebar().getByRole("button", { name: "My Board" })).toBeDisabled());
    expect(sidebar().getByRole("button", { name: "+ Add board" })).toBeDisabled();
    expect(sidebar().getByRole("button", { name: "Delete board My Board" })).toBeDisabled();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(sidebar().getByRole("button", { name: "My Board" })).toBeEnabled());
  });
});
