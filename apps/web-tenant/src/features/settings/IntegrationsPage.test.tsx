// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntegrationsPage } from './IntegrationsPage';
import { ApiError } from '../../lib/api-client';
import { food99VerificationErrorMessage } from './food99-verification-message';
import {
  useBillingPreview,
  useConnectMarketplaceManual,
  useBindFood99SelfServiceAuthorization,
  useDisconnectMarketplace,
  useMarketplaceConnections,
  useMarketplaceEvents,
  useMarketplaceOrders,
  useMarketplaceStatus,
  useReconnectMarketplace,
  useReprocessMarketplaceEvent,
  useReprocessMarketplaceOrder,
  useStartFood99SelfServiceAuthorization,
  useVerifyFood99SelfServiceAuthorization,
  useMarketplaceCatalogMappings,
  useMarketplaceCatalogMappingCandidates,
  useUpsertMarketplaceCatalogMapping,
  useRemoveMarketplaceConnection,
} from '../marketplace/hooks';

let ifoodEnabled = true;

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({ data: [] }),
}));
vi.mock('../marketplace/hooks', () => ({
  useBillingPreview: vi.fn(),
  useConnectMarketplaceManual: vi.fn(),
  useBindFood99SelfServiceAuthorization: vi.fn(),
  useDisconnectMarketplace: vi.fn(),
  useMarketplaceConnections: vi.fn(),
  useMarketplaceEvents: vi.fn(),
  useMarketplaceOrders: vi.fn(),
  useMarketplaceStatus: vi.fn(),
  useReconnectMarketplace: vi.fn(),
  useReprocessMarketplaceEvent: vi.fn(),
  useReprocessMarketplaceOrder: vi.fn(),
  useStartFood99SelfServiceAuthorization: vi.fn(),
  useVerifyFood99SelfServiceAuthorization: vi.fn(),
  useMarketplaceCatalogMappings: vi.fn(),
  useMarketplaceCatalogMappingCandidates: vi.fn(),
  useUpsertMarketplaceCatalogMapping: vi.fn(),
  useRemoveMarketplaceConnection: vi.fn(),
}));
vi.mock('../../hooks/useTenantCapabilities', () => ({
  useTenantCapabilities: () => ({ isFeatureEnabled: (featureKey: string) => featureKey !== 'ifood_marketplace' || ifoodEnabled }),
}));

const mutation = () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() });
const refetch = vi.fn();

