import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntegrationsPage } from './IntegrationsPage';
import {
  useBillingPreview,
  useConnectMarketplaceManual,
  useDisconnectMarketplace,
  useMarketplaceConnections,
  useMarketplaceEvents,
  useMarketplaceOrders,
  useMarketplaceStatus,
  useReconnectMarketplace,
  useReprocessMarketplaceEvent,
  useReprocessMarketplaceOrder,
  useFood99AuthorizationUrl,
  useMarketplaceCatalogMappings,
  useMarketplaceCatalogMappingCandidates,
  useUpsertMarketplaceCatalogMapping,
} from '../marketplace/hooks';

let ifoodEnabled = true;

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({ data: [] }),
}));
vi.mock('../marketplace/hooks', () => ({
  useBillingPreview: vi.fn(),
  useConnectMarketplaceManual: vi.fn(),
  useDisconnectMarketplace: vi.fn(),
  useMarketplaceConnections: vi.fn(),
  useMarketplaceEvents: vi.fn(),
  useMarketplaceOrders: vi.fn(),
  useMarketplaceStatus: vi.fn(),
  useReconnectMarketplace: vi.fn(),
  useReprocessMarketplaceEvent: vi.fn(),
  useReprocessMarketplaceOrder: vi.fn(),
  useFood99AuthorizationUrl: vi.fn(),
  useMarketplaceCatalogMappings: vi.fn(),
  useMarketplaceCatalogMappingCandidates: vi.fn(),
  useUpsertMarketplaceCatalogMapping: vi.fn(),
}));
vi.mock('../../hooks/useTenantCapabilities', () => ({
  useTenantCapabilities: () => ({ isFeatureEnabled: (featureKey: string) => featureKey !== 'ifood_marketplace' || ifoodEnabled }),
}));

const mutation = () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() });
const refetch = vi.fn();

describe('IntegrationsPage multi-iFood connections', () => {
  beforeEach(() => {
    ifoodEnabled = true;
    vi.mocked(useMarketplaceStatus).mockReturnValue({ data: null, isLoading: false, refetch } as never);
    vi.mocked(useMarketplaceConnections).mockReturnValue({
      data: [
        {
          id: 'connection-a', tenantId: 'tenant-1', provider: 'ifood', status: 'CONNECTED',
          externalMerchantId: 'merchant-a', externalStoreId: 'store-a', displayName: 'Loja Centro',
          authType: 'centralized', settingsJson: null, hasAccessToken: true, hasRefreshToken: false,
          createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
        },
        {
          id: 'connection-b', tenantId: 'tenant-1', provider: 'ifood', status: 'TOKEN_EXPIRED',
          externalMerchantId: 'merchant-b', externalStoreId: 'store-b', displayName: 'Loja Shopping',
          authType: 'refresh_token', settingsJson: null, hasAccessToken: false, hasRefreshToken: true,
          createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch,
    } as never);
    vi.mocked(useMarketplaceOrders).mockReturnValue({ data: [], isLoading: false, isError: false, error: null, refetch } as never);
    vi.mocked(useMarketplaceEvents).mockReturnValue({ data: [], isLoading: false, isError: false, error: null, refetch } as never);
    vi.mocked(useBillingPreview).mockReturnValue({ data: null } as never);
    vi.mocked(useConnectMarketplaceManual).mockReturnValue(mutation() as never);
    vi.mocked(useDisconnectMarketplace).mockReturnValue(mutation() as never);
    vi.mocked(useReconnectMarketplace).mockReturnValue(mutation() as never);
    vi.mocked(useReprocessMarketplaceEvent).mockReturnValue(mutation() as never);
    vi.mocked(useReprocessMarketplaceOrder).mockReturnValue(mutation() as never);
    vi.mocked(useFood99AuthorizationUrl).mockReturnValue(mutation() as never);
    vi.mocked(useMarketplaceCatalogMappings).mockReturnValue({ data: [], isLoading: false } as never);
    vi.mocked(useMarketplaceCatalogMappingCandidates).mockReturnValue({ data: [], isLoading: false } as never);
    vi.mocked(useUpsertMarketplaceCatalogMapping).mockReturnValue(mutation() as never);
  });

  it('renders the simple channel journey without exposing technical identifiers', () => {
    const html = renderToStaticMarkup(<IntegrationsPage />);

    expect(html).toContain('Canais de venda');
    expect(html).toContain('Conecte suas lojas para receber os pedidos em um só lugar.');
    expect(html).toContain('99Food');
    expect(html).toContain('iFood');
    expect(html).toContain('Gerenciar');
    expect(html).toContain('Produtos que precisam de atenção');
    expect(html).toContain('Atividade e ajuda');
    expect(html).not.toContain('merchant-a');
    expect(html).not.toContain('store-a');
    expect(html).not.toContain('accessToken');
    expect(html).not.toContain('refreshToken');
  });

  it('labels a failed inbox event as a processing failure, not as an offline connection', () => {
    vi.mocked(useMarketplaceConnections).mockReturnValue({ data: [], isLoading: false, refetch } as never);
    vi.mocked(useMarketplaceEvents).mockReturnValue({
      data: [{
        id: 'event-1', tenantId: 'tenant-1', connectionId: 'connection-1', provider: '99food',
        eventId: 'food99:event-1', externalOrderId: '5764656197621845665', externalStoreId: 'store-1',
        status: 'FAILED', attempts: 3, lastError: 'Incomplete order detail.',
        receivedAt: '2026-09-05T22:00:00.000Z', processedAt: null,
      }],
      isLoading: false,
      refetch,
    } as never);

    const html = renderToStaticMarkup(<IntegrationsPage />);
    expect(html).toContain('Atividade e ajuda');
    expect(html).not.toContain('Incomplete order detail.');
  });

  it('keeps the generic marketplace page and 99Food available without exposing iFood administration', () => {
    ifoodEnabled = false;
    const html = renderToStaticMarkup(<IntegrationsPage />);

    expect(html).toContain('Canais de venda');
    expect(html).toContain('99Food');
    expect(html).toContain('Conectar loja');
    expect(html).not.toContain('iFood');
    expect(useMarketplaceStatus).toHaveBeenCalledWith('ifood', false);
  });

  it('exposes iFood administration only when its capability is enabled', () => {
    ifoodEnabled = true;
    const html = renderToStaticMarkup(<IntegrationsPage />);

    expect(html).toContain('iFood');
    expect(html).toContain('Gerenciar');
    expect(useMarketplaceStatus).toHaveBeenCalledWith('ifood', true);
  });
});
