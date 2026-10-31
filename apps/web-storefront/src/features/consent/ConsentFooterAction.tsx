import { ShieldCheck } from 'lucide-react';
import { useStorefrontConsent } from './consent-context';
import { useCartStore } from '../../store/use-cart-store';

export function ConsentFooterAction() {
  const { openPreferences } = useStorefrontConsent();
  const hasCartItems = useCartStore((state) => state.items.length > 0);

  return (
    <footer className="relative z-0 w-full border-t border-[var(--storefront-border)] bg-[var(--storefront-background)]">
      <div className={`mx-auto flex w-full max-w-4xl justify-center px-4 py-5${hasCartItems ? ' pb-28' : ''}`}>
        <button
          type="button"
          onClick={openPreferences}
          className="inline-flex min-h-9 items-center gap-2 rounded-[var(--storefront-radius)] px-3 text-xs font-semibold text-[var(--storefront-muted-foreground)] transition-colors hover:bg-[var(--storefront-muted)] hover:text-[var(--storefront-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--storefront-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--storefront-background)]"
        >
          <ShieldCheck aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
          Preferências de privacidade
        </button>
      </div>
    </footer>
  );
}
