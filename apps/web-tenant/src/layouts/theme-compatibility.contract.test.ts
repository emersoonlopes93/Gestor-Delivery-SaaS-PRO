import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const deliveryRates = read('../features/delivery/rates/DeliveryRatesPage.tsx');
const radiusTiers = read('../features/delivery/rates/RadiusTiersPanel.tsx');
const specialAreas = read('../features/delivery/rates/SpecialAreasPanel.tsx');
const deliveryTest = read('../features/delivery/rates/DeliveryTestPanel.tsx');
const deliveryMap = read('../features/delivery/rates/DeliveryMapCanvas.tsx');
const operationalRouteMap = read('../features/delivery/components/OperationalRouteMap.tsx');
const suppliers = read('../features/purchasing/SuppliersPage.tsx');
const tenantCss = read('../index.css');
const reports = read('../features/analytics/ReportsPage.tsx');
const businessIntelligence = read('../features/analytics/BusinessIntelligencePage.tsx');
const chartTheme = read('../components/charts/chart-theme.ts');
const inventory = read('../features/inventory/InventoryPage.tsx');
const promotions = read('../features/promotions/PromotionsPage.tsx');

describe('web-tenant light and dark compatibility contracts', () => {
  it('keeps the active delivery rates UI on semantic neutral tokens', () => {
    const deliverySources = [deliveryRates, radiusTiers, specialAreas, deliveryTest].join('\n');

    expect(deliverySources).not.toMatch(/\bbg-white(?=\s|["'])/);
    expect(deliverySources).not.toMatch(/\btext-(?:slate|gray)-(?:700|800|900)\b/);
    expect(deliverySources).not.toMatch(/\bbg-(?:slate|gray)-(?:50|100|200)\b/);
    expect(deliverySources).toContain('bg-card');
    expect(deliverySources).toContain('text-foreground');
    expect(deliverySources).toContain('text-muted-foreground');
  });

  it('limits the dark map treatment to tiles and themes its overlay controls', () => {
    expect(deliveryMap).toContain('theme-aware-map');
    expect(operationalRouteMap).toContain('theme-aware-map');
    expect(deliveryMap).toContain('bg-popover/95');
    expect(tenantCss).toContain('[data-theme="dark"] .theme-aware-map .leaflet-tile-pane');
    expect(tenantCss).toContain('hue-rotate(180deg)');
  });

  it('keeps supplier table surfaces semantic in dark mode', () => {
    expect(suppliers).toContain('bg-card');
    expect(suppliers).toContain('bg-muted/50');
    expect(suppliers).toContain('divide-border');
    expect(suppliers).not.toContain('dark:bg-gray-900/50/50');
    expect(suppliers).not.toMatch(/\bbg-white(?=\s|["'])/);
  });

  it('uses semantic chart chrome instead of Recharts light defaults', () => {
    for (const source of [reports, businessIntelligence]) {
      expect(source).toContain('chartTooltipContentStyle');
      expect(source).toContain('chartTooltipLabelStyle');
      expect(source).toContain('chartTooltipItemStyle');
    }
    expect(chartTheme).toContain("backgroundColor: 'var(--popover)'");
    expect(chartTheme).toContain("color: 'var(--popover-foreground)'");
    expect(chartTheme).toContain("border: '1px solid var(--border)'");
  });

  it('keeps inactive inventory and promotion tabs readable in both themes', () => {
    for (const source of [inventory, promotions]) {
      expect(source).toContain('text-muted-foreground hover:bg-muted hover:text-foreground');
      expect(source).not.toContain("'text-gray-500 hover:text-gray-700'");
    }
  });
});
