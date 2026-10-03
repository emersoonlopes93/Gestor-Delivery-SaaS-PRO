import { Outlet, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import type { StorefrontPayload } from '@gestor/types';
import { StorefrontShell } from '@gestor/storefront-ui';
import { useStorefrontThemeStore } from '../stores/theme.store';
import type { StorefrontThemeSettings } from '@gestor/theme';
import { useDynamicManifest } from '../hooks/useDynamicManifest';
import {
  ConsentBanner,
  ConsentFooterAction,
  ConsentPreferencesDialog,
  StorefrontConsentProvider,
} from '../features/consent';
import { AnalyticsProvider } from '../features/analytics';

export function StorefrontLayout() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const storefrontTheme = useStorefrontThemeStore(s => s.theme);



  const { data, isLoading } = useQuery({
    queryKey: ['storefront', tenantSlug],
    queryFn: async () => {
      const res = await api.get<StorefrontPayload>(
        `/public/storefront/${tenantSlug}`,
      );
      return res.data;
    },
    enabled: !!tenantSlug,
  });

  // Ativa o manifesto dinâmico baseado no slug e nos dados do lojista
  useDynamicManifest(tenantSlug, data?.tenant);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const customization = data?.customization;
  const themeSettings = (customization?.theme || {}) as Partial<StorefrontThemeSettings>;

  const effectiveTheme = {
    ...themeSettings,
    colorMode: (storefrontTheme === 'system'
      ? (themeSettings.colorMode || 'light')
      : storefrontTheme) as 'light' | 'dark',
  };

  return (
    <StorefrontShell settings={effectiveTheme} className="flex min-h-[100dvh] w-full flex-col">
      {data?.tenant.id ? (
        <StorefrontConsentProvider
          key={data.tenant.id}
          tenantKey={data.tenant.id}
        >
          <AnalyticsProvider tenantSlug={tenantSlug ?? data.tenant.id}>
            <div className="flex min-h-[100dvh] w-full flex-col">
              <ConsentBanner />
              <main className="relative z-10 mx-auto w-full max-w-4xl flex-1 flex flex-col">
                <Outlet />
              </main>
              <ConsentFooterAction />
            </div>
            <ConsentPreferencesDialog />
          </AnalyticsProvider>
        </StorefrontConsentProvider>
      ) : (
        <main className="relative z-10 mx-auto w-full max-w-4xl flex-1 flex flex-col">
          <Outlet />
        </main>
      )}
    </StorefrontShell>
  );
}
