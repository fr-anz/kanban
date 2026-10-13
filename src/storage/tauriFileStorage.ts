import {
  BaseDirectory,
  exists,
  mkdir,
  readTextFile,
  rename,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { parseBoard } from "./boardStorage";
import {
  localStorageBoardCollectionStorage,
  parseBoardCollection,
  type BoardCollectionStorage,
} from "./boardCollectionStorage";

/** File name inside the app-specific data directory. */
export const BOARD_FILE_NAME = "board.json";
export const BOARDS_FILE_NAME = "boards.json";
const TMP_SUFFIX = ".tmp";

export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return "__TAURI_INTERNALS__" in w || "__TAURI__" in w;
}

/** App-data collection backend. Serialize writes to the shared temporary file. */
export function tauriFileBoardCollectionStorage(): BoardCollectionStorage {
  let writes: Promise<void> = Promise.resolve();
  return {
    load: async () => {
      if (await exists(BOARDS_FILE_NAME, { baseDir: BaseDirectory.AppData })) {
        return parseBoardCollection(await readTextFile(BOARDS_FILE_NAME, {
          baseDir: BaseDirectory.AppData,
        }));
      }
      if (!(await exists(BOARD_FILE_NAME, { baseDir: BaseDirectory.AppData }))) return null;
      const legacy = parseBoard(await readTextFile(BOARD_FILE_NAME, {
        baseDir: BaseDirectory.AppData,
      }));
      return legacy ? { version: 1, boards: [legacy], activeBoardId: legacy.id } : null;
    },
    save: (collection) => {
      const payload = JSON.stringify(collection);
      const write = writes.catch(() => {}).then(async () => {
        await mkdir(".", { baseDir: BaseDirectory.AppData, recursive: true });
        await writeTextFile(`${BOARDS_FILE_NAME}${TMP_SUFFIX}`, payload, {
          baseDir: BaseDirectory.AppData,
        });
        await rename(`${BOARDS_FILE_NAME}${TMP_SUFFIX}`, BOARDS_FILE_NAME, {
          oldPathBaseDir: BaseDirectory.AppData,
          newPathBaseDir: BaseDirectory.AppData,
        });
      });
      writes = write;
      return write;
    },
  };
}

export function resolveBoardCollectionStorage(): BoardCollectionStorage {
  return isTauriRuntime()
    ? tauriFileBoardCollectionStorage()
    : localStorageBoardCollectionStorage();
}
