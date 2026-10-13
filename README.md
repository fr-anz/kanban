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
- Switching boards discards unfinished input. Changes that have been committed save automatically. Local load/save failures show a retry action; no accounts, cloud storage, or sync are involved.
- Search cards from the sidebar with **Ctrl/Cmd+K** or **/**. Filter by priority, tag, or column, and switch between Board and List views. Clear filters before dragging; adding a card clears filters so it stays visible.
- Use the card editor to change title, description, deadline, priority, tags, or column. On the board, drag cards or use **Space**, arrow keys, and **Space** to move them with the keyboard; **Escape** cancels. Press **Enter** to edit. Column grip buttons support the same keyboard dragging.
- Narrow screens have a board drawer and previous/next column controls. Animations respect the system's reduced-motion setting.
- `src-tauri/target/` (multi-GB Rust build artifacts) can be reclaimed anytime with `cargo clean` — it rebuilds on the next check/dev/build.

Install the E2E browser once with `npx playwright install chromium`, then run `npm run test:e2e` with port 1420 free. The suite starts its own local server and uses isolated synthetic boards. Screenshots, failure traces, and the HTML report are generated in ignored `test-results/` and `playwright-report/` folders.

## Desktop updates

The desktop app checks for updates when it opens and asks before installing one. You can also use **Check for updates** at the bottom of the sidebar. Browser builds do not check for desktop updates.

Updates are served from the public GitHub Releases of `fr-anz/kanban`. The release workflow in `.github/workflows/release.yml` builds signed updater artifacts and `latest.json` when a `v*` tag is pushed. The repository and its releases must be public so installed apps can download them without a GitHub login.

Before publishing a release:

1. Back up `.updater-keys/kanban.key` and `.updater-keys/kanban.password` securely. They are Git-ignored; losing either means installed versions cannot verify new releases.
2. Add the **contents** of those files as GitHub Actions repository secrets named `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, respectively. Never commit or share them. The matching public key is already configured in `src-tauri/tauri.conf.json`.
3. Bump the version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`. Refresh `package-lock.json` if the package version changes.
4. Push a matching version tag such as `v0.2.0`. The workflow publishes the installers, signatures, and `latest.json` to a GitHub Release.

For a local desktop release build, set `TAURI_SIGNING_PRIVATE_KEY` to the path of `.updater-keys/kanban.key` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to the contents of `.updater-keys/kanban.password` in your shell before running `npm run tauri build`. Older installers built before updater support must be replaced manually once; later signed releases can update in-app.
