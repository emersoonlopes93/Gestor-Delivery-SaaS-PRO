import { readFileSync } from 'node:fs';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('ChannelsPage navigation hub contract', () => {
  it('keeps the sales, relationship and marketing destinations in their semantic groups', () => {
    const source = read('./ChannelsPage.tsx');

    expect(source).toContain("id: 'sales-channels'");
    expect(source).toContain("label: 'Onde você vende'");
    expect(source).toContain("itemIds: ['settings.storefront', 'settings.integrations']");
    expect(source).toContain("id: 'customer-relationships'");
    expect(source).toContain("itemIds: ['whatsapp.inbox', 'whatsapp.config', 'crm.customers', 'crm.dashboard']");
    expect(source).toContain("id: 'marketing-channels'");
    expect(source).toContain("itemIds: ['crm.promotions', 'campaigns.home', 'marketing.automations']");
  });

  it('preserves every existing destination ID and path, and delegates links, guards, responsive layout and accessibility to NavigationHub', () => {
    const source = read('./ChannelsPage.tsx');
    const navigationHub = read('./NavigationHub.tsx');
    const registry = read('../../navigation/navigationRegistry.ts');

    for (const [id, path] of [
      ['settings.storefront', '/settings/storefront'],
      ['settings.integrations', '/settings/integrations'],
      ['whatsapp.inbox', '/whatsapp/inbox'],
      ['whatsapp.config', '/whatsapp/config'],
      ['crm.customers', '/customers'],
      ['crm.dashboard', '/crm/dashboard'],
      ['crm.promotions', '/promotions'],
      ['campaigns.home', '/campaigns'],
      ['marketing.automations', '/marketing/automations'],
    ]) {
      expect(source).toContain(`'${id}'`);
      expect(registry).toContain(`id: '${id}'`);
      expect(registry).toContain(`path: '${path}'`);
    }

    expect(source).toContain('sections={CHANNEL_SECTIONS}');
    expect(source).not.toMatch(/\b(fetch|axios|useQuery)\b/);
    expect(navigationHub).toContain('to={entry.path}');
    expect(navigationHub).toContain('filterNavigationItems(');
    expect(navigationHub).toContain('hasPermission(user?.permissions ?? [], permission)');
    expect(navigationHub).toContain("user?.enabledModules?.includes(module) === true");
    expect(navigationHub).toContain('sm:grid-cols-2 lg:grid-cols-3');
    expect(navigationHub).toContain('grid-cols-1');
    expect(navigationHub).toContain('aria-labelledby');
    expect(navigationHub).toContain('group-focus-visible:ring-2');
    expect(navigationHub).not.toContain('Revisão prioritária');
  });
});
