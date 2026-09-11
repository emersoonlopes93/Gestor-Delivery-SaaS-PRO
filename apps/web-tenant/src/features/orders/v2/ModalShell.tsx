import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

type ModalShellProps = {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  size?: 'standard' | 'large';
};

let modalDepth = 0;

export function ModalShell({ open, title, children, onClose, size = 'large' }: ModalShellProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalDepth += 1;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      modalDepth -= 1;
      if (modalDepth === 0) document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
    };
  }, [onClose, open]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-[1.75rem] bg-card shadow-2xl outline-none ${size === 'large' ? 'sm:max-w-5xl' : 'sm:max-w-xl'}`}>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-5 py-4 backdrop-blur">
          <h2 id={titleId} className="text-base font-black text-foreground">{title}</h2>
          <button type="button" className="rounded-lg px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary" onClick={onClose}>Fechar</button>
        </header>
        {children}
      </section>
    </div>, document.body,
  );
}
