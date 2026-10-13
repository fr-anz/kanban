import { useCallback, useEffect, useRef, useState } from "react";
import { applySnapshots, subscribedCourses, type CourseSnapshot } from "../domain/classroom";
import type { BoardCollection } from "../domain/types";
import { toConnectorError, type ClassroomConnector, type ConnectorStatus } from "../connectors/classroomConnector";

export const CLASSROOM_REFRESH_MS = 15 * 60 * 1000;

export function useClassroom(connector: ClassroomConnector | null, collection: BoardCollection | null,
  mutate: (update: (current: BoardCollection) => BoardCollection) => void, busy: boolean) {
  const [status, setStatus] = useState<ConnectorStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState(false);
  const latest = useRef({ collection, busy, status, mutate });
  latest.current = { collection, busy, status, mutate };
  const generation = useRef(0);
  const inFlight = useRef(false);
  const queued = useRef<{ accountId: string; snapshots: CourseSnapshot[]; now: string } | null>(null);

  const updateStatus = useCallback((next: ConnectorStatus) => {
    generation.current += 1;
    queued.current = null;
    setPending(false);
    latest.current.status = next;
    setStatus(next);
  }, []);

  useEffect(() => {
    if (!connector) return;
    let live = true;
    connector.status().then((next) => { if (live) updateStatus(next); })
      .catch((cause) => { if (live) setError(toConnectorError(cause).message); });
    return () => { live = false; generation.current += 1; queued.current = null; };
  }, [connector, updateStatus]);

  const refresh = useCallback(async () => {
    const { status: current, collection: saved } = latest.current;
    if (!connector || !saved || !current?.account || current.authExpired || inFlight.current) return;
    const courseIds = subscribedCourses(saved, current.account.id);
    if (!courseIds.length) return;
    const request = generation.current;
    inFlight.current = true;
    setRefreshing(true);
    setError(null);
    try {
      const result = await connector.fetchCourses(courseIds);
      if (request !== generation.current || result.accountId !== latest.current.status?.account?.id) return;
      const snapshots = result.results.flatMap((item) => item.status === "ok" ? [item.snapshot] : []);
      const errors = result.results.flatMap((item) => item.status === "error"
        ? [`${latest.current.collection?.classroom?.courses[item.courseId]?.name ?? item.courseId}: ${item.error.message}`] : []);
      if (errors.length) setError(errors.join(" "));
      if (!snapshots.length) return;
      const update = { accountId: result.accountId, snapshots, now: new Date().toISOString() };
      if (latest.current.busy) { queued.current = update; setPending(true); }
      else {
        queued.current = null;
        setPending(false);
        latest.current.mutate((value) => applySnapshots(value, update.accountId, snapshots, update.now));
      }
    } catch (cause) {
      if (request !== generation.current) return;
      const failure = toConnectorError(cause);
      setError(failure.message);
      if (failure.code === "auth_expired" && latest.current.status) {
        updateStatus({ ...latest.current.status, authExpired: true });
      }
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, [connector, updateStatus]);

  useEffect(() => {
    if (busy || !queued.current) return;
    const update = queued.current;
    queued.current = null;
    setPending(false);
    mutate((value) => applySnapshots(value, update.accountId, update.snapshots, update.now));
  }, [busy, mutate]);

  const accountId = status?.authExpired ? undefined : status?.account?.id;
  const subscriptions = collection && accountId ? subscribedCourses(collection, accountId).sort().join(",") : "";
  useEffect(() => {
    if (!accountId || !subscriptions) return;
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, CLASSROOM_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [accountId, subscriptions, refresh]);

  const disconnect = async () => {
    if (!connector) return;
    // Discard queued and in-flight results before awaiting native revocation.
    updateStatus({ configured: status?.configured ?? false, clientId: status?.clientId, authExpired: false, signingIn: false });
    const result = await connector.disconnect();
    setError(result.revoked ? null : "Disconnected locally. Google revocation failed; remove Kanban from your Google account permissions if needed.");
  };

  return { status, error, refreshing, pending, refresh, updateStatus, disconnect, setError };
}
