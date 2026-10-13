import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { CLASSROOM_REFRESH_MS, useClassroom } from "./useClassroom";
import { setSubscriptions } from "../domain/classroom";
import type { BoardCollection } from "../domain/types";
import type { ClassroomConnector, FetchResult } from "../connectors/classroomConnector";

const status = { configured: true, account: { id: "a", email: "student@example.test" }, authExpired: false, signingIn: false };
const initial = () => setSubscriptions({ version: 1, boards: [], activeBoardId: null }, "a", [{ id: "c", name: "Biology" }], new Set(["c"]));
const fetched = (title = "Essay"): FetchResult => ({ accountId: "a", results: [{ status: "ok", snapshot: {
  courseId: "c", courseWork: [{ id: "w", title }], submissions: [],
} }] });
function adapter(): ClassroomConnector {
  return { status: vi.fn(async () => status), configure: vi.fn(async () => status), connect: vi.fn(async () => status),
    cancelConnect: vi.fn(async () => {}), listCourses: vi.fn(async () => []), fetchCourses: vi.fn(async () => fetched()),
    disconnect: vi.fn(async () => ({ revoked: true })) };
}
function mount(connector: ClassroomConnector, busy = false) {
  return renderHook(({ busy }) => {
    const [collection, setCollection] = useState<BoardCollection>(initial);
    const classroom = useClassroom(connector, collection, setCollection, busy);
    return { collection, setCollection, classroom };
  }, { initialProps: { busy } });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
afterEach(() => vi.useRealTimers());

describe("Classroom refresh", () => {
  it("imports at startup and refreshes every fifteen minutes without duplicating cards", async () => {
    const connector = adapter();
    const { result } = mount(connector);
    await waitFor(() => expect(result.current.collection.boards[0].cards).toHaveLength(1));
    vi.useFakeTimers();
    // Reconnect to install an interval under fake timers.
    act(() => result.current.classroom.updateStatus({ ...status, authExpired: true }));
    act(() => result.current.classroom.updateStatus(status));
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(CLASSROOM_REFRESH_MS); });
    expect(connector.fetchCourses).toHaveBeenCalledTimes(3);
    expect(result.current.collection.boards[0].cards).toHaveLength(1);
  });

  it("defers fetched updates during editing/dragging and merges into the latest state", async () => {
    const connector = adapter();
    const gate = deferred<FetchResult>();
    vi.mocked(connector.fetchCourses).mockReturnValueOnce(gate.promise);
    const { result, rerender } = mount(connector, true);
    await waitFor(() => expect(connector.fetchCourses).toHaveBeenCalledOnce());
    await act(async () => gate.resolve(fetched()));
    expect(result.current.classroom.pending).toBe(true);
    expect(result.current.collection.boards[0].cards).toHaveLength(0);
    act(() => result.current.setCollection((value) => ({ ...value, boards: value.boards.map((board) => ({ ...board, title: "My course" })) })));
    rerender({ busy: false });
    expect(result.current.collection.boards[0].cards[0].title).toBe("Essay");
    expect(result.current.collection.boards[0].title).toBe("My course");
  });

  it("discards an in-flight or deferred result when disconnected", async () => {
    const connector = adapter();
    const gate = deferred<FetchResult>();
    vi.mocked(connector.fetchCourses).mockReturnValueOnce(gate.promise);
    const { result, rerender } = mount(connector, true);
    await waitFor(() => expect(connector.fetchCourses).toHaveBeenCalledOnce());
    await act(async () => result.current.classroom.disconnect());
    await act(async () => gate.resolve(fetched()));
    rerender({ busy: false });
    expect(result.current.collection.boards[0].cards).toHaveLength(0);
    expect(result.current.classroom.status?.account).toBeUndefined();
  });

  it("applies successful courses while keeping data for a failed course", async () => {
    const connector = adapter();
    const { result } = mount(connector);
    await waitFor(() => expect(result.current.collection.boards[0].cards).toHaveLength(1));
    vi.mocked(connector.fetchCourses).mockResolvedValueOnce({ accountId: "a", results: [{ status: "error", courseId: "c", error: { code: "api", message: "Access denied" } }] });
    await act(async () => result.current.classroom.refresh());
    expect(result.current.collection.boards[0].cards[0].source?.unavailable).toBeUndefined();
    expect(result.current.classroom.error).toBe("Biology: Access denied");
  });

  it("stops refreshing expired authorization until reconnected", async () => {
    const connector = adapter();
    vi.mocked(connector.fetchCourses).mockRejectedValueOnce({ code: "auth_expired", message: "Reconnect" });
    const { result } = mount(connector);
    await waitFor(() => expect(result.current.classroom.status?.authExpired).toBe(true));
    await act(async () => result.current.classroom.refresh());
    expect(connector.fetchCourses).toHaveBeenCalledOnce();
    act(() => result.current.classroom.updateStatus(status));
    await waitFor(() => expect(result.current.collection.boards[0].cards).toHaveLength(1));
  });

  it("does not overlap requests and ignores results after a board is deleted", async () => {
    const connector = adapter();
    const gate = deferred<FetchResult>();
    vi.mocked(connector.fetchCourses).mockReturnValueOnce(gate.promise);
    const { result } = mount(connector);
    await waitFor(() => expect(connector.fetchCourses).toHaveBeenCalledOnce());
    await act(async () => result.current.classroom.refresh());
    act(() => result.current.setCollection((value) => ({ ...value, boards: [] })));
    await act(async () => gate.resolve(fetched()));
    expect(connector.fetchCourses).toHaveBeenCalledOnce();
    expect(result.current.collection.boards).toHaveLength(0);
  });
});
