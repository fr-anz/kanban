import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

type Status =
  | { kind: "idle" | "checking" | "upToDate" }
  | { kind: "available"; version: string; notes?: string }
  | { kind: "installing"; percent: number | null }
  | { kind: "error"; message: string };

export default function DesktopUpdater() {
  const desktop = isTauri();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [open, setOpen] = useState(false);
  const pendingUpdate = useRef<Update | null>(null);
  const checkId = useRef(0);

  const checkForUpdates = async (manual: boolean) => {
    const id = ++checkId.current;
    if (manual) setOpen(true);
    setStatus({ kind: "checking" });
    try {
      const found = await check({ timeout: 15_000 });
      if (id !== checkId.current) {
        await found?.close();
        return;
      }
      await pendingUpdate.current?.close();
      pendingUpdate.current = found;
      if (found) {
        setStatus({ kind: "available", version: found.version, notes: found.body });
        setOpen(true);
      } else {
        setStatus({ kind: manual ? "upToDate" : "idle" });
      }
    } catch (error) {
      if (id !== checkId.current) return;
      console.error("Could not check for updates", error);
      setStatus(
        manual
          ? { kind: "error", message: "Could not check for updates. Please try again later." }
          : { kind: "idle" },
      );
    }
  };

  useEffect(() => {
    if (desktop) void checkForUpdates(false);
    return () => {
      checkId.current += 1;
      const update = pendingUpdate.current;
      pendingUpdate.current = null;
      if (update) void update.close();
    };
    // Run once when the desktop window starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop]);

  const install = async () => {
    const update = pendingUpdate.current;
    if (!update) return;
    setStatus({ kind: "installing", percent: null });
    let downloaded = 0;
    let total: number | undefined;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength;
        if (event.event === "Progress") downloaded += event.data.chunkLength;
        if (event.event === "Finished") setStatus({ kind: "installing", percent: 100 });
        else if (total) {
          setStatus({ kind: "installing", percent: Math.min(100, Math.round(downloaded / total * 100)) });
        }
      });
      await update.close();
      pendingUpdate.current = null;
      // Windows exits during installation; macOS and Linux need this restart.
      await relaunch();
    } catch (error) {
      console.error("Could not install update", error);
      setStatus({ kind: "error", message: "Could not install the update. Please check your connection and try again." });
    }
  };

  if (!desktop) return null;

  const busy = status.kind === "checking" || status.kind === "installing";
  const close = () => {
    if (!busy) setOpen(false);
  };

  return (
    <>
      <button
        className="kb-btn"
        onClick={() => {
          if (status.kind === "available") setOpen(true);
          else void checkForUpdates(true);
        }}
        disabled={busy}
      >
        {status.kind === "available" ? `Update ${status.version}` :
          status.kind === "installing" ? "Installing update…" :
            status.kind === "checking" ? "Checking updates…" : "Check for updates"}
      </button>
      {open && createPortal(
        <div className="kb-overlay" onClick={close}>
          <div
            className="kb-modal kb-update-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kb-update-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="kb-update-title">
              {status.kind === "available" ? `Kanban ${status.version} is ready` :
                status.kind === "installing" ? "Installing update" : "App updates"}
            </h2>
            {status.kind === "checking" && <p className="kb-muted">Checking for a newer version…</p>}
            {status.kind === "upToDate" && <p className="kb-muted">You’re up to date.</p>}
            {status.kind === "available" && (
              <>
                <p className="kb-muted">A new version is available. Install it when you’re ready; your board stays saved locally.</p>
                {status.notes && <p className="kb-update-notes">{status.notes}</p>}
              </>
            )}
            {status.kind === "installing" && (
              <>
                <p className="kb-muted">Downloading and installing the signed update…</p>
                <div className="kb-update-track" role="progressbar" aria-label="Update download" aria-valuenow={status.percent ?? undefined} aria-valuemin={0} aria-valuemax={100}>
                  <div className="kb-update-fill" style={{ width: `${status.percent ?? 0}%` }} />
                </div>
                {status.percent !== null && <span className="kb-muted">{status.percent}%</span>}
              </>
            )}
            {status.kind === "error" && <p className="kb-muted" role="alert">{status.message}</p>}
            <div className="kb-modal-actions">
              {status.kind === "available" && (
                <button className="kb-btn primary" onClick={() => void install()}>Update now</button>
              )}
              {status.kind === "error" && (
                <button className="kb-btn primary" onClick={() => void checkForUpdates(true)}>Try again</button>
              )}
              {!busy && <button className="kb-btn" onClick={close}>{status.kind === "available" ? "Later" : "Close"}</button>}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
