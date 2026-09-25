# Kanban Board

A personal, single-user kanban board — React + TypeScript + Vite, wrapped in a Tauri desktop shell. Custom columns, cards with deadlines/priorities/tags, drag-and-drop, and local persistence (file-backed in the desktop app, `localStorage` in the browser).

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
| `npx tsc --noEmit`               | Typecheck                                 |
| `npm run tauri build`            | Package a desktop installer/bundle        |
| `cd src-tauri && cargo check`    | Verify the native Rust side compiles      |

## Notes

- Board data persists in `board.json` under the app-data directory (`%APPDATA%\com.franz.kanban` on Windows) when running as a desktop app, and in `localStorage` when running in a browser.
- `src-tauri/target/` (multi-GB Rust build artifacts) can be reclaimed anytime with `cargo clean` — it rebuilds on the next check/dev/build.

## Desktop updates

The desktop app checks for updates when it opens and asks before installing one. You can also use **Check for updates** in the header. Browser builds do not check for desktop updates.

Updates are served from the public GitHub Releases of `fr-anz/kanban`. The release workflow in `.github/workflows/release.yml` builds signed updater artifacts and `latest.json` when a `v*` tag is pushed. The repository and its releases must be public so installed apps can download them without a GitHub login.

Before publishing a release:

1. Back up `.updater-keys/kanban.key` and `.updater-keys/kanban.password` securely. They are Git-ignored; losing either means installed versions cannot verify new releases.
2. Add the **contents** of those files as GitHub Actions repository secrets named `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, respectively. Never commit or share them. The matching public key is already configured in `src-tauri/tauri.conf.json`.
3. Bump the version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`. Refresh `package-lock.json` if the package version changes.
4. Push a matching version tag such as `v0.2.0`. The workflow publishes the installers, signatures, and `latest.json` to a GitHub Release.

For a local desktop release build, set `TAURI_SIGNING_PRIVATE_KEY` to the path of `.updater-keys/kanban.key` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to the contents of `.updater-keys/kanban.password` in your shell before running `npm run tauri build`. Older installers built before updater support must be replaced manually once; later signed releases can update in-app.
