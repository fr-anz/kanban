# Kanban Board

A personal, single-user kanban app — React + TypeScript + Vite, wrapped in a Tauri desktop shell. Multiple local boards, custom columns, cards with deadlines/priorities/tags, drag-and-drop, and local persistence (file-backed in the desktop app, `localStorage` in the browser).

The Graphite interface includes dark and light modes, a custom KB mark, compact cards, and locally bundled Inter fonts. Change appearance at the bottom of the sidebar; the choice persists on this device. Internal card IDs are kept for storage and are not displayed.

## Run it locally

```bash
npm install
```

**Browser (fastest, no Rust needed):**

```bash
npm run dev
```

Open http://localhost:1420.

**Desktop app (Tauri):**

Requires the Rust toolchain (via [rustup](https://rustup.rs/)); on Windows you also need WebView2 (preinstalled on Win10/11).

```bash
npm run tauri dev
```

**Production web preview:**

```bash
npm run build
npm run preview
```

## Useful commands

| Command                          | What it does                              |
| -------------------------------- | ----------------------------------------- |
| `npm test`                       | Run the vitest suite                      |
| `npm run test:e2e`               | Run desktop and mobile browser journeys   |
| `npx tsc --noEmit`               | Typecheck                                 |
| `npm run tauri build`            | Package a desktop installer/bundle        |
| `cd src-tauri && cargo check`    | Verify the native Rust side compiles      |

## Notes

- Create and select boards from the left sidebar. Use the **Boards** button to collapse or reopen it; narrow screens use a drawer. New boards start with To Do, In Progress, and Done and have their own cards and tags.
- Rename or delete a board with its sidebar controls. Deletion requires confirmation and removes the board's contents. Deleting every board leaves an empty workspace with an **Add board** action.
- Boards and the last selection persist in `boards.json` under the app-data directory (`%APPDATA%\com.franz.kanban` on Windows), or under `kanban.boards.v1` in browser `localStorage`. Existing `board.json` / `kanban.board.v1` data is imported automatically the first time; the legacy source is preserved.
- Switching boards discards unfinished input. Changes that have been committed save automatically. Local load/save failures show a retry action. Boards remain local; the optional Classroom connector imports coursework.
- Search cards from the sidebar with **Ctrl/Cmd+K** or **/**. Filter by priority, tag, or column, and switch between Board and List views. Clear filters before dragging; adding a card clears filters so it stays visible.
- Use the card editor to change title, description, deadline, priority, tags, or column. On the board, drag cards or use **Space**, arrow keys, and **Space** to move them with the keyboard; **Escape** cancels. Press **Enter** to edit. Column grip buttons support the same keyboard dragging.
- Narrow screens have a board drawer and previous/next column controls. Animations respect the system's reduced-motion setting.
- `src-tauri/target/` (multi-GB Rust build artifacts) can be reclaimed anytime with `cargo clean` — it rebuilds on the next check/dev/build.

Install the E2E browser once with `npx playwright install chromium`, then run `npm run test:e2e` with port 1420 free. The suite starts its own local server and uses isolated synthetic boards. Screenshots, failure traces, and the HTML report are generated in ignored `test-results/` and `playwright-report/` folders.

## Desktop updates

The desktop app checks for updates when it opens and asks before installing one. You can also use **Check for updates** at the bottom of the sidebar. Browser builds do not check for desktop updates.

Updates are served from the public GitHub Releases of `fr-anz/kanban`. The release workflow in `.github/workflows/release.yml` builds signed updater artifacts and `latest.json` when a `v*` tag is pushed. The repository and its releases must be public so installed apps can download them without a GitHub login.
Release packaging currently targets Windows only. The workflow can also be
dispatched with an existing `release_tag` to rebuild it without moving the tag.

Before publishing a release:

1. Back up `.updater-keys/kanban.key` and `.updater-keys/kanban.password` securely. They are Git-ignored; losing either means installed versions cannot verify new releases.
2. Add the **contents** of those files as GitHub Actions repository secrets named `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, respectively. Never commit or share them. The matching public key is already configured in `src-tauri/tauri.conf.json`.
3. Bump the version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`. Refresh `package-lock.json` if the package version changes.
4. Push a matching version tag such as `v0.2.0`. The workflow publishes the installers, signatures, and `latest.json` to a GitHub Release.

For a local desktop release build, set `TAURI_SIGNING_PRIVATE_KEY` to the path of `.updater-keys/kanban.key` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to the contents of `.updater-keys/kanban.password` in your shell before running `npm run tauri build`. Older installers built before updater support must be replaced manually once; later signed releases can update in-app.

## Google Classroom (desktop beta)

Open **Google Classroom** in the sidebar. This read-only connector imports published
coursework and your own submission status from active courses where you are a student.
Browser builds explain that a desktop app is required.

1. In a Google Cloud project, enable the Google Classroom API and configure the OAuth
   consent screen. If the app is in testing, add your student account as a test user.
   In **Data Access → Add or remove scopes**, select `classroom.courses.readonly`
   and `classroom.student-submissions.me.readonly`, plus `openid` and
   `userinfo.email`. Google returns the student-submissions scope name for the
   documented `classroom.coursework.me.readonly` permission requested by Kanban;
   the console may show only that returned name. Editing scopes are unnecessary.
2. Create an OAuth client with application type **Desktop app**, download its JSON,
   and import it in Kanban. Web application client files are rejected.
3. Sign in through your system browser and approve the requested read-only course and
   coursework permissions, plus account identity/email. School policy may block access.
4. Select courses and save. Each selected course gets a local board. Refreshes run at
   startup, every fifteen minutes, or with **Refresh now**. Updates wait while you edit
   or drag. Deselecting a course stops refreshes and preserves its board.

Imported cards show their Classroom source, submission state, late/unavailable status,
and exact deadlines in local time. **Open in Classroom** opens the original work.
Changes to title, description, and deadline override remote values; **Reset to Classroom
values** restores those fields when you save. Columns, ordering, priority, tags, notes,
and subtasks stay local. Coursework marked **Turned in** automatically moves to the
course board's **Done** column on import and refresh, including existing imports.
If that column was removed, the cards keep their current placement. Deleted imported
cards stay suppressed on future refreshes;
deleting a course board unsubscribes it. Missing remote work is kept as unavailable.

Tokens and OAuth client configuration use the OS credential store (Windows Credential
Manager, macOS Keychain, or Linux Secret Service); access tokens stay in native memory.
There is no plaintext credential fallback. **Disconnect Google** clears local tokens
and attempts revocation, preserving your boards and OAuth client for reconnecting.
Expired/revoked authorization requires signing in again. Transient failures are retried
with bounded backoff; a failed course leaves its existing cards unchanged.

API field semantics and setup: [Classroom coursework](https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork),
[Google desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app).
Live Google consent and import have been verified on Windows, alongside mocked
API/application tests. `v0.4.0-beta.1` is published as a normal **Latest** GitHub
release so v0.3.0's **Check for updates** can find it. Its version still identifies
it as a beta. Other prereleases require manual download unless the updater channel
is changed.
