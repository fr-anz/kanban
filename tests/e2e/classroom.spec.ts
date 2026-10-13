import { test, expect, type Page } from "@playwright/test";

async function openSettings(page: Page) {
  if (!(await page.locator("#board-sidebar").isVisible())) await page.getByRole("button", { name: "Boards", exact: true }).click();
  await page.getByRole("button", { name: "Google Classroom", exact: true }).click();
  return page.getByRole("dialog", { name: "Google Classroom", exact: true });
}

async function setup(page: Page) {
  await page.addInitScript(() => {
    const fixture = { title: "Essay", description: "Read chapter one", failure: false, expired: false };
    Object.assign(window, { __classroomFixture: fixture });
    let configured = false;
    let connected = false;
    const status = () => ({ configured, account: connected ? { id: "student", email: "student@example.test" } : undefined,
      authExpired: false, signingIn: false });
    window.__KANBAN_CLASSROOM_CONNECTOR__ = {
      status: async () => status(),
      configure: async (json) => {
        if (!JSON.parse(json).installed) throw { code: "invalid_config", message: "Choose a Desktop app client." };
        configured = true; return status();
      },
      connect: async () => { connected = true; return status(); },
      cancelConnect: async () => {},
      disconnect: async () => { connected = false; return { revoked: true }; },
      listCourses: async () => [{ id: "biology", name: "Biology", section: "A" }, { id: "history", name: "History" }],
      fetchCourses: async (ids) => {
        if (fixture.expired) throw { code: "auth_expired", message: "Google authorization expired." };
        return { accountId: "student", results: ids.map((courseId) => fixture.failure
          ? { status: "error" as const, courseId, error: { code: "api", message: "Access denied. Missing: https://www.googleapis.com/auth/classroom.coursework.me.readonly" } }
          : { status: "ok" as const, snapshot: { courseId, courseWork: [{ id: "essay", title: fixture.title,
            description: fixture.description, alternateLink: "https://classroom.google.com/c/biology/a/essay",
            dueDate: { year: 2030, month: 11, day: 2 }, dueTime: { hours: 12 }, workType: "ASSIGNMENT" }],
            submissions: [{ courseWorkId: "essay", state: "TURNED_IN", late: true }] } }) };
      },
    };
  });
  await page.goto("/");
  const settings = await openSettings(page);
  await settings.getByLabel("Import OAuth client JSON").setInputFiles({ name: "desktop.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ installed: { client_id: "test.apps.googleusercontent.com", client_secret: "synthetic" } })) });
  await settings.getByRole("button", { name: "Sign in with Google" }).click();
  await settings.getByRole("checkbox", { name: "Biology · A" }).check();
  await settings.getByRole("button", { name: "Save course selection" }).click();
  if (!(await page.locator("#board-sidebar").isVisible())) await page.getByRole("button", { name: "Boards", exact: true }).click();
  await page.locator("#board-sidebar").getByRole("button", { name: "Biology", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit Essay", exact: true })).toBeVisible();
}

async function fixture(page: Page, changes: Partial<{ title: string; description: string; failure: boolean; expired: boolean }>) {
  await page.evaluate((changes) => Object.assign((window as unknown as { __classroomFixture: object }).__classroomFixture, changes), changes);
}
async function refresh(page: Page) {
  const settings = await openSettings(page);
  await settings.getByRole("button", { name: "Refresh now" }).click();
  await expect(settings.getByRole("status").filter({ hasText: "Coursework is ready" })).toBeVisible();
  await settings.getByRole("button", { name: "Close", exact: true }).click();
}

test("browser explains desktop-only Classroom support", async ({ page }) => {
  await page.goto("/");
  const settings = await openSettings(page);
  await expect(settings.getByText("Google Classroom is available in the desktop app.")).toBeVisible();
  await expect(settings.getByRole("button", { name: "Sign in with Google" })).toHaveCount(0);
});

test("select courses, override/reset imported fields, suppress deletion, and disconnect", async ({ page }) => {
  await setup(page);
  await expect(page.getByRole("button", { name: "Edit Essay", exact: true })).toHaveClass(/is-done/);
  await expect(page.locator(".kb-source-badge")).toContainText("Google Classroom · Turned in · Late");
  await page.getByRole("button", { name: "Edit Essay", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit card" });
  await expect(editor.getByRole("link", { name: "Open in Classroom" })).toHaveAttribute("href", "https://classroom.google.com/c/biology/a/essay");
  await editor.getByRole("textbox", { name: "Title", exact: true }).fill("My essay");
  await editor.getByRole("button", { name: "high", exact: true }).click();
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await fixture(page, { title: "Teacher essay", description: "Read chapter two" });
  await refresh(page);
  await expect(page.getByRole("button", { name: "Edit My essay", exact: true })).toContainText("Read chapter two");
  await page.getByRole("button", { name: "Edit My essay", exact: true }).click();
  await editor.getByRole("button", { name: "Reset to Classroom values" }).click();
  await expect(editor.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Teacher essay");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit Teacher essay", exact: true }).getByLabel("high priority")).toBeVisible();
  await refresh(page);
  await expect(page.locator(".kb-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Delete Teacher essay", exact: true }).click();
  await refresh(page);
  await expect(page.locator(".kb-card")).toHaveCount(0);
  const settings = await openSettings(page);
  await settings.getByRole("button", { name: "Disconnect Google" }).click();
  await expect(settings.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  await settings.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Biology", exact: true })).toBeVisible();
  await expect(page.locator(".kb-card")).toHaveCount(0);
});

test("timer refresh preserves an open editor, failed courses, and expired authorization", async ({ page }) => {
  await page.clock.install();
  await setup(page);
  await page.getByRole("button", { name: "Edit Essay", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit card" });
  await editor.getByRole("textbox", { name: "Title", exact: true }).fill("My draft");
  await fixture(page, { title: "Teacher revision", description: "New description" });
  await page.clock.fastForward(15 * 60 * 1000);
  await expect(editor.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("My draft");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit My draft", exact: true })).toContainText("New description");
  await fixture(page, { failure: true });
  const settings = await openSettings(page);
  await settings.getByRole("button", { name: "Refresh now" }).click();
  await expect(settings.getByRole("alert")).toContainText("Biology: Access denied");
  expect(await settings.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await settings.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit My draft", exact: true })).toBeVisible();
  await fixture(page, { failure: false, expired: true });
  const again = await openSettings(page);
  await again.getByRole("button", { name: "Refresh now" }).click();
  await expect(again.getByText("Your Google authorization expired. Sign in again to resume refreshes.")).toBeVisible();
  await expect(again.getByRole("button", { name: "Refresh now" })).toBeDisabled();
});
