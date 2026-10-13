import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { ClassroomConnector } from "../connectors/classroomConnector";
import { toConnectorError } from "../connectors/classroomConnector";
import { setSubscriptions, type Course } from "../domain/classroom";
import type { BoardCollection } from "../domain/types";
import type { useClassroom } from "../hooks/useClassroom";
import Modal from "./Modal";

export default function ClassroomDialog({ connector, classroom, collection, mutate, onClose }: {
  connector: ClassroomConnector | null; classroom: ReturnType<typeof useClassroom>; collection: BoardCollection;
  mutate: (update: (value: BoardCollection) => BoardCollection) => void; onClose: () => void;
}) {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(collection.classroom?.accountId === classroom.status?.account?.id
    ? Object.entries(collection.classroom?.courses ?? {}).filter(([, link]) => link.subscribed).map(([id]) => id) : []));
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);
  const accountId = classroom.status?.account?.id;
  const expired = classroom.status?.authExpired;
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  useEffect(() => {
    setCourses(null);
    if (!connector || !accountId || expired) return;
    let active = true;
    setWorking("Loading courses");
    connector.listCourses().then((items) => { if (active) setCourses(items); })
      .catch((cause) => { if (active) setError(toConnectorError(cause).message); })
      .finally(() => { if (active) setWorking(null); });
    return () => { active = false; };
  }, [connector, accountId, expired]);

  const run = async (label: string, action: () => Promise<unknown>) => {
    setWorking(label); setError(null);
    try { await action(); }
    catch (cause) { if (live.current) setError(toConnectorError(cause).message); }
    finally { if (live.current) setWorking(null); }
  };
  const importClient = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !connector) return;
    void run("Importing client", async () => {
      if (file.size > 64 * 1024) throw new Error("Choose a Desktop app OAuth JSON file smaller than 64 KB.");
      classroom.updateStatus(await connector.configure(await file.text()));
    });
  };
  const close = () => {
    if (working === "Signing in") void connector?.cancelConnect().catch(() => {});
    onClose();
  };

  return <Modal title="Google Classroom" onClose={close}>
    <p className="kb-muted">Import coursework into a local board for each course. Kanban reads Classroom; your edits stay on this device.</p>
    {!connector ? <p role="status">Google Classroom is available in the desktop app.</p> : <>
      <div className="kb-field">
        <span>Desktop app OAuth client</span>
        <p className="kb-muted">Enable the Classroom API in your Google Cloud project, create a Desktop app OAuth client, and import its downloaded JSON file.</p>
        <input type="file" accept=".json,application/json" aria-label="Import OAuth client JSON" onChange={importClient} disabled={!!working} />
        {classroom.status?.configured && <p className="kb-muted">Client configured</p>}
      </div>
      {classroom.status?.authExpired && <p role="alert">Your Google authorization expired. Sign in again to resume refreshes.</p>}
      {accountId && <p>Connected as {classroom.status?.account?.email}</p>}
      {(!accountId || expired) && <button className="kb-btn primary" disabled={!classroom.status?.configured || !!working}
        onClick={() => void run("Signing in", async () => {
          const next = await connector.connect();
          if (live.current) {
            setSelected(new Set(collection.classroom?.accountId === next.account?.id
              ? Object.entries(collection.classroom?.courses ?? {}).filter(([, link]) => link.subscribed).map(([id]) => id) : []));
            classroom.updateStatus(next);
          }
        })}>Sign in with Google</button>}
      {working === "Signing in" && <button className="kb-btn" onClick={() => void run("Cancelling sign-in", () => connector.cancelConnect())}>Cancel sign-in</button>}
      {working && <p role="status">{working}…</p>}
      {courses && <fieldset className="kb-classroom-courses" disabled={!!working}>
        <legend>Courses to import</legend>
        {courses.length === 0 && <p>No active student courses were found.</p>}
        {courses.map((course) => <label key={course.id}>
          <input type="checkbox" checked={selected.has(course.id)} onChange={(event) => setSelected((current) => {
            const next = new Set(current); if (event.target.checked) next.add(course.id); else next.delete(course.id); return next;
          })} /><span>{course.name}{course.section ? ` · ${course.section}` : ""}</span>
        </label>)}
        <button className="kb-btn primary" onClick={() => {
          if (!accountId) return;
          mutate((value) => setSubscriptions(value, accountId, courses, selected));
          onClose();
        }}>Save course selection</button>
      </fieldset>}
      {accountId && <div className="kb-modal-actions">
        <button className="kb-btn" disabled={!!working || classroom.refreshing || !!expired} onClick={() => void classroom.refresh()}>Refresh now</button>
        <button className="kb-btn danger" disabled={!!working} onClick={() => void run("Disconnecting", classroom.disconnect)}>Disconnect Google</button>
      </div>}
      {classroom.refreshing && <p role="status">Refreshing coursework…</p>}
      {classroom.pending && <p role="status">Coursework is ready. Close this dialog to apply it.</p>}
      {collection.classroom?.lastRefreshAt && <p className="kb-muted">Last refreshed: {new Date(collection.classroom.lastRefreshAt).toLocaleString()}</p>}
    </>}
    {(error || classroom.error) && <p role="alert">{error || classroom.error}</p>}
    <div className="kb-modal-actions"><button className="kb-btn" onClick={close}>Close</button></div>
  </Modal>;
}
