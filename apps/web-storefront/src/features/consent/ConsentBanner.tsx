import { ShieldCheck } from 'lucide-react';
import { StorefrontButton } from '@gestor/storefront-ui';
import { useStorefrontConsent } from './consent-context';

const focusClasses =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--storefront-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--storefront-background)]';

const consentCategories = [
  { name: 'Necessários', state: 'Ativos', protected: true },
  { name: 'Analytics', state: 'Opcional', protected: false },
  { name: 'Marketing', state: 'Opcional', protected: false },
] as const;

export function ConsentBanner() {
  const {
    status,
    acceptAll,
    acceptNecessaryOnly,
    openPreferences,
  } = useStorefrontConsent();

  if (status !== 'undecided') {
    return null;
  }

  return (
    <aside
      aria-labelledby="storefront-consent-banner-title"
      className="relative z-20 w-full border-b border-[var(--storefront-border)] bg-[var(--storefront-card)] text-[var(--storefront-card-foreground)]"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3.5 sm:px-6 sm:py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--storefront-radius)] bg-[var(--storefront-muted)] text-[var(--storefront-primary)]"
          >
            <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h2
              id="storefront-consent-banner-title"
              className="text-sm font-semibold leading-5 sm:text-base"
            >
              Sua privacidade importa
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-[var(--storefront-muted-foreground)]">
              Usamos recursos necessários para o cardápio e, com a sua
              permissão, podemos usar dados de desempenho e marketing para
              melhorar a experiência.
            </p>
            <dl
              aria-label="Resumo das categorias de privacidade"
              className="mt-3 grid max-w-xl grid-cols-3 border-t border-[var(--storefront-border)] pt-2.5"
            >
              {consentCategories.map(category => (
                <div
                  key={category.name}
                  className="min-w-0 border-r border-[var(--storefront-border)] px-2 first:pl-0 last:border-r-0 last:pr-0 sm:px-3"
                >
                  <dt className="truncate text-[0.6875rem] font-semibold leading-4 text-[var(--storefront-foreground)]">
                    {category.name}
                  </dt>
                  <dd
                    className={`flex items-center gap-1.5 text-[0.6875rem] leading-4 ${
                      category.protected
                        ? 'font-semibold text-[var(--storefront-primary)]'
                        : 'text-[var(--storefront-muted-foreground)]'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        category.protected
                          ? 'bg-[var(--storefront-primary)]'
                          : 'border border-[var(--storefront-muted-foreground)]'
                      }`}
                    />
                    {category.state}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="grid w-full shrink-0 grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2 lg:w-[31rem]">
          <StorefrontButton
            type="button"
            variant="outline"
            size="sm"
            className={`${focusClasses} w-full`}
            onClick={() => acceptAll('banner_accept_all')}
          >
            Aceitar todos
          </StorefrontButton>
          <StorefrontButton
            type="button"
            variant="outline"
            size="sm"
            className={`${focusClasses} w-full`}
            onClick={() => acceptNecessaryOnly('banner_reject_optional')}
          >
            Aceitar apenas necessários
          </StorefrontButton>
          <button
            type="button"
            className={`min-h-9 px-3 text-xs font-semibold text-[var(--storefront-muted-foreground)] underline decoration-[var(--storefront-border)] underline-offset-4 transition-colors hover:text-[var(--storefront-foreground)] hover:decoration-[var(--storefront-muted-foreground)] sm:col-span-2 ${focusClasses}`}
            onClick={openPreferences}
          >
            Personalizar
          </button>
        </div>
      </div>
    </aside>
  );
}
