import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const appLayout = read('./AppLayout.tsx');
const tenantCss = read('../index.css');
const bottomSheet = read('../features/delivery/components/BottomSheet.tsx');
const deliveryMap = read('../features/delivery/DeliveryMapPage.tsx');
const modal = read('../components/Modal.tsx');
const tooltip = read('../components/InfoTooltip.tsx');
const tenantTheme = read('../stores/theme.store.ts');
const checkout = read('../../../web-storefront/src/pages/CheckoutPage.tsx');
const storefrontLayout = read('../../../web-storefront/src/layouts/StorefrontLayout.tsx');
const deliveryLogin = read('../../../web-delivery/src/pages/LoginPage.tsx');
const deliveryActive = read('../../../web-delivery/src/pages/ActiveDeliveryPage.tsx');
const deliveryCss = read('../../../web-delivery/src/index.css');

describe('R6 mobile safe-area and theme contracts', () => {
  it('keeps the desktop sidebar hidden on mobile and applies safe insets to the mobile surfaces', () => {
    expect(appLayout).toContain('tenant-sidebar safe-top safe-bottom hidden');
    expect(appLayout).toContain('pb-[max(1rem,var(--safe-area-bottom))]');
  });

  it('keeps the fixed drawer left inset scoped below the desktop breakpoint', () => {
    expect(tenantCss).toMatch(/@media \(max-width: 767px\)[\s\S]*\.is-capacitor \.safe-drawer-left/);
    expect(appLayout).toContain('md:static');
  });

  it('protects fixed delivery and checkout actions with a bottom inset', () => {
    expect(bottomSheet).toContain('safe-sheet');
    expect(deliveryMap).toContain('safe-sheet lg:static fixed');
    expect(checkout).toContain('storefront-safe-action sticky bottom-0');
  });

  it('keeps modals safe and body portals on semantic theme tokens', () => {
    expect(modal).toContain('safe-modal');
    expect(tooltip).toContain('bg-popover text-popover-foreground border border-border');
    expect(tooltip).toContain('document.body');
  });

  it('defines both light and dark semantic surfaces', () => {
    expect(tenantCss).toContain(':root {');
    expect(tenantCss).toContain('[data-theme="dark"]');
    expect(tenantCss).toContain('--status-success-foreground: #ffffff');
  });

  it('persists the selected theme and follows later system changes', () => {
    expect(tenantTheme).toContain("localStorage.setItem(THEME_STORAGE_KEY, theme)");
    expect(tenantTheme).toContain("addEventListener('change', systemPreferenceListener)");
    expect(tenantTheme).toContain("removeEventListener('change', systemPreferenceListener)");
    expect(tenantTheme).toContain('resolvedTheme: ResolvedTheme');
    expect(appLayout).toContain("setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')");
  });

  it('uses semantic tokens at the audited sheet and portal hotspots', () => {
    expect(bottomSheet).toContain('bg-card text-card-foreground border border-border');
    expect(bottomSheet).not.toContain('bg-white dark:bg-gray-900');
    expect(tooltip).not.toContain('bg-gray-900 text-white');
  });

  it('preserves checkout submit guards while making the mobile action safe', () => {
    expect(checkout).toContain('onClick={handleSubmit}');
    expect(checkout).toContain('disabled={!isFormValid || isSubmitting || isValidating}');
    expect(checkout).toContain('storefront-safe-action');
  });

  it('keeps delivery login and active-order layouts legible in the dynamic viewport', () => {
    expect(deliveryLogin).toContain('delivery-shell');
    expect(deliveryActive).toContain('delivery-shell');
    expect(deliveryLogin).not.toContain('h-screen bg-slate-50');
    expect(deliveryActive).not.toContain('h-screen bg-slate-50');
    expect(deliveryCss).toContain('@media (prefers-color-scheme: dark)');
    expect(deliveryCss).toContain('height: 100dvh');
  });

  it('keeps preview chrome outside the canonical StorefrontShell theme boundary', () => {
    expect(storefrontLayout).toContain('<StorefrontShell settings={effectiveTheme}');
    expect(storefrontLayout).not.toContain('data-storefront-theme=');
  });
});
