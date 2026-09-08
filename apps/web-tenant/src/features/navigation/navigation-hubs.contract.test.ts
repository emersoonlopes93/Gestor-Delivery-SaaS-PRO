import { readFileSync } from 'node:fs';
const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('navigation hubs UI contract', () => {
  it('keeps contextual navigation usable in narrow viewports', () => {
    const source = read('./NavigationHub.tsx');
    expect(source).toContain('overflow-x-auto');
    expect(source).toContain('shrink-0');
    expect(source).toContain('focus-visible:ring-2');
    expect(source).toContain("aria-current={isActive ? 'page' : undefined}");
    expect(source).toContain("? 'border-primary text-primary'");
  });

  it('uses the contextual hubs without copying destination page content', () => {
    const navigationHub = read('./NavigationHub.tsx');
    const finance = read('../purchasing/FinancePage.tsx');
    const inventory = read('../inventory/InventoryPage.tsx');
    const channels = read('./ChannelsPage.tsx');
    const management = read('./ManagementPage.tsx');
    const app = read('../../App.tsx');
    expect(finance).toContain("['management.finance', 'cash.home', 'analytics.reports']");
    expect(inventory).toContain("['management.purchases', 'management.suppliers']");
    expect(channels).toContain("'settings.integrations'");
    expect(channels).toContain("'whatsapp.config'");
    expect(channels).toContain("'marketing.automations'");
    expect(management).toContain("'analytics.reports'");
    expect(management).toContain("'analytics.goals'");
    expect(management).toContain("'analytics.performance'");
    expect(management).toContain("'analytics.bi'");
    expect(management).toContain("'management.employees'");
    expect(app).toContain('path="/management" element={<ManagementPage />}');
    expect(navigationHub).not.toContain('Abrir área');
  });
});
