import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true, the confirm button uses the danger style and gets initial focus. */
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Lightweight modal. No portal, just a fixed overlay — that's enough for our
 * single-window app and keeps focus management trivial.
 *
 * Keyboard:
 *   - Esc cancels
 *   - Enter confirms (the confirm button has focus on open)
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus the confirm button on open + lock body scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    confirmRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc-to-cancel
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="dlg-backdrop" onClick={onCancel}>
      <div
        className="dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dlg-title" className="dlg-title">
          {title}
        </h2>
        <div className="dlg-message">{message}</div>
        <div className="dlg-actions">
          <button className="btn" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            className={`btn ${destructive ? 'danger' : 'primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>

      <style>{`
        .dlg-backdrop {
          position: fixed; inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex; align-items: center; justify-content: center;
          z-index: 100;
          padding: 24px;
          animation: dlg-fade 120ms ease-out;
        }
        .dlg {
          background: var(--bg-panel);
          border: 1px solid var(--border-strong);
          border-radius: 8px;
          padding: 22px 24px 18px;
          max-width: 420px; width: 100%;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
          animation: dlg-pop 140ms ease-out;
        }
        .dlg-title {
          font-size: 15px; font-weight: 500;
          color: var(--text);
          letter-spacing: -0.005em;
          margin-bottom: 10px;
        }
        .dlg-message {
          font-size: 13px; color: var(--text-2);
          line-height: 1.6;
          margin-bottom: 20px;
        }
        .dlg-message em {
          font-style: normal; color: var(--text);
          font-weight: 500;
        }
        .dlg-actions {
          display: flex; gap: 8px; justify-content: flex-end;
        }
        .btn.danger {
          background: var(--danger);
          color: #1a0a0a;
          border-color: var(--danger);
          font-weight: 500;
        }
        .btn.danger:hover {
          background: #e08585;
          border-color: #e08585;
        }
        .btn.danger:focus-visible {
          outline: 2px solid var(--danger);
          outline-offset: 2px;
        }
        @keyframes dlg-fade {
          from { opacity: 0; } to { opacity: 1; }
        }
        @keyframes dlg-pop {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}