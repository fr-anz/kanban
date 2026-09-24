export type Priority = "low" | "medium" | "high";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Tag {
  id: string;
  name: string;
  /** index into TAG_SWATCHES */
  colorIndex: number;
}

export interface Card {
  id: string;
  columnId: string;
  title: string;
  description: string;
  /** ISO date (yyyy-mm-dd) or undefined */
  deadline?: string;
  priority: Priority;
  tagIds: string[];
  subtasks: Subtask[];
  createdAt: string;
  updatedAt: string;
  /** optional freeform notes (future flow step) */
  notes?: string;
  order: number;
}

export interface Column {
  id: string;
  title: string;
  /** index into COLUMN_PRESETS */
  colorIndex: number;
  order: number;
}

export interface Board {
  id: string;
  title: string;
  columns: Column[];
  cards: Card[];
  tags: Tag[];
}

export const COLUMN_PRESETS = [
  { name: "lavender", field: "#e8e0f8", header: "#c9b8f0", accent: "#6d4fc2" },
  { name: "blue", field: "#d6eaff", header: "#a8cff5", accent: "#2563a8" },
  { name: "peach", field: "#fde8cf", header: "#f5c897", accent: "#b94a28" },
  { name: "mint", field: "#d4f5e2", header: "#9fe4bf", accent: "#1a7a4a" },
  { name: "rose", field: "#fce7f3", header: "#f9a8d4", accent: "#9d174d" },
  { name: "amber", field: "#fef3c7", header: "#fcd34d", accent: "#92400e" },
] as const;

export const TAG_SWATCHES = [
  { bg: "#e0d4f8", text: "#6d4fc2" },
  { bg: "#cde6ff", text: "#2563a8" },
  { bg: "#fde0d6", text: "#b94a28" },
  { bg: "#d4f5e2", text: "#1a7a4a" },
  { bg: "#fef3c7", text: "#92400e" },
  { bg: "#fce7f3", text: "#9d174d" },
  { bg: "#e0f2fe", text: "#0369a1" },
  { bg: "#f3f4f6", text: "#374151" },
] as const;

export function nextPresetIndex(currentCount: number): number {
  return currentCount % COLUMN_PRESETS.length;
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
