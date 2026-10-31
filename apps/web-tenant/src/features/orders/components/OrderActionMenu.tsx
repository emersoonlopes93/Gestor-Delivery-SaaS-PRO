import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import type { OrderOperationalAction } from '@gestor/types';

export function OrderActionMenu({
  actions,
  onAction,
  label = 'Abrir ações secundárias',
}: {
  actions: OrderOperationalAction[];
  onAction: (action: OrderOperationalAction) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
    const onDocumentClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onDocumentClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}
        onPointerDown={(event) => event.stopPropagation()}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open ? (
        <div role="menu" className="absolute bottom-12 right-0 z-30 min-w-48 rounded-xl border border-border bg-card p-1.5 shadow-xl">
          {actions.map((action, index) => (
            <button
              ref={index === 0 ? firstItemRef : undefined}
              key={action.type}
              role="menuitem"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                onAction(action);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              className={`w-full rounded-lg px-3 py-2.5 text-left text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${action.type === 'CANCEL' ? 'text-destructive hover:bg-destructive/10' : 'text-foreground hover:bg-muted'}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
