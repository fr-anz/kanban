import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

// SPEC § Tag management:
// - Open from header "Tags" OR "Manage tags" link in card modal
// - Create: name + swatch + Add tag or Enter
// - Delete from manager list
// - Removed tags disappear from cards (filtered at render)
describe("SPEC §3 Tag management", () => {
  it("opens from header Tags button and creates via Enter", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Tags" }));
    expect(screen.getByPlaceholderText("Tag name")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Tag name"), "bug{enter}");
    expect(screen.getByText("bug")).toBeInTheDocument();
  });

  it("opens from Manage tags link inside card modal", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getAllByRole("button", { name: /add card/i })[0]);
    await user.type(screen.getByPlaceholderText(/card title/i), "Task{enter}");
    await user.click(screen.getByText("Task"));
    await user.click(screen.getByRole("button", { name: /manage tags/i }));
    expect(screen.getByPlaceholderText("Tag name")).toBeInTheDocument();
  });

  it("deleted tags disappear from cards at render", async () => {
    const user = userEvent.setup();
    render(<App />);
    // create tag
    await user.click(screen.getByRole("button", { name: "Tags" }));
    await user.type(screen.getByPlaceholderText("Tag name"), "urgent");
    await user.click(screen.getByRole("button", { name: /add tag/i }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    // attach to card
    await user.click(screen.getAllByRole("button", { name: /add card/i })[0]);
    await user.type(screen.getByPlaceholderText(/card title/i), "Tagged{enter}");
    await user.click(screen.getByText("Tagged"));
    await user.click(screen.getByRole("button", { name: "urgent" }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(screen.getByText("urgent")).toBeInTheDocument();

    // delete tag → filtered at render
    await user.click(screen.getByRole("button", { name: "Tags" }));
    await user.click(screen.getByRole("button", { name: "Delete tag urgent" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("urgent")).not.toBeInTheDocument();
    expect(screen.getByText("Tagged")).toBeInTheDocument();
  });
});
