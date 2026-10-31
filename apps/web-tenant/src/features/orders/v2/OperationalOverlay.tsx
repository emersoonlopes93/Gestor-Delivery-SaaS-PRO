import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

type OperationalOverlayProps = { title: string; onClose: () => void; children: ReactNode; fullscreen?: boolean };

/** Overlay shell for the persistent Order Manager context. */
export function OperationalOverlay({ title, onClose, children, fullscreen = false }: OperationalOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (focusable.length === 0) { event.preventDefault(); return; }
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); };
  }, [onClose]);
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm" role="presentation">
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl focus:outline-none ${fullscreen ? 'h-[calc(100dvh-1.5rem)] max-w-[1800px]' : 'max-h-[calc(100dvh-2rem)] max-w-6xl'}`}>
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-3"><h2 className="text-base font-black text-foreground">{title}</h2><button type="button" onClick={onClose} aria-label={`Fechar ${title}`} className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X className="h-5 w-5" /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-background">{children}</div>
    </div>
  </div>;
}
