import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]';

/** Focus containment and restoration for our modal dialogs and mobile drawer. */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, enabled: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const previous = document.activeElement as HTMLElement | null;
    const element = ref.current;
    const input = element.querySelector<HTMLInputElement>("input");
    (input ?? element.querySelector<HTMLElement>(FOCUSABLE) ?? element).focus();
    input?.select();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(element.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); element.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !element.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !element.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      if (previous?.isConnected && !previous.closest("[hidden], [inert]")) previous.focus();
      else document.querySelector<HTMLElement>(".kb-sidebar-toggle")?.focus();
    };
  }, [enabled, ref]);
}
