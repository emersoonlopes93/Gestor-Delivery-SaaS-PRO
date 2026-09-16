import { useMemo, useState } from 'react';
import { AlertCircle, Building2, Clock3, Link2, Loader2, RefreshCw, RotateCcw, Settings2, ShieldCheck, ShoppingBag, Unplug } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
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
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Switch } from '../../components/ui/Switch';
import { useTenantCapabilities } from '../../hooks/useTenantCapabilities';
import { api } from '../../lib/api-client';

type ManualConnectForm = {
  externalMerchantId: string;
  externalStoreId: string;
  displayName: string;
};

type ProductOption = { id: string; name: string; sku?: string | null };

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(value?: string | number | null) {
  const n = typeof value === 'string' ? Number(value) : value ?? 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(n) ? n : 0);
}

function statusBadge(status?: string | null) {
  const tone = String(status || '').toUpperCase();
  if (tone.includes('TOKEN_EXPIRED')) return <Badge variant="warning" size="sm">Reautenticação necessária</Badge>;
  if (tone.includes('PAUSED')) return <Badge variant="warning" size="sm">Pausada</Badge>;
  if (tone.includes('PROCESSED') || tone === 'CONNECTED') return <Badge variant="success" size="sm">Ativo</Badge>;
  if (tone.includes('PROCESS')) return <Badge variant="warning" size="sm">Processando</Badge>;
  if (tone.includes('FAILED') || tone.includes('ERROR') || tone.includes('DISCONNECTED')) return <Badge variant="destructive" size="sm">Offline</Badge>;
  return <Badge variant="info" size="sm">{status || '—'}</Badge>;
}

function eventStatusBadge(status?: string | null) {
  const tone = String(status || '').toUpperCase();
  if (tone === 'PROCESSED') return <Badge variant="success" size="sm">Processado</Badge>;
  if (tone === 'PROCESSING' || tone === 'QUEUED' || tone === 'RECEIVED') return <Badge variant="warning" size="sm">Processando</Badge>;
  if (tone === 'FAILED') return <Badge variant="destructive" size="sm">Falhou</Badge>;
  if (tone === 'IGNORED') return <Badge variant="info" size="sm">Ignorado</Badge>;
  return <Badge variant="info" size="sm">{status || '—'}</Badge>;
}

