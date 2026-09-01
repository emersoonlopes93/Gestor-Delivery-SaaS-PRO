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
} from '../marketplace/hooks';

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
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
}));

const mutation = () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() });
const refetch = vi.fn();

describe('IntegrationsPage multi-iFood connections', () => {
  beforeEach(() => {
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
  });

  it('renders multiple merchants with independent status and actions without secrets', () => {
    const html = renderToStaticMarkup(<IntegrationsPage />);

    expect(html).toContain('Loja Centro');
    expect(html).toContain('Merchant: merchant-a');
    expect(html).toContain('Loja Shopping');
    expect(html).toContain('Merchant: merchant-b');
    expect(html).toContain('Ativo');
    expect(html).toContain('Reautenticação necessária');
    expect(html).toContain('Desconectar');
    expect(html).toContain('Reconectar');
    expect(html).toContain('Adicionar loja iFood');
    expect(html).not.toContain('accessToken');
    expect(html).not.toContain('refreshToken');
  });
});
