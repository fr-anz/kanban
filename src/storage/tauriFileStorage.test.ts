import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Board, BoardCollection } from "../domain/types";

vi.mock("@tauri-apps/plugin-fs", () => {
  const store = new Map<string, string>();
  return {
    BaseDirectory: { AppData: "APPDATA" },
    __store: store,
    exists: vi.fn(async (p: string) => store.has(String(p))),
    mkdir: vi.fn(async () => {}),
    readTextFile: vi.fn(async (p: string) => {
      const v = store.get(String(p));
      if (v === undefined) throw new Error(`not found: ${p}`);
      return v;
    }),
    writeTextFile: vi.fn(async (p: string, d: string) => {
      store.set(String(p), d);
    }),
    rename: vi.fn(async (o: string, n: string) => {
      const v = store.get(String(o));
      if (v === undefined) throw new Error(`not found: ${o}`);
      store.delete(String(o));
      store.set(String(n), v);
    }),
  };
});

import { exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import {
  tauriFileBoardCollectionStorage,
  resolveBoardCollectionStorage,
} from "./tauriFileStorage";

const fsMock = (await import("@tauri-apps/plugin-fs")) as unknown as {
  __store: Map<string, string>;
};
const store = fsMock.__store;

const sample: Board = {
  id: "b1",
  title: "My Board",
  columns: [{ id: "c1", title: "To Do", colorIndex: 0, order: 0 }],
  cards: [],
  tags: [],
};

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe("Tauri board collection storage", () => {
  const collection: BoardCollection = { version: 1, boards: [sample], activeBoardId: sample.id };

  it("returns null only when both collection and legacy storage are missing", async () => {
    await expect(tauriFileBoardCollectionStorage().load()).resolves.toBeNull();
    vi.mocked(exists).mockRejectedValueOnce(new Error("denied"));
    await expect(tauriFileBoardCollectionStorage().load()).rejects.toThrow("denied");
  });

  it("migrates the desktop board unchanged without deleting the legacy file", async () => {
    store.set("board.json", JSON.stringify(sample));
    const storage = tauriFileBoardCollectionStorage();
    expect(await storage.load()).toEqual(collection);
    await storage.save(collection);
    expect(await storage.load()).toEqual(collection);
    expect(store.get("board.json")).toBe(JSON.stringify(sample));
    expect(store.has("boards.json.tmp")).toBe(false);
  });

  it("keeps an empty collection instead of importing the legacy board again", async () => {
    store.set("board.json", JSON.stringify(sample));
    const storage = tauriFileBoardCollectionStorage();
    const empty: BoardCollection = { version: 1, boards: [], activeBoardId: null };
    await storage.save(empty);
    expect(await storage.load()).toEqual(empty);
  });

  it("preserves corrupt data and propagates read failures", async () => {
    store.set("boards.json", "invalid");
    await expect(tauriFileBoardCollectionStorage().load()).rejects.toThrow();
    expect(store.get("boards.json")).toBe("invalid");
    vi.mocked(readTextFile).mockRejectedValueOnce(new Error("denied"));
    await expect(tauriFileBoardCollectionStorage().load()).rejects.toThrow("denied");
  });

  it("serializes overlapping writes to the shared temporary file", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.mocked(writeTextFile).mockImplementationOnce(async (path, data) => {
      await gate;
      store.set(String(path), data);
    });
    const storage = tauriFileBoardCollectionStorage();
    const first = storage.save(collection);
    const latest = { ...collection, boards: [{ ...sample, title: "Latest" }] };
    const second = storage.save(latest);
    await Promise.resolve();
    release();
    await Promise.all([first, second]);
    expect(await storage.load()).toEqual(latest);
    expect(store.has("boards.json.tmp")).toBe(false);
  });

  it("can save again after a failed write", async () => {
    const storage = tauriFileBoardCollectionStorage();
    vi.mocked(writeTextFile).mockRejectedValueOnce(new Error("disk full"));
    await expect(storage.save(collection)).rejects.toThrow("disk full");
    await storage.save(collection);
    expect(await storage.load()).toEqual(collection);
  });

  it("resolves browser collection storage outside Tauri", async () => {
    const storage = resolveBoardCollectionStorage();
    await storage.save(collection);
    expect(await storage.load()).toEqual(collection);
  });
});
