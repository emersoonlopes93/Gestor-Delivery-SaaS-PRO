import { Printer } from 'lucide-react';

export default function PrintButton({ className, ariaLabel = 'Imprimir' }: { className?: string; ariaLabel?: string }) {
  return (
    <button type="button" aria-label={ariaLabel} className={`${className ?? ''} z-40 grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}>
      <Printer className="h-4 w-4" />
    </button>
  );
}
