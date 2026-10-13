import { test, expect, type Page, type Locator } from "@playwright/test";
import { collection } from "./fixtures";

const pageErrors = new WeakMap<Page, string[]>();

const sidebar = (page: Page) => page.locator("#board-sidebar");
const column = (page: Page, title: string) => page.locator(".kb-col").filter({ has: page.getByRole("button", { name: title, exact: true }) });

async function openSidebar(page: Page) {
  if (!(await sidebar(page).isVisible())) await page.getByRole("button", { name: "Boards", exact: true }).click();
}
async function closeDrawer(page: Page) {
  if (await page.getByRole("dialog", { name: "Boards", exact: true }).isVisible()) {
    const backdrop = page.locator(".kb-sidebar-backdrop");
    const bounds = await backdrop.boundingBox();
    expect(bounds).not.toBeNull();
    await backdrop.click({ position: { x: bounds!.width - 8, y: bounds!.height / 2 } });
    await expect(page.getByRole("dialog", { name: "Boards", exact: true })).toHaveCount(0);
  }
}
async function selectBoard(page: Page, title: string) {
  await openSidebar(page);
  await sidebar(page).getByRole("button", { name: title, exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}
async function stored(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("kanban.boards.v1")!));
}
async function noOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  for (const selector of [".kb-header", ".kb-toolbar", '.kb-modal:not([hidden])', ".kb-card:not(.kb-drag-overlay)"]) {
    const elements = page.locator(selector);
    for (let i = 0; i < await elements.count(); i++) {
      const item = elements.nth(i);
      if (await item.isVisible()) expect(await item.evaluate((element) => element.scrollWidth - element.clientWidth), selector).toBeLessThanOrEqual(2);
    }
  }
}
async function drag(page: Page, source: Locator, destination: Locator, verticalOffset = 0) {
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await destination.boundingBox();
  expect(from).not.toBeNull(); expect(to).not.toBeNull();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + Math.min(20, from!.height / 2));
  await page.mouse.down();
  await page.mouse.move(from!.x + from!.width / 2 + 8, from!.y + 20, { steps: 2 });
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2 + verticalOffset, { steps: 14 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  if (process.env.KANBAN_E2E_CPU_THROTTLE) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.KANBAN_E2E_CPU_THROTTLE) });
  }
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((data) => {
    if (localStorage.getItem("kanban.boards.v1") === null) localStorage.setItem("kanban.boards.v1", JSON.stringify(data));
  }, collection);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Product roadmap", exact: true })).toBeVisible();
});

test.afterEach(async ({ page }) => { expect(pageErrors.get(page)).toEqual([]); });

test("light/dark themes, KB logo, and layout at desktop and narrow widths", async ({ page }, testInfo) => {
  for (const mode of ["dark", "light"] as const) {
    await openSidebar(page);
    const toggle = sidebar(page).getByRole("button", { name: `Switch to ${mode} mode` });
    if (await toggle.count()) await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
    await expect(sidebar(page).getByRole("img", { name: "KB logo" })).toBeVisible();
    await expect(sidebar(page).getByText("Kanban", { exact: true })).toHaveCount(0);
    await expect(sidebar(page).getByRole("button", { name: "Close boards sidebar" })).toHaveCount(0);
    await expect(page.getByText("From first thought to shipped. A home for what’s next.")).toHaveCount(0);
    await closeDrawer(page);
    await noOverflow(page);
    await expect(page.getByText(/^KB-\d+$/)).toHaveCount(0);
    await expect(page.locator(".kb-card")).toHaveCount(9);
    expect(await page.locator(".kb-card").first().evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(mode === "dark" ? "rgb(30, 31, 35)" : "rgb(255, 255, 255)");
    await page.screenshot({ path: testInfo.outputPath(`graphite-${mode}.png`) });
  }
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  for (const width of [360, 390, 700, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
  }
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 560 });
    await page.getByRole("button", { name: "New card", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "New card" });
    await editor.getByRole("textbox", { name: "Title", exact: true }).fill(`Small window ${width}`);
    await editor.getByRole("button", { name: "high", exact: true }).click();
    await editor.getByRole("button", { name: "Development", exact: true }).click();
    await noOverflow(page);
    await editor.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("button", { name: `Edit Small window ${width}`, exact: true })).toBeVisible();
  }
});

