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
