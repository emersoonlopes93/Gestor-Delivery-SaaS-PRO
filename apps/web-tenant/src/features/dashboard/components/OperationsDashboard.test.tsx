import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { DashboardOperationalDTO } from '@gestor/types';
import { OperationsDashboard } from './OperationsDashboard';

const overview: DashboardOperationalDTO = {
  period: { from: '2026-10-11', to: '2026-10-11', timezone: 'America/Sao_Paulo' },
  orders: {
    total: 8,
    byStatus: {
      pending: 1, confirmed: 1, preparing: 1, ready_for_pickup: 1, ready_for_delivery: 0,
      out_for_delivery: 1, completed: 2, cancelled: 1, draft: 0,
    },
    cancelled: 1,
    cancellationRate: 0.125,
  },
  completedSales: { orderCount: 2, grossOrderTotal: 240, averageTicket: 120 },
};

describe('OperationsDashboard', () => {
  it('renders supported context without session internals', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <OperationsDashboard current={overview} storeStatus="open" canReadReports />
      </MemoryRouter>,
    );
    expect(html).toContain('Vendas concluídas');
    expect(html).toContain('Ticket médio');
    expect(html).toContain('Valor dos pedidos concluídos');
    expect(html).toContain('12.5%');
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
      orders: {
        ...overview.orders,
        total: 0,
        byStatus: { pending: 0, confirmed: 0, preparing: 0, ready_for_pickup: 0, ready_for_delivery: 0, out_for_delivery: 0, completed: 0, cancelled: 0, draft: 0 },
        cancelled: 0,
        cancellationRate: 0,
      },
      completedSales: { orderCount: 0, grossOrderTotal: 0, averageTicket: 0 },
    };
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <OperationsDashboard current={empty} storeStatus="closed" canReadReports />
      </MemoryRouter>,
    );
    expect(html).toContain('Loja fechada');
    expect(html).toContain('Vendas concluídas');
    expect(html).not.toContain('Ãƒ');
  });
  it('shows a non-open store only as an actionable attention item', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <OperationsDashboard current={overview} storeStatus="closed" canReadReports />
      </MemoryRouter>,
    );

    expect(html).toContain('Loja fechada');
    expect(html).toContain('Pontos de atenção');
    expect(html).not.toContain('Pulso da operação');
  });

  it('does not render the reports CTA for a profile without reports access', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <OperationsDashboard current={overview} storeStatus="open" canReadReports={false} />
      </MemoryRouter>,
    );

    expect(html).not.toContain('Ver relatórios');
  });

});
