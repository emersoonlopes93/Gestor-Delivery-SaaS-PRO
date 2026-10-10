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
    totalRevenue: 240, averageTicket: 120, totalOrders: 2, revenueByChannel: {}, revenueByCategory: {},
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
        <OperationsDashboard current={overview} storeStatus="open" analyticsAvailable canOpenReports />
      </MemoryRouter>,
    );
    expect(html).toContain('Vendas concluídas');
    expect(html).toContain('Ticket médio');
    expect(html).toContain('Valor dos pedidos concluídos');
    expect(html).not.toContain('Receita concluída');
    expect(html).not.toContain('Ticket concluído');
    expect(html).toContain('Pedidos concluídos');
    expect(html).toContain('Ver relatórios');
    expect(html).toContain('Fluxo operacional');
    expect(html).toContain('Pontos de atenção');
    expect(html).not.toContain('Produtos em destaque');
    expect(html).not.toContain('Horários de pico');
    expect(html).not.toContain('Pedidos por canal');
    expect(html).not.toContain('Ações rápidas');
    expect(html).not.toContain('Cozinha');
    expect(html).not.toContain('Pulso da operação');
    expect(html).not.toContain('Ãƒ');
    expect(html).not.toContain('Tenant ID');
    expect(html).not.toContain('Permissões');
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
        <OperationsDashboard current={empty} storeStatus="closed" analyticsAvailable canOpenReports />
      </MemoryRouter>,
    );
    expect(html).toContain('Loja fechada');
    expect(html).toContain('Vendas concluídas');
    expect(html).not.toContain('Ãƒ');
  });
  it('shows a non-open store only as an actionable attention item', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <OperationsDashboard current={overview} storeStatus="closed" analyticsAvailable canOpenReports />
      </MemoryRouter>,
    );

    expect(html).toContain('Loja fechada');
    expect(html).toContain('Pontos de atenção');
    expect(html).not.toContain('Pulso da operação');
  });

  it('keeps the operational dashboard usable without reports.read', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <OperationsDashboard current={null} storeStatus="open" analyticsAvailable={false} canOpenReports={false} />
      </MemoryRouter>,
    );
    expect(html).toContain('Painel operacional disponível');
    expect(html).not.toContain('Ações rápidas');
    expect(html).not.toContain('Vendas concluídas');
  });
});
