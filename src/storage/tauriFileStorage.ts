import {
  BaseDirectory,
  exists,
  mkdir,
  readTextFile,
  rename,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import {
  localStorageBoardStorage,
  parseBoard,
  serializeBoard,
  type BoardStorage,
} from "./boardStorage";

/** File name inside the app-specific data directory. */
export const BOARD_FILE_NAME = "board.json";
const TMP_SUFFIX = ".tmp";

export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return "__TAURI_INTERNALS__" in w || "__TAURI__" in w;
}

/**
 * BoardStorage backed by `board.json` in the app-specific data directory
 * (BaseDirectory.AppData — NOT the project/install dir).
 *
 * Writes are atomic-ish: payload goes to `board.json.tmp`, then is renamed
 * over `board.json`, so an interrupted write leaves the previous board
 * intact instead of a half-written file.
 */
export function tauriFileBoardStorage(
  fileName: string = BOARD_FILE_NAME,
): BoardStorage {
  const tmpName = `${fileName}${TMP_SUFFIX}`;
  return {
    load: async () => {
      try {
        if (!(await exists(fileName, { baseDir: BaseDirectory.AppData })))
          return null;
        const raw = await readTextFile(fileName, {
          baseDir: BaseDirectory.AppData,
        });
        return parseBoard(raw);
      } catch {
        // Missing file, denied access, corrupt JSON → defaults.
        return null;
      }
    },
    save: async (board) => {
      // App-specific dirs must be created at runtime (fs plugin docs).
      try {
        await mkdir(".", { baseDir: BaseDirectory.AppData, recursive: true });
      } catch {
        // Already exists — continue to the write.
      }
      await writeTextFile(tmpName, serializeBoard(board), {
        baseDir: BaseDirectory.AppData,
      });
      await rename(tmpName, fileName, {
        oldPathBaseDir: BaseDirectory.AppData,
        newPathBaseDir: BaseDirectory.AppData,
      });
    },
  };
}

/** Tauri file backend inside the app, localStorage in browser/tests. */
export function resolveBoardStorage(): BoardStorage {
  return isTauriRuntime()
    ? tauriFileBoardStorage()
    : localStorageBoardStorage();
}
