import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Board } from "../domain/types";

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

import { exists, mkdir, writeTextFile } from "@tauri-apps/plugin-fs";
import {
  resolveBoardStorage,
  tauriFileBoardStorage,
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

describe("tauriFileBoardStorage", () => {
  it("load() returns null when the file does not exist", async () => {
    await expect(tauriFileBoardStorage().load()).resolves.toBeNull();
  });

  it("round-trips the full board via save/load", async () => {
    const s = tauriFileBoardStorage();
    await s.save(sample);
    await expect(s.load()).resolves.toEqual(sample);
  });

  it("writes atomically: tmp file renamed, no leftover", async () => {
    const s = tauriFileBoardStorage();
    await s.save(sample);
    await s.save({ ...sample, title: "v2" });
    expect(store.has("board.json.tmp")).toBe(false);
    expect(store.get("board.json")).toContain('"title":"v2"');
  });

  it("corrupt JSON returns null instead of throwing", async () => {
    await writeTextFile("board.json", "not-json{{{");
    await expect(tauriFileBoardStorage().load()).resolves.toBeNull();
  });

  it("save() ensures the app-data dir exists", async () => {
    await tauriFileBoardStorage().save(sample);
    expect(mkdir).toHaveBeenCalled();
  });

  it("load() returns null when the backend throws", async () => {
    vi.mocked(exists).mockRejectedValueOnce(new Error("denied"));
    await expect(tauriFileBoardStorage().load()).resolves.toBeNull();
  });
});

describe("resolveBoardStorage", () => {
  it("falls back to localStorage outside Tauri", async () => {
    const s = resolveBoardStorage();
    await s.save(sample);
    await expect(s.load()).resolves.toEqual(sample);
  });
});
