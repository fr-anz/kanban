/**
 * Typed boundary to the native Classroom connector. Authentication, tokens,
 * and network access live in Rust; this side only ever sees course data.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Course, CourseSnapshot } from "../domain/classroom";

export interface ConnectorAccount { id: string; email: string }

export interface ConnectorStatus {
  configured: boolean;
  clientId?: string;
  account?: ConnectorAccount;
  authExpired: boolean;
  signingIn: boolean;
}

export interface ConnectorError { code: string; message: string }

export type CourseResult =
  | { status: "ok"; snapshot: CourseSnapshot }
  | { status: "error"; courseId: string; error: ConnectorError };

export interface FetchResult { accountId: string; results: CourseResult[] }

export interface ClassroomConnector {
  status(): Promise<ConnectorStatus>;
  configure(clientJson: string): Promise<ConnectorStatus>;
  connect(): Promise<ConnectorStatus>;
  cancelConnect(): Promise<void>;
  listCourses(): Promise<Course[]>;
  fetchCourses(courseIds: string[]): Promise<FetchResult>;
  disconnect(): Promise<{ revoked: boolean }>;
}

export function toConnectorError(error: unknown): ConnectorError {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return { code: "code" in error && typeof error.code === "string" ? error.code : "unknown", message: error.message };
  }
  return { code: "unknown", message: typeof error === "string" ? error : "Something went wrong." };
}

export function tauriConnector(): ClassroomConnector {
  return {
    status: () => invoke("classroom_status"),
    configure: (clientJson) => invoke("classroom_configure", { clientJson }),
    connect: () => invoke("classroom_connect"),
    cancelConnect: () => invoke("classroom_cancel_connect"),
    listCourses: () => invoke("classroom_list_courses"),
    fetchCourses: (courseIds) => invoke("classroom_fetch_courses", { courseIds }),
    disconnect: () => invoke("classroom_disconnect"),
  };
}

declare global {
  interface Window {
    /** Test-only adapter injected by Playwright before the app loads. */
    __KANBAN_CLASSROOM_CONNECTOR__?: ClassroomConnector;
  }
}

/** Native connector on desktop, an injected adapter in dev/test builds, otherwise none. */
export function resolveConnector(): ClassroomConnector | null {
  // Production builds ignore the injection hook so page script cannot replace the connector.
  if (import.meta.env.DEV && typeof window !== "undefined" && window.__KANBAN_CLASSROOM_CONNECTOR__) {
    return window.__KANBAN_CLASSROOM_CONNECTOR__;
  }
  return isTauri() ? tauriConnector() : null;
}
