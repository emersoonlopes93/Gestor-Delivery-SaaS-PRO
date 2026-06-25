import { ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}

export function Modal({ isOpen, onClose, title, children, footer, maxWidth = 'max-w-lg' }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 safe-modal bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <div className={`card-premium w-full ${maxWidth} overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[calc(100dvh-var(--safe-area-top)-var(--safe-area-bottom)-2rem)] shadow-2xl border border-border`}>
        <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-card/80 backdrop-blur-xl">
          <h3 className="text-xl font-black text-foreground tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-2 rounded-full hover:bg-muted transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto bg-card">
          {children}
        </div>

        {footer && (
          <div className="px-6 py-4 bg-muted border-t border-border flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