test("board creation, renaming, deletion, empty workspace, and reload", async ({ page }) => {
  await openSidebar(page);
  await sidebar(page).getByRole("button", { name: "+ Add board", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "New board" });
  await dialog.getByRole("textbox", { name: "Board name" }).fill("   ");
  await expect(dialog.getByRole("button", { name: "Create board" })).toBeDisabled();
  await dialog.getByRole("textbox", { name: "Board name" }).fill("Launch plan");
  await dialog.getByRole("button", { name: "Create board" }).click();
  await expect(page.getByRole("heading", { name: "Launch plan" })).toBeVisible();
  await expect(page.locator(".kb-card")).toHaveCount(0);
  await openSidebar(page);
  await sidebar(page).getByRole("button", { name: "Rename board Launch plan" }).click();
  dialog = page.getByRole("dialog", { name: "Rename board" });
  await dialog.getByRole("textbox", { name: "Board name" }).fill("Launch checklist");
  await dialog.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("heading", { name: "Launch checklist" })).toBeVisible();
  await expect.poll(async () => (await stored(page)).boards.find((board: { title: string }) => board.title === "Launch checklist")?.title).toBe("Launch checklist");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Launch checklist" })).toBeVisible();
  await selectBoard(page, "Product roadmap");
  await expect(page.locator(".kb-card")).toHaveCount(9);
  for (const title of ["Launch checklist", "Website refresh", "Product roadmap"]) {
    await openSidebar(page);
    await sidebar(page).getByRole("button", { name: `Delete board ${title}` }).click();
    dialog = page.getByRole("dialog", { name: "Delete board" });
    await expect(dialog).toContainText(title);
    await dialog.getByRole("button", { name: "Delete board", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "No boards yet" })).toBeVisible();
  await expect.poll(async () => (await stored(page)).boards.length).toBe(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "No boards yet" })).toBeVisible();
  await page.getByRole("main").getByRole("button", { name: "+ Add board" }).click();
  await page.getByRole("textbox", { name: "Board name" }).fill("Fresh start");
  await page.getByRole("button", { name: "Create board" }).click();
  await expect(page.getByRole("heading", { name: "Fresh start" })).toBeVisible();
});

