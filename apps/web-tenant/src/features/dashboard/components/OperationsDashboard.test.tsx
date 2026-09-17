import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { DashboardStatsDTO } from '@gestor/types';
import { OperationsDashboard } from './OperationsDashboard';

const overview: DashboardStatsDTO = {
  operational: {
    totalOrders: 8,
    ordersByStatus: {
      pending: 1, confirmed: 1, preparing: 1, ready_for_pickup: 1, ready_for_delivery: 0,
      out_for_delivery: 1, completed: 2, cancelled: 1, draft: 0,
    },
    ordersByChannel: { storefront: 5, whatsapp: 3 },
    ordersByFulfillment: { delivery: 5, pickup: 3, dine_in: 0, table: 0 },
    averagePreparationTimeMinutes: 18,
    averageDeliveryTimeMinutes: 32,
    cancellationRate: 12.5,
    peakHours: [{ hour: 12, count: 3 }, { hour: 13, count: 5 }],
  },
  commercial: {
    totalRevenue: 240, food99EstimatedNetReceivable: 186.4, food99BillEntryCount: 2, food99EstimatedNetReceivableSource: 'BILL_DATA', averageTicket: 120, totalOrders: 2, revenueByChannel: {}, revenueByCategory: {},
    topProducts: [{ id: 'p1', name: 'Pizza Margherita', quantity: 4, revenue: 160 }],
    topCombos: [], couponUsage: [], cashbackStats: { earnedTotal: 0, redeemedTotal: 0 },
  },
  costs: { estimatedCMV: 0, estimatedGrossMargin: 0, grossMarginPercentage: 0, productPerformance: [] },
  financial: { totalIncome: 240, totalExpenses: 0, cashBalance: 240, netCashFlow: 240 },
};

describe('OperationsDashboard', () => {
  it('renders supported context without session internals', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <OperationsDashboard current={overview} previous={overview} storeStatus="open" tenantSlug="demo" tenantName="Loja Demo" onCopyMenu={() => undefined} onRefresh={() => undefined} refreshing={false} periodLabel="nos últimos 7 dias" />
      </MemoryRouter>,
    );
    expect(html).toContain('Loja aberta');
    expect(html).toContain('Vendas concluídas (brutas)');
    expect(html).toContain('Ganhos líquidos estimados 99Food');
    expect(html).toContain('R$ 186,40');
    expect(html).toContain('Pizza Margherita');
    expect(html).toContain('Detalhamento por hora indisponível');
    expect(html).toContain('operação');
    expect(html).toContain('Atenção');
    expect(html).toContain('Cardápio');
    expect(html).toContain('Fluxo nos últimos 7 dias');
    expect(html).not.toContain('Ãƒ');
    expect(html).not.toContain('Tenant ID');
    expect(html).not.toContain('Permissões');
  });

  it('does not present missing 99Food Bill Data as a zero net receivable', () => {
    const unavailable: DashboardStatsDTO = {
      ...overview,
      commercial: {
        ...overview.commercial,
        food99EstimatedNetReceivable: null,
        food99BillEntryCount: 0,
        food99EstimatedNetReceivableSource: 'UNAVAILABLE',
      },
    };
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <OperationsDashboard current={unavailable} previous={null} storeStatus="open" onCopyMenu={() => undefined} onRefresh={() => undefined} refreshing={false} periodLabel="hoje" />
      </MemoryRouter>,
    );
    expect(html).toContain('Dados financeiros 99Food indisponíveis neste período');
    expect(html).toContain('A confirmar');
  });

  it('renders the honest no-order state', () => {
    const empty: DashboardStatsDTO = {
      ...overview,
      operational: {
        ...overview.operational,
        totalOrders: 0,
        ordersByStatus: { pending: 0, confirmed: 0, preparing: 0, ready_for_pickup: 0, ready_for_delivery: 0, out_for_delivery: 0, completed: 0, cancelled: 0, draft: 0 },
        ordersByChannel: {},
      },
      commercial: { ...overview.commercial, totalRevenue: 0, averageTicket: 0, totalOrders: 0, topProducts: [] },
    };
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <OperationsDashboard current={empty} previous={null} storeStatus="closed" tenantSlug="demo" onCopyMenu={() => undefined} onRefresh={() => undefined} refreshing={false} periodLabel="ontem" />
      </MemoryRouter>,
    );
    expect(html).toContain('Nenhum pedido recebido ontem');
    expect(html).toContain('cardápio');
    expect(html).toContain('Comparação indisponível');
    expect(html).not.toContain('Ãƒ');
  });
  it('uses explicit light and dark theme pairs for the store status card', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <OperationsDashboard current={overview} previous={null} storeStatus="closed" tenantSlug="demo" onCopyMenu={() => undefined} onRefresh={() => undefined} refreshing={false} periodLabel="hoje" />
      </MemoryRouter>,
    );

    expect(html).toContain('border-slate-200 bg-white px-4 py-4 text-slate-900 shadow-card dark:border-slate-800 dark:bg-slate-900');
    expect(html).toContain('text-slate-900 dark:text-slate-100');
    expect(html).toContain('Loja fechada');
    expect(html).not.toContain('bg-slate-950');
  });
});
