import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

// SPEC § Card management:
// - Add via "Add card" bottom of column
// - Edit by clicking → same modal pre-filled
// - Delete via hover ×
// - Done column → strikethrough + reduced opacity
describe("SPEC §2 Card management", () => {
  it("edits by clicking: same modal pre-filled", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getAllByRole("button", { name: /add card/i })[0]);
    await user.type(screen.getByPlaceholderText(/card title/i), "Original");
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    expect(screen.getByText("Original")).toBeInTheDocument();

    await user.click(screen.getByText("Original"));
    expect(screen.getByText("Edit card")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Original")).toBeInTheDocument();
    await user.clear(screen.getByDisplayValue("Original"));
    await user.type(screen.getByPlaceholderText(/card title/i), "Edited");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(screen.getByText("Edited")).toBeInTheDocument();
    expect(screen.queryByText("Original")).not.toBeInTheDocument();
  });

  it("deletes via card ×", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getAllByRole("button", { name: /add card/i })[0]);
    await user.type(screen.getByPlaceholderText(/card title/i), "Gone");
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    expect(screen.getByText("Gone")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete Gone" }));
    expect(screen.queryByText("Gone")).not.toBeInTheDocument();
  });

  it("Done column renders strikethrough + reduced opacity", async () => {
    const user = userEvent.setup();
    render(<App />);
    const doneCol = screen.getByText("Done").closest("section")!;
    await user.click(
      within(doneCol as HTMLElement).getByRole("button", { name: /add card/i }),
    );
    await user.type(screen.getByPlaceholderText(/card title/i), "Finished");
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    const card = screen.getByText("Finished").closest("article")!;
    expect(card).toHaveClass("is-done");
  });
});
