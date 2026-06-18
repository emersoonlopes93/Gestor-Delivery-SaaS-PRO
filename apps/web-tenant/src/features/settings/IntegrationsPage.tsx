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
  useReprocessMarketplaceEvent,
  useReprocessMarketplaceOrder,
} from '../marketplace/hooks';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';

type ManualConnectForm = {
  externalMerchantId: string;
  externalStoreId: string;
  displayName: string;
};

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
  if (tone.includes('PROCESSED') || tone.includes('CONNECTED')) return <Badge variant="success" size="sm">Ativo</Badge>;
  if (tone.includes('PROCESS')) return <Badge variant="warning" size="sm">Processando</Badge>;
  if (tone.includes('FAILED') || tone.includes('ERROR') || tone.includes('DISCONNECTED')) return <Badge variant="destructive" size="sm">Offline</Badge>;
  return <Badge variant="info" size="sm">{status || '—'}</Badge>;
}

export function IntegrationsPage() {
  const queryClient = useQueryClient();
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState<ManualConnectForm>({
    externalMerchantId: '',
    externalStoreId: '',
    displayName: 'iFood',
  });

  const { data: status, isLoading: loadingStatus, refetch: refetchStatus } = useMarketplaceStatus('ifood');
  const { data: connections, isLoading: loadingConnections, refetch: refetchConnections } = useMarketplaceConnections();
  const { data: orders = [], isLoading: loadingOrders, refetch: refetchOrders } = useMarketplaceOrders();
  const { data: events = [], isLoading: loadingEvents, refetch: refetchEvents } = useMarketplaceEvents();
  const { data: billingPreview } = useBillingPreview();

  const connectMutation = useConnectMarketplaceManual('ifood');
  const disconnectMutation = useDisconnectMarketplace('ifood');
  const reprocessEventMutation = useReprocessMarketplaceEvent();
  const reprocessOrderMutation = useReprocessMarketplaceOrder();

  const activeConnection = useMemo(() => status ?? connections?.find((c) => c.provider === 'ifood') ?? null, [status, connections]);
  const isBillingEnabled = Boolean(billingPreview?.includedChannels?.includes('marketplace_ifood'));

  const includedChannels = billingPreview?.includedChannels ?? [];

  const handleManualConnect = async () => {
    if (!manualForm.externalMerchantId.trim() || !manualForm.externalStoreId.trim()) {
      toast.error('Preencha merchant e store id para criar a conexão manual.');
      return;
    }

    try {
      await connectMutation.mutateAsync({
        externalMerchantId: manualForm.externalMerchantId.trim(),
        externalStoreId: manualForm.externalStoreId.trim(),
        displayName: manualForm.displayName.trim() || 'iFood',
        authType: 'manual',
        settingsJson: {
          autoConfirmOrders: false,
          importAsStatus: 'pending',
        },
      });
      toast.success('Conexão iFood atualizada.');
      setShowManualForm(false);
      await Promise.all([refetchStatus(), refetchConnections(), refetchOrders(), refetchEvents()]);
      queryClient.invalidateQueries({ queryKey: ['marketplace-billing-preview'] });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao conectar o marketplace.';
      toast.error(message);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectMutation.mutateAsync();
      toast.success('Conexão iFood desconectada.');
      await refetchStatus();
      await refetchConnections();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao desconectar.';
      toast.error(message);
    }
  };

  const channelLabel = isBillingEnabled ? 'Incluído no billing' : 'Excluído do billing';
  const channelTone = isBillingEnabled ? 'success' : 'warning';

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Integrações Marketplace"
        description="Central de conexão, ingestão e acompanhamento do iFood neste tenant."
        icon={Link2}
        action={
          <button
            type="button"
            onClick={() => Promise.all([refetchStatus(), refetchConnections(), refetchOrders(), refetchEvents()])}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="p-6 xl:col-span-2 space-y-5">
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
                onClick={() => setShowManualForm((v) => !v)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground hover:bg-primary/90 transition-all"
              >
                <Settings2 className="w-4 h-4" />
                {showManualForm ? 'Fechar' : 'Conectar manualmente'}
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnectMutation.isPending || !activeConnection}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {disconnectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unplug className="w-4 h-4" />}
                Desconectar
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
              <div>
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
              <button
                type="button"
                disabled
                className={`relative inline-flex h-8 w-14 items-center rounded-full border transition-colors ${isBillingEnabled ? 'bg-primary border-primary' : 'bg-muted border-border'}`}
                title="Configuração controlada pelo SaaS Admin"
              >
                <span className={`inline-block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${isBillingEnabled ? 'translate-x-7' : 'translate-x-1'}`} />
              </button>
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
                Conexão manual iFood
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
                    placeholder="iFood"
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
                  disabled={connectMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {connectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                  Salvar conexão
                </button>
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-black text-foreground">Conexões</h3>
            </div>
            <div className="space-y-3">
              {loadingConnections ? (
                <div className="text-sm text-muted-foreground">Carregando conexões...</div>
              ) : (connections?.length ?? 0) === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhuma conexão encontrada.</div>
              ) : (
                connections?.map((connection) => (
                  <div key={connection.id} className="rounded-2xl border border-border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-black text-foreground">{connection.displayName || connection.provider}</div>
                        <div className="text-xs text-muted-foreground">{connection.externalStoreId || connection.externalMerchantId || 'Sem IDs externos'}</div>
                      </div>
                      {statusBadge(connection.status)}
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
                <div className="mt-1 text-lg font-black text-foreground">{orders.length}</div>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Eventos inbox</div>
                <div className="mt-1 text-lg font-black text-foreground">{events.length}</div>
              </div>
            </div>
          </Card>
        </div>
      </div>

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
          ) : events.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum evento importado ainda.</div>
          ) : (
            <div className="space-y-3">
              {events.slice(0, 8).map((event) => (
                <div key={event.id} className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="space-y-1">
                      <div className="text-sm font-black text-foreground break-words">{event.eventId || event.externalOrderId || event.id}</div>
                      <div className="text-xs text-muted-foreground">Recebido em {formatDateTime(event.receivedAt)}</div>
                    </div>
                    {statusBadge(event.status)}
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
          ) : orders.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum pedido marketplace importado ainda.</div>
          ) : (
            <div className="space-y-3">
              {orders.slice(0, 8).map((order) => (
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
