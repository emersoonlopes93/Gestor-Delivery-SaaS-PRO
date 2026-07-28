import { useEffect, useId, useRef } from 'react';
import { Check, ShieldCheck, X } from 'lucide-react';
import { StorefrontButton } from '@gestor/storefront-ui';
import { useStorefrontConsent } from './consent-context';

const focusClasses =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--storefront-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--storefront-card)]';

interface ConsentCategoryProps {
  name: string;
  metadata?: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}

function ConsentCategory({
  name,
  metadata,
  description,
  checked,
  disabled = false,
  onChange,
}: ConsentCategoryProps) {
  const nameId = useId();
  const descriptionId = useId();

  return (
    <section className="flex items-start justify-between gap-4 border-b border-[var(--storefront-border)] py-4 last:border-b-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 id={nameId} className="text-sm font-semibold leading-5">
            {name}
          </h3>
          <span
            className={`text-[0.6875rem] font-semibold uppercase tracking-wide ${
              disabled
                ? 'text-[var(--storefront-primary)]'
                : 'text-[var(--storefront-muted-foreground)]'
            }`}
          >
            {metadata ?? (disabled ? 'Protegidos' : 'Opcional')}
          </span>
        </div>
        <p
          id={descriptionId}
          className="mt-1 text-sm leading-5 text-[var(--storefront-muted-foreground)]"
        >
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={nameId}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${focusClasses} ${
          checked
            ? 'border-[var(--storefront-primary)] bg-[var(--storefront-primary)]'
            : 'border-[var(--storefront-muted-foreground)] bg-[var(--storefront-muted)]'
        } disabled:cursor-not-allowed disabled:opacity-80`}
      >
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full bg-[var(--storefront-primary-foreground)] text-[var(--storefront-primary)] shadow-sm transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        >
          {checked && <Check aria-hidden="true" className="h-3 w-3" />}
        </span>
      </button>
    </section>
  );
}

export function ConsentPreferencesDialog() {
  const {
    status,
    isPreferencesOpen,
    draftCategories,
    closePreferences,
    setDraftCategory,
    savePreferences,
    acceptAll,
    acceptNecessaryOnly,
    revokeOptional,
  } = useStorefrontConsent();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!isPreferencesOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePreferences();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (
        !dialogRef.current?.contains(document.activeElement) ||
        (event.shiftKey && document.activeElement === firstElement)
      ) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closePreferences, isPreferencesOpen]);

  if (!isPreferencesOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto bg-black/50 p-0 sm:items-center sm:p-6"
      onMouseDown={event => event.preventDefault()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="max-h-[min(92vh,46rem)] w-full overflow-y-auto rounded-t-[var(--storefront-radius)] border border-[var(--storefront-border)] bg-[var(--storefront-card)] text-[var(--storefront-card-foreground)] shadow-2xl sm:max-w-xl sm:rounded-[var(--storefront-radius)]"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-[var(--storefront-border)] bg-[var(--storefront-card)] px-5 py-4 sm:px-6">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--storefront-radius)] bg-[var(--storefront-muted)] text-[var(--storefront-primary)]"
          >
            <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold leading-6">
              Preferências de privacidade
            </h2>
            <p
              id={descriptionId}
              className="mt-1 text-sm leading-5 text-[var(--storefront-muted-foreground)]"
            >
              Escolha como os recursos opcionais podem ser usados neste
              cardápio. Você pode mudar de ideia a qualquer momento.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Fechar preferências de privacidade"
            onClick={closePreferences}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--storefront-radius)] text-[var(--storefront-muted-foreground)] transition-colors hover:bg-[var(--storefront-muted)] hover:text-[var(--storefront-foreground)] ${focusClasses}`}
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>

        <div className="px-5 sm:px-6">
          <ConsentCategory
            name="Necessários"
            description="Mantêm o carrinho, checkout, autenticação, preferências e acompanhamento de pedidos funcionando."
            checked
            disabled
          />
          <ConsentCategory
            name="Analytics"
            description="Permitem medir visitas, produtos visualizados, uso do carrinho e conversões para melhorar a experiência."
            checked={draftCategories.analytics}
            onChange={checked => setDraftCategory('analytics', checked)}
          />
          <ConsentCategory
            name="Marketing"
            description="Permitem futuras integrações de medição e publicidade com Google e Meta."
            checked={draftCategories.marketing}
            onChange={checked => setDraftCategory('marketing', checked)}
          />
        </div>

        <footer className="border-t border-[var(--storefront-border)] bg-[var(--storefront-muted)] px-5 py-4 sm:px-6">
          <div className="grid grid-cols-2 gap-2">
            <StorefrontButton
              type="button"
              className={`col-span-2 ${focusClasses}`}
              onClick={savePreferences}
            >
              Salvar preferências
            </StorefrontButton>
            <StorefrontButton
              type="button"
              variant="outline"
              className={`h-auto min-h-11 px-3 py-2 leading-4 ${focusClasses}`}
              onClick={() => acceptAll('preferences_save')}
            >
              Aceitar todos
            </StorefrontButton>
            <StorefrontButton
              type="button"
              variant="outline"
              className={`h-auto min-h-11 px-3 py-2 leading-4 ${focusClasses}`}
              onClick={() => acceptNecessaryOnly('preferences_save')}
            >
              Aceitar apenas necessários
            </StorefrontButton>
            {status === 'decided' && (
              <StorefrontButton
                type="button"
                variant="ghost"
                size="sm"
                className={`col-span-2 ${focusClasses}`}
                onClick={revokeOptional}
              >
                Revogar opcionais
              </StorefrontButton>
            )}
          </div>
          <p className="mt-3 text-center text-xs leading-4 text-[var(--storefront-muted-foreground)]">
            Recursos necessários permanecem ativos para o funcionamento do
            serviço.
          </p>
        </footer>
      </div>
    </div>
  );
}
