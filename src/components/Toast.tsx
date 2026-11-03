import { useEffect } from "react";

export type ToastTone = "ok" | "info" | "warn";

export type ToastItem = {
  id: string;
  title: string;
  detail?: string;
  tone: ToastTone;
};

type Props = {
  toast: ToastItem | null;
  onDismiss: () => void;
};

export function Toast({ toast, onDismiss }: Props) {
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(onDismiss, 3200);
    return () => window.clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div className={`toast toast-${toast.tone}`} role="status" aria-live="polite">
      <div>
        <strong>{toast.title}</strong>
        {toast.detail ? <p>{toast.detail}</p> : null}
      </div>
      <button type="button" className="toast-x" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