const food99Connection = {
  id: 'food99-connection-1', tenantId: 'tenant-1', provider: '99food' as const, status: 'DISCONNECTED' as const,
  externalMerchantId: null, externalStoreId: null, displayName: null, authType: 'authorization_page', settingsJson: null,
  hasAccessToken: false, hasRefreshToken: false, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('IntegrationsPage multi-iFood connections', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('uses actionable messages for documented 99Food authorization states', () => {
    expect(food99VerificationErrorMessage(new ApiError(409, 'missing token', 'AUTH_TOKEN_NOT_AVAILABLE')))
      .toContain('ainda não disponibilizou');
    expect(food99VerificationErrorMessage(new ApiError(409, 'wait', 'AUTH_TOKEN_REFRESHED_WAIT_RETRY')))
      .toContain('Aguarde 2 minutos');
    expect(food99VerificationErrorMessage(new ApiError(503, 'invalid app', 'APP_ID_INVALID')))
      .toContain('informações para suporte');
    expect(food99VerificationErrorMessage(new ApiError(502, 'provider rejected', 'PROVIDER_AUTHORIZATION_REJECTED')))
      .toContain('concluiu');
  });
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
    vi.mocked(useBindFood99SelfServiceAuthorization).mockReturnValue(mutation() as never);
    vi.mocked(useDisconnectMarketplace).mockReturnValue(mutation() as never);
    vi.mocked(useReconnectMarketplace).mockReturnValue(mutation() as never);
    vi.mocked(useReprocessMarketplaceEvent).mockReturnValue(mutation() as never);
    vi.mocked(useReprocessMarketplaceOrder).mockReturnValue(mutation() as never);
    vi.mocked(useStartFood99SelfServiceAuthorization).mockReturnValue(mutation() as never);
    vi.mocked(useVerifyFood99SelfServiceAuthorization).mockReturnValue(mutation() as never);
    vi.mocked(useMarketplaceCatalogMappings).mockReturnValue({ data: [], isLoading: false } as never);
    vi.mocked(useMarketplaceCatalogMappingCandidates).mockReturnValue({ data: [], isLoading: false } as never);
    vi.mocked(useUpsertMarketplaceCatalogMapping).mockReturnValue(mutation() as never);
    vi.mocked(useRemoveMarketplaceConnection).mockReturnValue(mutation() as never);
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

  it('opens the guided 99Food journey without technical fields, then waits for verification', async () => {
    const user = userEvent.setup();
    const start = mutation();
    start.mutateAsync.mockResolvedValue({ authorizationUrl: 'https://99food.example/authorize', connection: food99Connection });
    vi.mocked(useStartFood99SelfServiceAuthorization).mockReturnValue(start as never);
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<IntegrationsPage />);
    await user.click(screen.getAllByRole('button', { name: 'Conectar loja' })[0]);

    expect(screen.getByRole('dialog', { name: 'Conectar 99Food' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Autorizar na 99Food' })).toBeTruthy();
    expect(screen.queryByLabelText('ID da loja na 99Food (shop_id)')).toBeNull();
    expect(screen.queryByLabelText('Código de vínculo (app_shop_id)')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Autorizar na 99Food' }));
    await screen.findByText('Aguardando autorização');
    expect(start.mutateAsync).toHaveBeenCalledWith({ connectionId: undefined, createNew: false });
    expect(open).toHaveBeenCalledWith('https://99food.example/authorize', '_blank', 'noopener,noreferrer');
    expect(screen.getByRole('button', { name: 'Verificar autorização' })).toBeTruthy();
    open.mockRestore();
  });

  it('keeps verification available after a temporary verification error', async () => {
    const user = userEvent.setup();
    const start = mutation();
    const verify = mutation();
    start.mutateAsync.mockResolvedValue({ authorizationUrl: 'https://99food.example/authorize', connection: food99Connection });
    verify.mutateAsync.mockRejectedValue(new Error('temporary provider failure'));
    vi.mocked(useStartFood99SelfServiceAuthorization).mockReturnValue(start as never);
    vi.mocked(useVerifyFood99SelfServiceAuthorization).mockReturnValue(verify as never);
    vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<IntegrationsPage />);
    await user.click(screen.getAllByRole('button', { name: 'Conectar loja' })[0]);
    await user.click(screen.getByRole('button', { name: 'Autorizar na 99Food' }));
    await screen.findByText('Aguardando autorização');
    await user.click(screen.getByRole('button', { name: 'Verificar autorização' }));

    await waitFor(() => expect(verify.mutateAsync).toHaveBeenCalledWith({ connectionId: 'food99-connection-1' }));
    expect(screen.getByRole('button', { name: 'Verificar autorização' })).toBeTruthy();
  });

  it('routes a pending self-service retry to verification, never to manual reconnect', async () => {
    const user = userEvent.setup();
    const verify = mutation();
    const reconnect = mutation();
    verify.mutateAsync.mockRejectedValue(new Error('temporary provider failure'));
    vi.mocked(useVerifyFood99SelfServiceAuthorization).mockReturnValue(verify as never);
    vi.mocked(useReconnectMarketplace).mockReturnValue(reconnect as never);
    vi.mocked(useMarketplaceConnections).mockReturnValue({
      data: [{ ...food99Connection, authType: 'food99_self_service_pending' }],
      isLoading: false, isError: false, error: null, refetch,
    } as never);

    render(<IntegrationsPage />);
    await user.click(screen.getByRole('button', { name: /Lojas conectadas/ }));
    await user.click(screen.getAllByRole('button', { name: /Verificar autoriza/ })[0]);

    await waitFor(() => expect(verify.mutateAsync).toHaveBeenCalledWith({ connectionId: 'food99-connection-1' }));
    expect(reconnect.mutateAsync).not.toHaveBeenCalled();
  });

  it('removes an abandoned pending self-service attempt without opening the manual flow', async () => {
    const user = userEvent.setup();
    const remove = mutation();
    remove.mutateAsync.mockResolvedValue({ removed: true });
    vi.mocked(useRemoveMarketplaceConnection).mockReturnValue(remove as never);
    vi.mocked(useMarketplaceConnections).mockReturnValue({
      data: [{ ...food99Connection, authType: 'food99_self_service_pending' }],
      isLoading: false, isError: false, error: null, refetch,
    } as never);

    render(<IntegrationsPage />);
    await user.click(screen.getByRole('button', { name: /Lojas conectadas/ }));
    await user.click(screen.getByRole('button', { name: /Remover tentativa/ }));

    await waitFor(() => expect(remove.mutateAsync).toHaveBeenCalledWith('food99-connection-1'));
    expect(screen.queryByRole('dialog', { name: 'Conectar 99Food' })).toBeNull();
  });

  it('completes the guided 99Food connection only after token verification succeeds', async () => {
    const user = userEvent.setup();
    const start = mutation();
    const verify = mutation();
    start.mutateAsync.mockResolvedValue({ authorizationUrl: 'https://99food.example/authorize', connection: food99Connection });
    verify.mutateAsync.mockResolvedValue({ authorized: true, connection: { ...food99Connection, status: 'CONNECTED' } });
    vi.mocked(useStartFood99SelfServiceAuthorization).mockReturnValue(start as never);
    vi.mocked(useVerifyFood99SelfServiceAuthorization).mockReturnValue(verify as never);
    vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<IntegrationsPage />);
    await user.click(screen.getAllByRole('button', { name: 'Conectar loja' })[0]);
    await user.click(screen.getByRole('button', { name: 'Autorizar na 99Food' }));
    await screen.findByText('Aguardando autorização');
    await user.click(screen.getByRole('button', { name: 'Verificar autorização' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Conectar 99Food' })).toBeNull());
    expect(verify.mutateAsync).toHaveBeenCalledWith({ connectionId: 'food99-connection-1' });
  });

  it('shows candidates instead of auto-selecting a 99Food shop', async () => {
    const user = userEvent.setup();
    const start = mutation();
    const verify = mutation();
    const bind = mutation();
    start.mutateAsync.mockResolvedValue({ authorizationUrl: 'https://99food.example/authorize', connection: food99Connection });
    verify.mutateAsync.mockResolvedValue({ authorized: false, state: 'AUTHORIZED_SHOP_SELECTION_REQUIRED', connection: food99Connection, candidates: [{ shopId: 'shop-a', shopName: 'Loja A' }, { shopId: 'shop-b', shopName: 'Loja B' }] });
    vi.mocked(useStartFood99SelfServiceAuthorization).mockReturnValue(start as never);
    vi.mocked(useVerifyFood99SelfServiceAuthorization).mockReturnValue(verify as never);
    vi.mocked(useBindFood99SelfServiceAuthorization).mockReturnValue(bind as never);
    vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<IntegrationsPage />);
    await user.click(screen.getAllByRole('button', { name: 'Conectar loja' })[0]);
    await user.click(screen.getByRole('button', { name: 'Autorizar na 99Food' }));
    await user.click(screen.getByRole('button', { name: 'Verificar autorização' }));

    expect(await screen.findByRole('button', { name: 'Loja A' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Loja B' })).toBeTruthy();
    expect(bind.mutateAsync).not.toHaveBeenCalled();
  });

  it('keeps guided actions as non-submit buttons', async () => {
    const user = userEvent.setup();
    render(<IntegrationsPage />);
    await user.click(screen.getAllByRole('button', { name: 'Conectar loja' })[0]);
    expect(screen.getByRole('button', { name: 'Autorizar na 99Food' }).getAttribute('type')).toBe('button');
  });

  it('only reveals the manual 99Food support fields after the fallback is expanded', async () => {
    const user = userEvent.setup();
    render(<IntegrationsPage />);
    await user.click(screen.getAllByRole('button', { name: 'Conectar loja' })[0]);

    expect(screen.queryByLabelText('ID da loja na 99Food (shop_id)')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Conexão manual para suporte' }));
    expect(screen.getByLabelText('ID da loja na 99Food (shop_id)')).toBeTruthy();
    expect(screen.getByLabelText('Código de vínculo (app_shop_id)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Conectar com ajuda do suporte' })).toBeTruthy();
  });
});
