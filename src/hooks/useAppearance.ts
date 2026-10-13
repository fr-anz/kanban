import { useEffect, useState } from "react";

export const APPEARANCE_KEY = "kanban.appearance.v1";
export type Appearance = "light" | "dark";

export function useAppearance() {
  const [appearance, setAppearance] = useState<Appearance>(() => {
    try { return localStorage.getItem(APPEARANCE_KEY) === "light" ? "light" : "dark"; }
    catch { return "dark"; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = appearance;
    try { localStorage.setItem(APPEARANCE_KEY, appearance); } catch { /* Keep the selected theme for this session. */ }
  }, [appearance]);
  return { appearance, toggleAppearance: () => setAppearance((mode) => mode === "dark" ? "light" : "dark") };
}