export function IntegrationsPage() {
  const queryClient = useQueryClient();
  const { isFeatureEnabled } = useTenantCapabilities();
  const canManageIfood = isFeatureEnabled('ifood_marketplace');
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualProvider, setManualProvider] = useState<'ifood' | '99food'>('ifood');
  const [manualForm, setManualForm] = useState<ManualConnectForm>({
    externalMerchantId: '',
    externalStoreId: '',
    displayName: 'iFood',
  });
  const [catalogMappingForm, setCatalogMappingForm] = useState({
    connectionId: '', externalItemId: '', externalItemName: '', externalReferenceId: '', productId: '',
  });

  const { data: status, isLoading: loadingStatus, refetch: refetchStatus } = useMarketplaceStatus('ifood', canManageIfood);
  const { data: connections, isLoading: loadingConnections, isError: connectionsError, error: connectionsErrorObj, refetch: refetchConnections } = useMarketplaceConnections();
  const { data: orders = [], isLoading: loadingOrders, isError: ordersError, error: ordersErrorObj, refetch: refetchOrders } = useMarketplaceOrders();
  const { data: events = [], isLoading: loadingEvents, isError: eventsError, error: eventsErrorObj, refetch: refetchEvents } = useMarketplaceEvents();
  const { data: catalogMappings = [], isLoading: loadingCatalogMappings } = useMarketplaceCatalogMappings();
  const { data: catalogMappingCandidates = [], isLoading: loadingCatalogMappingCandidates } = useMarketplaceCatalogMappingCandidates();
  const { data: catalogProducts = [] } = useQuery({
    queryKey: ['marketplace-catalog-products'],
    queryFn: async () => (await api.get<ProductOption[]>('/catalog/products')).data ?? [],
  });
  const { data: billingPreview } = useBillingPreview();

  const connectMutation = useConnectMarketplaceManual('ifood');
  const connectFood99Mutation = useConnectMarketplaceManual('99food');
  const disconnectMutation = useDisconnectMarketplace();
  const reconnectMutation = useReconnectMarketplace();
  const reprocessEventMutation = useReprocessMarketplaceEvent();
  const reprocessOrderMutation = useReprocessMarketplaceOrder();
  const food99Authorization = useFood99AuthorizationUrl();
  const upsertCatalogMapping = useUpsertMarketplaceCatalogMapping();

  const activeConnection = useMemo(() => status ?? connections?.find((c) => c.provider === 'ifood') ?? null, [status, connections]);
  const isBillingEnabled = Boolean(billingPreview?.includedChannels?.includes('marketplace_ifood'));

  const includedChannels = billingPreview?.includedChannels ?? [];
  const visibleConnections = useMemo(
    () => connections?.filter((connection) => canManageIfood || connection.provider !== 'ifood') ?? [],
    [canManageIfood, connections],
  );
  const visibleEvents = useMemo(
    () => events.filter((event) => canManageIfood || event.provider !== 'ifood'),
    [canManageIfood, events],
  );
  const visibleOrders = useMemo(
    () => orders.filter((order) => canManageIfood || order.provider !== 'ifood'),
    [canManageIfood, orders],
  );

  const refreshMarketplace = () => Promise.all([
    ...(canManageIfood ? [refetchStatus()] : []),
    refetchConnections(),
    refetchOrders(),
    refetchEvents(),
  ]);

  const handleCatalogMappingSave = async () => {
    if (!catalogMappingForm.connectionId || !catalogMappingForm.externalItemId.trim() || !catalogMappingForm.productId) {
      toast.error('Selecione a conexão, informe o ID externo e escolha o produto canônico.');
      return;
    }
    try {
      await upsertCatalogMapping.mutateAsync({
        connectionId: catalogMappingForm.connectionId,
        externalItemId: catalogMappingForm.externalItemId.trim(),
        externalItemName: catalogMappingForm.externalItemName.trim() || undefined,
        externalReferenceId: catalogMappingForm.externalReferenceId.trim() || undefined,
        productId: catalogMappingForm.productId,
      });
      toast.success('Mapping de catálogo salvo e sincronizado.');
      setCatalogMappingForm({ connectionId: '', externalItemId: '', externalItemName: '', externalReferenceId: '', productId: '' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar mapping de catálogo.');
    }
  };

  const handleManualConnect = async () => {
    if (manualProvider === 'ifood' && !canManageIfood) {
      toast.error('A integração iFood não está habilitada para este tenant.');
      return;
    }
    if (!manualForm.externalMerchantId.trim() || !manualForm.externalStoreId.trim()) {
      toast.error('Preencha merchant e store id para criar a conexão manual.');
      return;
    }

    try {
      const selectedMutation = manualProvider === '99food' ? connectFood99Mutation : connectMutation;
      await selectedMutation.mutateAsync({
        externalMerchantId: manualForm.externalMerchantId.trim(),
        externalStoreId: manualForm.externalStoreId.trim(),
        displayName: manualForm.displayName.trim() || (manualProvider === '99food' ? '99Food' : 'iFood'),
        authType: manualProvider === '99food' ? 'oauth2_client_credentials' : 'manual',
        settingsJson: {
          autoConfirmOrders: false,
          pollingFallbackEnabled: manualProvider === '99food',
          presenceMode: manualProvider === '99food' ? 'POLLING' : 'WEBHOOK',
          importAsStatus: 'pending',
        },
      });
      toast.success(`Conexão ${manualProvider === '99food' ? '99Food' : 'iFood'} atualizada.`);
      setShowManualForm(false);
      setManualForm({ externalMerchantId: '', externalStoreId: '', displayName: manualProvider === '99food' ? '99Food' : 'iFood' });
      await refreshMarketplace();
      queryClient.invalidateQueries({ queryKey: ['marketplace-billing-preview'] });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao conectar o marketplace.';
      toast.error(message);
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    try {
      await disconnectMutation.mutateAsync(connectionId);
      toast.success('Conexão iFood desconectada.');
      if (canManageIfood) await refetchStatus();
      await refetchConnections();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao desconectar.';
      toast.error(message);
    }
  };

  const handleReconnect = async (connectionId: string) => {
    try {
      await reconnectMutation.mutateAsync(connectionId);
      toast.success('Loja iFood reconectada.');
      if (canManageIfood) await refetchStatus();
      await refetchConnections();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao reconectar.';
      toast.error(message);
    }
  };

  const channelLabel = isBillingEnabled ? 'Incluído no billing' : 'Excluído do billing';
  const channelTone = isBillingEnabled ? 'success' : 'warning';
  const sections = [
    ...(canManageIfood ? [{ id: 'ifood', label: 'iFood', provider: 'ifood' as const, comingSoon: false }] : []),
    { id: 'rappi', label: 'Rappi', provider: 'rappi' as const, comingSoon: true },
    { id: 'ubereats', label: 'Uber Eats', provider: 'ubereats' as const, comingSoon: true },
    { id: '99food', label: '99Food', provider: '99food' as const, comingSoon: false },
  ];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Integrações Marketplace"
        description="Central de conexão, ingestão e acompanhamento dos marketplaces deste tenant."
        icon={Link2}
        action={
          <button
            type="button"
            onClick={refreshMarketplace}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {canManageIfood ? <Card className="p-6 xl:col-span-2 space-y-5">
          {connectionsError || ordersError || eventsError ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
              <div className="font-black">Falha ao carregar marketplace</div>
              <div className="mt-1 text-sm opacity-90">
                {(connectionsErrorObj as Error | undefined)?.message ||
                  (ordersErrorObj as Error | undefined)?.message ||
                  (eventsErrorObj as Error | undefined)?.message ||
                  'Não foi possível carregar os dados da integração.'}
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="info" size="sm">iFood</Badge>
            {statusBadge(activeConnection?.status)}
            {loadingStatus ? <Badge variant="info" size="sm">Carregando</Badge> : null}
          </div>
              <h2 className="text-xl font-black text-foreground">Status da conexão</h2>
              <p className="text-sm text-muted-foreground">
                Conexão manual, importação de pedidos e reprocessamento de inbox em um só lugar.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setManualProvider('ifood');
                  setManualForm({ externalMerchantId: '', externalStoreId: '', displayName: 'iFood' });
                  setShowManualForm((v) => !v);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground hover:bg-primary/90 transition-all"
              >
                <Settings2 className="w-4 h-4" />
                {showManualForm ? 'Fechar' : 'Adicionar loja iFood'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setManualProvider('99food');
                  setManualForm({ externalMerchantId: '', externalStoreId: '', displayName: '99Food' });
                  setShowManualForm(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-black text-foreground hover:bg-muted transition-all"
              >
                <Settings2 className="w-4 h-4" />
                Adicionar loja 99Food
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Merchant / Loja</div>
              <div className="mt-2 text-sm font-bold text-foreground break-words">{activeConnection?.externalMerchantId || 'Não informado'}</div>
            </div>
            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Store ID</div>
              <div className="mt-2 text-sm font-bold text-foreground break-words">{activeConnection?.externalStoreId || 'Não informado'}</div>
            </div>
            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Display name</div>
              <div className="mt-2 text-sm font-bold text-foreground break-words">{activeConnection?.displayName || 'iFood'}</div>
            </div>
            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Última atualização</div>
              <div className="mt-2 text-sm font-bold text-foreground">{formatDateTime(activeConnection?.updatedAt)}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-border p-4 bg-card space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">Billing</div>
                <div className="text-sm font-bold text-foreground">{channelLabel}</div>
              </div>
              <Badge variant={channelTone} size="sm">
                {includedChannels.length > 0 ? includedChannels.join(', ') : 'Sem preview disponível'}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3">
              <div>
                <div className="text-sm font-bold text-foreground">Marketplace iFood entra na cobrança</div>
                <div className="text-xs text-muted-foreground">
                  A regra final continua no SaaS Admin. Aqui mostramos o estado atual do preview.
                </div>
              </div>
              <Switch
                checked={isBillingEnabled}
                onCheckedChange={() => undefined}
                disabled
                aria-label="Marketplace iFood incluído na cobrança"
                title="Configuração controlada pelo SaaS Admin"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pedidos</div>
                <div className="mt-1 text-sm font-black text-foreground">{billingPreview?.ordersCount ?? 0}</div>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Valor bruto</div>
                <div className="mt-1 text-sm font-black text-foreground">{formatCurrency(billingPreview?.grossOrdersAmount)}</div>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Faturável</div>
                <div className="mt-1 text-sm font-black text-foreground">{formatCurrency(billingPreview?.billableAmount)}</div>
              </div>
            </div>
          </div>

          {showManualForm && (
            <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-black text-foreground">
                <ShieldCheck className="w-4 h-4 text-primary" />
                Adicionar loja {manualProvider === '99food' ? '99Food' : 'iFood'}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Merchant ID</span>
                  <input
                    value={manualForm.externalMerchantId}
                    onChange={(e) => setManualForm((prev) => ({ ...prev, externalMerchantId: e.target.value }))}
                    className="input-premium"
                    placeholder="merchant..."
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Store ID</span>
                  <input
                    value={manualForm.externalStoreId}
                    onChange={(e) => setManualForm((prev) => ({ ...prev, externalStoreId: e.target.value }))}
                    className="input-premium"
                    placeholder="store..."
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nome exibido</span>
                  <input
                    value={manualForm.displayName}
                    onChange={(e) => setManualForm((prev) => ({ ...prev, displayName: e.target.value }))}
                    className="input-premium"
                    placeholder={manualProvider === '99food' ? '99Food' : 'iFood'}
                  />
                </label>
              </div>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowManualForm(false)}
                  className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleManualConnect}
                  disabled={connectMutation.isPending || connectFood99Mutation.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {connectMutation.isPending || connectFood99Mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                  Salvar conexão
                </button>
              </div>
            </div>
          )}
        </Card> : <Card className="p-6 xl:col-span-2">
          <div className="space-y-1">
            <h2 className="text-xl font-black text-foreground">Marketplaces habilitados</h2>
            <p className="text-sm text-muted-foreground">Gerencie as conexões disponíveis para este tenant.</p>
            <button
              type="button"
              onClick={() => {
                setManualProvider('99food');
                setManualForm({ externalMerchantId: '', externalStoreId: '', displayName: '99Food' });
                setShowManualForm(true);
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-black text-foreground hover:bg-muted transition-all"
            >
              <Settings2 className="w-4 h-4" />
              Adicionar loja 99Food
            </button>
          </div>
          {showManualForm ? <div className="mt-5 rounded-2xl border border-border bg-muted/20 p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-black text-foreground"><ShieldCheck className="w-4 h-4 text-primary" />Adicionar loja 99Food</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="space-y-1"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Merchant ID</span><input value={manualForm.externalMerchantId} onChange={(e) => setManualForm((prev) => ({ ...prev, externalMerchantId: e.target.value }))} className="input-premium" placeholder="merchant..." /></label>
              <label className="space-y-1"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Store ID</span><input value={manualForm.externalStoreId} onChange={(e) => setManualForm((prev) => ({ ...prev, externalStoreId: e.target.value }))} className="input-premium" placeholder="store..." /></label>
              <label className="space-y-1"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nome exibido</span><input value={manualForm.displayName} onChange={(e) => setManualForm((prev) => ({ ...prev, displayName: e.target.value }))} className="input-premium" placeholder="99Food" /></label>
            </div>
            <div className="flex items-center justify-end gap-3"><button type="button" onClick={() => setShowManualForm(false)} className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted transition-all">Cancelar</button><button type="button" onClick={handleManualConnect} disabled={connectFood99Mutation.isPending} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all">{connectFood99Mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}Salvar conexão</button></div>
          </div> : null}
        </Card>}

        <div className="space-y-6">
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-black text-foreground">Providers</h3>
            </div>
            <div className="space-y-2">
              {sections.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/20 p-3">
                  <div>
                    <div className="text-sm font-black text-foreground">{item.label}</div>
                    <div className="text-xs text-muted-foreground">{item.comingSoon ? 'Em breve' : 'Disponível agora'}</div>
                  </div>
                  {item.id === '99food' ? (
                    <button
                      type="button"
                      disabled={food99Authorization.isPending}
                      onClick={async () => {
                        const appShopId = manualForm.externalStoreId.trim();
                        if (!appShopId) {
                          toast.error('Informe o Store ID da 99Food antes de autorizar.');
                          return;
                        }
                        try {
                          const url = await food99Authorization.mutateAsync(appShopId);
                          window.open(url, '_blank', 'noopener,noreferrer');
                          toast.success('Autorizacao 99Food aberta em uma nova aba.');
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'Credenciais 99Food indisponiveis.');
                        }
                      }}
                      className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-50"
                    >
                      {food99Authorization.isPending ? 'Abrindo...' : 'Autorizar'}
                    </button>
                  ) : item.comingSoon ? <Badge variant="info" size="sm">Em breve</Badge> : <Badge variant="success" size="sm">Ativo</Badge>}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-black text-foreground">Conexões</h3>
            </div>
            <div className="space-y-3">
              {loadingConnections ? (
                <div className="text-sm text-muted-foreground">Carregando conexões...</div>
              ) : visibleConnections.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhuma conexão encontrada.</div>
              ) : (
                visibleConnections.map((connection) => (
                  <div key={connection.id} className="rounded-2xl border border-border bg-muted/20 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-black text-foreground">{connection.displayName || connection.provider}</div>
                        <div className="text-xs text-muted-foreground">Merchant: {connection.externalMerchantId || 'não informado'}</div>
                        {connection.externalStoreId ? <div className="text-xs text-muted-foreground">Store: {connection.externalStoreId}</div> : null}
                      </div>
                      {statusBadge(connection.status)}
                    </div>
                    <div className="flex justify-end gap-2">
                      {connection.status === 'CONNECTED' ? (
                        <button
                          type="button"
                          onClick={() => handleDisconnect(connection.id)}
                          disabled={disconnectMutation.isPending}
                          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-50"
                        >
                          <Unplug className="h-3.5 w-3.5" />
                          Desconectar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleReconnect(connection.id)}
                          disabled={reconnectMutation.isPending}
                          className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          Reconectar
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Clock3 className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-black text-foreground">Resumo</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pedidos importados</div>
                <div className="mt-1 text-lg font-black text-foreground">{visibleOrders.length}</div>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Eventos inbox</div>
                <div className="mt-1 text-lg font-black text-foreground">{visibleEvents.length}</div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card className="p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-black text-foreground">Mapping de catálogo e estoque</h2>
            <p className="text-sm text-muted-foreground">Vincule o item externo ao produto canônico da loja. Sem mapping, o pedido continua operável, mas o estoque não é baixado.</p>
          </div>
          <Badge variant="info" size="sm">Atualização sem recarregar</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 rounded-2xl border border-border bg-muted/20 p-4">
          <label className="space-y-1"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Conexão</span><select value={catalogMappingForm.connectionId} onChange={(event) => setCatalogMappingForm((current) => ({ ...current, connectionId: event.target.value }))} className="input-premium"><option value="">Selecione</option>{visibleConnections.map((connection) => <option key={connection.id} value={connection.id}>{connection.displayName || connection.provider} {connection.externalStoreId ? `(${connection.externalStoreId})` : ''}</option>)}</select></label>
          <label className="space-y-1"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">ID externo</span><input value={catalogMappingForm.externalItemId} onChange={(event) => setCatalogMappingForm((current) => ({ ...current, externalItemId: event.target.value }))} className="input-premium" placeholder="app_item_id" /></label>
          <label className="space-y-1"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nome externo</span><input value={catalogMappingForm.externalItemName} onChange={(event) => setCatalogMappingForm((current) => ({ ...current, externalItemName: event.target.value }))} className="input-premium" placeholder="Opcional" /></label>
          <label className="space-y-1"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Produto canônico</span><select value={catalogMappingForm.productId} onChange={(event) => setCatalogMappingForm((current) => ({ ...current, productId: event.target.value }))} className="input-premium"><option value="">Selecione</option>{catalogProducts.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` (${product.sku})` : ''}</option>)}</select></label>
          <div className="flex items-end"><button type="button" onClick={handleCatalogMappingSave} disabled={upsertCatalogMapping.isPending} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-60">{upsertCatalogMapping.isPending ? 'Salvando...' : 'Salvar mapping'}</button></div>
        </div>
        {loadingCatalogMappingCandidates ? <div className="text-sm text-muted-foreground">Carregando itens externos pendentes...</div> : catalogMappingCandidates.length === 0 ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">Nenhum item externo pendente de mapping nas importações recentes.</div> : <div className="space-y-2"><div className="text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">Itens externos sem mapping — estoque preservado</div><div className="grid grid-cols-1 md:grid-cols-2 gap-2">{catalogMappingCandidates.map((candidate) => <button key={`${candidate.connectionId}:${candidate.externalItemId}`} type="button" onClick={() => setCatalogMappingForm((current) => ({ ...current, connectionId: candidate.connectionId, externalItemId: candidate.externalItemId, externalItemName: candidate.externalItemName ?? '' }))} className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-left hover:bg-amber-500/15"><div className="font-bold text-foreground">{candidate.externalItemName || 'Nome não informado'}</div><div className="text-xs text-muted-foreground">{candidate.provider} · {candidate.connection.displayName || candidate.connection.externalStoreId || 'Loja'} · {candidate.externalItemId}</div></button>)}</div></div>}
        {loadingCatalogMappings ? <div className="text-sm text-muted-foreground">Carregando mappings...</div> : catalogMappings.length === 0 ? <div className="text-sm text-muted-foreground">Nenhum item externo mapeado ainda.</div> : <div className="overflow-x-auto rounded-2xl border border-border"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="p-3">Provider / loja</th><th className="p-3">Item externo</th><th className="p-3">Referência</th><th className="p-3">Produto vinculado</th><th className="p-3">Status</th></tr></thead><tbody>{catalogMappings.map((mapping) => <tr key={mapping.id} className="border-t border-border"><td className="p-3 font-bold text-foreground">{mapping.connection.displayName || mapping.provider}<div className="text-xs font-normal text-muted-foreground">{mapping.connection.externalStoreId || 'Store não informada'}</div></td><td className="p-3 text-foreground">{mapping.externalItemName || 'Nome não informado'}<div className="text-xs text-muted-foreground">{mapping.externalItemId}</div></td><td className="p-3 text-muted-foreground">{mapping.externalReferenceId || '—'}</td><td className="p-3 font-bold text-foreground">{mapping.product.name}</td><td className="p-3">{mapping.status === 'ACTIVE' ? <Badge variant="success" size="sm">Mapeado</Badge> : <Badge variant="warning" size="sm">Desativado</Badge>}</td></tr>)}</tbody></table></div>}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-primary" />
              <h3 className="text-base font-black text-foreground">Eventos recentes</h3>
            </div>
            <button type="button" onClick={() => refetchEvents()} className="text-xs font-black uppercase tracking-widest text-primary hover:opacity-80">
              Recarregar
            </button>
          </div>

          {loadingEvents ? (
            <div className="text-sm text-muted-foreground">Carregando eventos...</div>
          ) : visibleEvents.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum evento importado ainda.</div>
          ) : (
            <div className="space-y-3">
              {visibleEvents.slice(0, 8).map((event) => (
                <div key={event.id} className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="space-y-1">
                      <div className="text-sm font-black text-foreground break-words">{event.eventId || event.externalOrderId || event.id}</div>
                      <div className="text-xs text-muted-foreground">Recebido em {formatDateTime(event.receivedAt)}</div>
                    </div>
                    {eventStatusBadge(event.status)}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge variant="info" size="sm">{event.provider}</Badge>
                    <Badge variant="info" size="sm">Tentativas: {event.attempts}</Badge>
                    {event.lastError ? <Badge variant="destructive" size="sm">Com erro</Badge> : <Badge variant="success" size="sm">OK</Badge>}
                  </div>
                  {event.lastError ? (
                    <pre className="whitespace-pre-wrap text-xs text-foreground bg-background border border-border rounded-xl p-3 overflow-auto max-h-28">
                      {event.lastError}
                    </pre>
                  ) : null}
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => reprocessEventMutation.mutate(event.id)}
                      disabled={reprocessEventMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-all"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reprocessar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-primary" />
              <h3 className="text-base font-black text-foreground">Pedidos importados</h3>
            </div>
            <button type="button" onClick={() => refetchOrders()} className="text-xs font-black uppercase tracking-widest text-primary hover:opacity-80">
              Recarregar
            </button>
          </div>

          {loadingOrders ? (
            <div className="text-sm text-muted-foreground">Carregando pedidos...</div>
          ) : visibleOrders.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum pedido marketplace importado ainda.</div>
          ) : (
            <div className="space-y-3">
              {visibleOrders.slice(0, 8).map((order) => (
                <div key={order.id} className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="space-y-1">
                      <div className="text-sm font-black text-foreground break-words">{order.externalDisplayId || order.externalOrderId}</div>
                      <div className="text-xs text-muted-foreground">Interno: {order.internalOrderId || 'ainda não importado'}</div>
                    </div>
                    {statusBadge(order.statusInternal)}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge variant="info" size="sm">{order.provider}</Badge>
                    {order.internalOrderId ? <Badge variant="success" size="sm">Integrado</Badge> : <Badge variant="warning" size="sm">Pendente</Badge>}
                    <Badge variant="info" size="sm">{formatDateTime(order.createdAt)}</Badge>
                  </div>
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => reprocessOrderMutation.mutate(order.id)}
                      disabled={reprocessOrderMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-muted transition-all"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reprocessar pedido
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
