import { Check, Info, TriangleAlert, X } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';

const ICONS = {
  info: Info,
  success: Check,
  error: TriangleAlert,
} as const;

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="toasts">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.kind];
        return (
          <div key={toast.id} className={`toast toast--${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
            <Icon size={12} strokeWidth={1.5} />
            <span>{toast.message}</span>
            <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss message" style={{ marginLeft: 4, display: 'flex', color: 'var(--text-faint)' }}>
              <X size={11} strokeWidth={1.5} />
            </button>
          </div>
        );
      })}
    </div>
  );
}