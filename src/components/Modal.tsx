import { useId, useRef, type ReactNode } from "react";
import { useDialogFocus } from "./useDialogFocus";

export default function Modal({ title, onClose, children, sheet = false, testId, open = true }: {
  title: string; onClose: () => void; children: ReactNode; sheet?: boolean; testId?: string; open?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocus(ref, open, onClose);
  return <div className={`kb-overlay${sheet ? " kb-sheet-overlay" : ""}`} onClick={onClose} data-testid={testId} hidden={!open}>
    <div className={`kb-modal${sheet ? " kb-sheet" : ""}`} ref={ref} role="dialog" aria-modal="true"
      aria-labelledby={titleId} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
      <h2 id={titleId}>{title}</h2>{children}
    </div>
  </div>;
}