test("card editing, status, priorities, tags, inline creation, and deletion persist", async ({ page }) => {
  await page.getByRole("button", { name: "New card", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New card" });
  await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("Ship the redesign");
  await dialog.getByRole("textbox", { name: "Description" }).fill("A focused workspace with a comfortable dark theme.");
  await dialog.getByLabel("Deadline").fill("2030-07-02");
  await dialog.getByLabel("Column").selectOption({ label: "In Progress" });
  await dialog.getByRole("button", { name: "high", exact: true }).click();
  await dialog.getByRole("button", { name: "Design", exact: true }).click();
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  const card = page.locator(".kb-card").filter({ hasText: "Ship the redesign" });
  await expect(column(page, "In Progress").locator(".kb-card").filter({ hasText: "Ship the redesign" })).toBeVisible();
  await card.click();
  const edit = page.getByRole("dialog", { name: "Edit card" });
  await edit.getByRole("textbox", { name: "Title", exact: true }).fill("Shipped the redesign");
  await edit.getByRole("button", { name: "Manage tags" }).click();
  await page.getByRole("dialog", { name: "Tags", exact: true }).getByRole("textbox", { name: "Tag name" }).fill("Release");
  await page.getByRole("button", { name: "Add tag", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(edit.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Shipped the redesign");
  await edit.getByRole("button", { name: "Release", exact: true }).click();
  await edit.getByLabel("Column").selectOption({ label: "Done" });
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  const finished = page.locator(".kb-card").filter({ hasText: "Shipped the redesign" });
  await expect(finished).toHaveClass(/is-done/);
  await expect(finished).toContainText("Release");
  await expect.poll(async () => (await stored(page)).boards[0].cards.some((card: { title: string }) => card.title === "Shipped the redesign")).toBe(true);
  await page.reload();
  await expect(finished).toBeVisible();
  await page.getByRole("button", { name: "Delete Shipped the redesign" }).click();
  await expect(finished).toHaveCount(0);
  await column(page, "To Do").getByRole("button", { name: "+ Add card", exact: true }).click();
  await page.getByRole("textbox", { name: "New card title in To Do" }).fill("A quick idea");
  await page.getByRole("textbox", { name: "New card title in To Do" }).press("Enter");
  await expect(page.getByRole("button", { name: "Edit A quick idea" })).toBeVisible();
  await page.getByRole("button", { name: "Tags", exact: true }).click();
  await page.getByRole("button", { name: "Delete tag Release" }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
});

test("search, filters, list view, and keyboard navigation are interactive", async ({ page }) => {
  await page.keyboard.press("Control+k");
  const search = sidebar(page).getByRole("textbox", { name: "Search cards" });
  await expect(search).toBeFocused();
  await search.fill("REFINE");
  await closeDrawer(page);
  await expect(page.locator(".kb-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  const filter = page.getByRole("dialog", { name: "Filter cards" });
  await filter.getByLabel("Priority", { exact: true }).selectOption("high");
  await filter.getByLabel("Tag", { exact: true }).selectOption("tag-0");
  await filter.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".kb-card")).toHaveCount(3);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".kb-list-row")).toHaveCount(3);
  await page.getByRole("button", { name: "Edit Refine the board navigation" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Edit card" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Edit card" })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.locator(".kb-list-row")).toHaveCount(9);
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.locator(".kb-card")).toHaveCount(9);
  await noOverflow(page);
});

test("desktop dragging and mobile column navigation keep the board usable", async ({ page, isMobile }) => {
  if (isMobile) {
    const board = page.locator(".kb-board");
    await page.getByRole("button", { name: "Next column" }).click();
    await expect.poll(() => board.evaluate((element) => element.scrollLeft)).toBeGreaterThan(200);
    await page.getByRole("button", { name: "Previous column" }).click();
    await expect.poll(() => board.evaluate((element) => element.scrollLeft)).toBeLessThan(2);
    await noOverflow(page);
    return;
  }
  await drag(page, page.locator(".kb-card").filter({ hasText: "Refine the board navigation" }), column(page, "In Progress").locator(".kb-col-head"), 100);
  await expect(column(page, "In Progress").locator(".kb-card").filter({ hasText: "Refine the board navigation" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Edit card" })).toHaveCount(0);
  await drag(page, page.getByRole("button", { name: "Move To Do", exact: true }), page.getByRole("button", { name: "Move Done", exact: true }));
  await expect(page.locator(".kb-col-label")).toHaveText(["In Progress", "Done", "To Do"]);
  await expect.poll(async () => (await stored(page)).boards[0].columns.sort((a: { order: number }, b: { order: number }) => a.order - b.order).map((column: { title: string }) => column.title)).toEqual(["In Progress", "Done", "To Do"]);
  await page.reload();
  await expect(page.locator(".kb-col-label")).toHaveText(["In Progress", "Done", "To Do"]);
  await noOverflow(page);
});

test("keyboard drag cancellation and column ordering work without opening the editor", async ({ page }) => {
  const card = page.getByRole("button", { name: "Edit Refine the board navigation", exact: true });
  await card.focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "New card", exact: true })).toBeDisabled();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(column(page, "To Do").locator(".kb-card").filter({ hasText: "Refine the board navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New card", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Move To Do", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(column(page, "To Do")).toHaveClass(/is-dragging/);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => column(page, "To Do").evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41)).toBeGreaterThan(100);
  await page.keyboard.press("Space");
  await expect(page.locator(".kb-col-label")).toHaveText(["In Progress", "To Do", "Done"]);
  await expect(page.getByRole("dialog", { name: "Edit card" })).toHaveCount(0);
});

test("keyboard column destinations survive reversals, boundaries, and cancellation", async ({ page }) => {
  const grip = page.getByRole("button", { name: "Move To Do", exact: true });
  await grip.focus();
  await page.keyboard.press("Space");
  await expect(column(page, "To Do")).toHaveClass(/is-dragging/);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(column(page, "To Do")).not.toHaveClass(/is-dragging/);
  await expect(page.locator(".kb-col-label")).toHaveText(["To Do", "In Progress", "Done"]);

  await grip.focus();
  await page.keyboard.press("Space");
  await expect(column(page, "To Do")).toHaveClass(/is-dragging/);
  await page.keyboard.press("ArrowLeft"); // First column has no destination to its left.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight"); // Last column has no destination to its right.
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Space");
  await expect(page.locator(".kb-col-label")).toHaveText(["In Progress", "To Do", "Done"]);
  await expect.poll(async () => (await stored(page)).boards[0].columns
    .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
    .map((item: { title: string }) => item.title)).toEqual(["In Progress", "To Do", "Done"]);
});

test("columns, very long content, many cards, and reduced motion keep the layout usable", async ({ page }) => {
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("kanban.boards.v1")!);
    const source = data.boards[0].cards[0];
    data.boards[0].cards.push(...Array.from({ length: 40 }, (_, index) => ({ ...source, id: `extra-${index}`, title: `More work ${index}`, order: index + 3 })));
    localStorage.setItem("kanban.boards.v1", JSON.stringify(data));
  });
  await page.reload();
  const last = page.getByRole("button", { name: "Edit More work 39", exact: true });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeVisible();
  expect(await column(page, "To Do").locator(".kb-col-body").evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.getByRole("button", { name: "+ Add column", exact: true }).click();
  const rename = page.locator(".kb-rename");
  await rename.fill("Review");
  await rename.press("Enter");
  await expect(column(page, "Review")).toBeVisible();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "New card in Review" }).click();
  const dialog = page.getByRole("dialog", { name: "New card" });
  await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("VeryLongUnbrokenCardTitle".repeat(10));
  await dialog.getByRole("textbox", { name: "Description" }).fill("A detailed description. ".repeat(80));
  await noOverflow(page);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.locator(".kb-rename")).toHaveCount(0);
  await noOverflow(page);
  await page.getByRole("button", { name: "Delete Review", exact: true }).click();
  await expect(column(page, "Review")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "New card", exact: true }).click();
  expect(await page.getByRole("dialog", { name: "New card" }).evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await page.keyboard.press("Escape");
});
