import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  MapPin,
  Package,
  RefreshCw,
  Route,
  Settings2,
  ShieldAlert,
  Truck,
  WalletCards,
  X,
} from 'lucide-react';
import type { DeliveryRunBuilderDataDTO, DeliveryRunDTO } from '@gestor/types';
import { useDeliveryRuns } from './hooks/useDeliveryRuns';
import { useSmartDispatch } from './hooks/useSmartDispatch';
import {
  DriverPayFields,
} from './components/DriverPayFields';
import { DEFAULT_DRIVER_PAY_VALUE, driverPaySummary, type DriverPayFormValue, validateDriverPay } from './components/driver-pay-form';
import { Switch } from '../../components/ui/Switch';

const RUN_LABELS: Record<DeliveryRunDTO['status'], string> = {
  PENDING_ACCEPTANCE: 'Aguardando aceite',
  ASSIGNED: 'Atribuída',
  IN_PROGRESS: 'Em andamento',
  RETURNING: 'Retornando à loja',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

const RUN_STYLES: Record<DeliveryRunDTO['status'], string> = {
  PENDING_ACCEPTANCE: 'border-status-warning/30 bg-status-warning/10 text-status-warning',
  ASSIGNED: 'border-primary/30 bg-primary/10 text-primary',
  IN_PROGRESS: 'border-status-success/30 bg-status-success/10 text-status-success',
  RETURNING: 'border-status-warning/30 bg-status-warning/10 text-status-warning',
  COMPLETED: 'border-border bg-muted text-muted-foreground',
  CANCELLED: 'border-status-danger/30 bg-status-danger/10 text-status-danger',
};

const STOP_LABELS: Record<DeliveryRunDTO['stops'][number]['status'], string> = {
  PENDING: 'Próxima',
  CURRENT: 'Parada atual',
  ARRIVED: 'Entregador chegou',
  DELIVERED: 'Entregue',
  FAILED_ATTEMPT: 'Tentativa sem sucesso',
  RETURN_TO_STORE: 'Retorno pendente',
  RETURNED_TO_STORE: 'Retornado à loja',
  CANCELLED: 'Cancelada',
};

const STOP_STYLES: Record<DeliveryRunDTO['stops'][number]['status'], string> = {
  PENDING: 'border-border bg-muted text-muted-foreground',
  CURRENT: 'border-primary/30 bg-primary/10 text-primary',
  ARRIVED: 'border-status-warning/30 bg-status-warning/10 text-status-warning',
  DELIVERED: 'border-status-success/30 bg-status-success/10 text-status-success',
  FAILED_ATTEMPT: 'border-status-warning/30 bg-status-warning/10 text-status-warning',
  RETURN_TO_STORE: 'border-status-warning/30 bg-status-warning/10 text-status-warning',
  RETURNED_TO_STORE: 'border-status-success/30 bg-status-success/10 text-status-success',
  CANCELLED: 'border-status-danger/30 bg-status-danger/10 text-status-danger',
};

function messageFrom(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Não foi possível concluir a operação.';
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6" aria-label="Carregando logística">
      <div className="h-16 animate-pulse rounded-xl bg-muted" />
      <div className="h-24 animate-pulse rounded-xl border border-border bg-card" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
        <div className="h-96 animate-pulse rounded-xl border border-border bg-card" />
        <div className="h-80 animate-pulse rounded-xl border border-border bg-card" />
      </div>
      <span className="sr-only">Carregando logística...</span>
    </div>
  );
}

export function DispatchPage() {
  const {
    builder,
    activeRuns,
    settings,
    isLoading,
    isError,
    createRun,
    isCreating,
    reorderStops,
    updateSettings,
    paySettings,
    isPaySettingsLoading,
    isPaySettingsError,
    updatePaySettings,
    isUpdatingPaySettings,
  } = useDeliveryRuns();
  const smartDispatch = useSmartDispatch();
  const [driverId, setDriverId] = useState('');
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [payValue, setPayValue] = useState<DriverPayFormValue>(DEFAULT_DRIVER_PAY_VALUE);
  const [payError, setPayError] = useState<string | null>(null);
  const [isPayEditorOpen, setIsPayEditorOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [smartFeedback, setSmartFeedback] = useState<string | null>(null);
  const [overrideRun, setOverrideRun] = useState<DeliveryRunDTO | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const overrideReasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!overrideRun) return undefined;
    overrideReasonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !smartDispatch.isOverridingKds) setOverrideRun(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [overrideRun, smartDispatch.isOverridingKds]);

  useEffect(() => {
    if (!paySettings) return;
    setPayValue({
      mode: paySettings.mode,
      dailyRate: paySettings.dailyRate,
      fixedAmount: paySettings.fixedAmount,
      percentage: paySettings.percentage,
      rateTable: paySettings.rateTable.length > 0 ? paySettings.rateTable : [{ upToKm: null, amount: 0 }],
      payFailedAttempt: paySettings.payFailedAttempt,
    });
  }, [paySettings]);

  useEffect(() => {
    const eligible = new Set(builder.orders.map((order) => order.id));
    setOrderIds((current) => current.filter((id) => eligible.has(id)));
    if (driverId && !builder.drivers.some((driver) => driver.id === driverId)) setDriverId('');
  }, [builder.drivers, builder.orders, driverId]);

  const selectedOrders = orderIds
    .map((id) => builder.orders.find((order) => order.id === id))
    .filter((order): order is DeliveryRunBuilderData => Boolean(order));

  const toggleOrder = (orderId: string) => {
    setOrderIds((current) => current.includes(orderId)
      ? current.filter((id) => id !== orderId)
      : [...current, orderId]);
  };

  const moveSelected = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= orderIds.length) return;
    setOrderIds((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const submitRun = async () => {
    if (!driverId || orderIds.length === 0) return;
    setFeedback(null);
    try {
      await createRun({ driverId, orderIds });
      setDriverId('');
      setOrderIds([]);
      setFeedback('Rota criada e atribuída ao entregador.');
    } catch (error: unknown) {
      setFeedback(messageFrom(error));
    }
  };

  const acceptSuggestion = async () => {
    const suggestion = smartDispatch.suggestion;
    if (!suggestion?.driver || suggestion.orderIds.length === 0) return;
    setSmartFeedback(null);
    try {
      await smartDispatch.accept({ driverId: suggestion.driver.driverId, orderIds: suggestion.orderIds });
      setSmartFeedback('Sugestão aceita. A rota foi criada com a fila revalidada.');
    } catch (error: unknown) {
      setSmartFeedback(messageFrom(error));
      await smartDispatch.refresh();
    }
  };

  const openManualBuilder = () => {
    document.getElementById('route-builder-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('delivery-run-driver')?.focus();
  };

  const submitKdsOverride = async () => {
    const reason = overrideReason.trim();
    if (!overrideRun || !reason) {
      setOverrideError('Informe por que esta rota pode sair antes da liberação da cozinha.');
      return;
    }
    setOverrideError(null);
    try {
      await smartDispatch.overrideKds({ runId: overrideRun.id, reason });
      setFeedback('Saída excepcional liberada para esta rota.');
      setOverrideRun(null);
      setOverrideReason('');
    } catch (error: unknown) {
      setOverrideError(messageFrom(error));
    }
  };

  const savePaySettings = async () => {
    const validationError = validateDriverPay(payValue);
    if (validationError) {
      setPayError(validationError);
      return;
    }
    setPayError(null);
    try {
      await updatePaySettings(payValue);
      setFeedback('Regra de pagamento dos entregadores atualizada.');
      setIsPayEditorOpen(false);
    } catch (error: unknown) {
      setPayError(messageFrom(error));
    }
  };

  const moveFutureStop = async (run: DeliveryRunDTO, stopId: string, direction: -1 | 1) => {
    const future = run.stops.filter((stop) => stop.status === 'PENDING');
    const index = future.findIndex((stop) => stop.id === stopId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= future.length) return;
    const stopIds = future.map((stop) => stop.id);
    [stopIds[index], stopIds[target]] = [stopIds[target], stopIds[index]];
    setFeedback(null);
    try {
      await reorderStops({ runId: run.id, stopIds, expectedVersion: run.version });
      setFeedback('Sequência futura atualizada.');
    } catch (error: unknown) {
      setFeedback(messageFrom(error));
    }
  };

  if (isLoading) return <LoadingState />;
  if (isError) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-status-danger/30 bg-status-danger/10 p-5 text-status-danger">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">Erro ao carregar rotas de entrega</p>
            <p className="mt-1 text-sm">Verifique sua conexão e atualize a página para tentar novamente.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto flex h-full max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
            <CircleDot className="h-3.5 w-3.5" /> Central de despacho
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">Rotas de entrega</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Monte uma sequência manual com um ou mais pedidos e acompanhe a rota completa.
          </p>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-card shadow-card">
          <div className="px-3 py-2 text-center sm:px-4">
            <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Livres</dt>
            <dd className="text-lg font-black text-foreground">{builder.drivers.length}</dd>
          </div>
          <div className="px-3 py-2 text-center sm:px-4">
            <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Pedidos</dt>
            <dd className="text-lg font-black text-foreground">{builder.orders.length}</dd>
          </div>
          <div className="px-3 py-2 text-center sm:px-4">
            <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Em rota</dt>
            <dd className="text-lg font-black text-foreground">{activeRuns.length}</dd>
          </div>
        </dl>
      </header>

      {feedback && (
        <div role="status" className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm font-medium text-foreground">
          <Check className="h-4 w-4 shrink-0 text-primary" />
          {feedback}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-card" aria-labelledby="assisted-dispatch-title">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-primary/10 p-2 text-primary"><Bot className="h-5 w-5" /></span>
            <div>
              <h2 id="assisted-dispatch-title" className="font-bold text-foreground">Despacho assistido</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">A loja confirma a sugestão; a fila é revalidada antes de criar a rota.</p>
            </div>
          </div>
          <button type="button" onClick={() => void smartDispatch.refresh()} disabled={smartDispatch.isRefreshing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-bold text-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${smartDispatch.isRefreshing ? 'animate-spin' : ''}`} />
            {smartDispatch.isRefreshing ? 'Atualizando...' : 'Atualizar sugestão'}
          </button>
        </div>

        <div className="p-4 sm:p-5" aria-live="polite">
          {smartDispatch.isLoading ? (
            <div aria-label="Carregando sugestão de despacho" className="space-y-3"><div className="h-16 animate-pulse rounded-lg bg-muted" /><div className="h-11 animate-pulse rounded-lg bg-muted" /></div>
          ) : smartDispatch.isError ? (
            <div role="alert" className="flex flex-col gap-3 rounded-lg border border-status-danger/30 bg-status-danger/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-status-danger">Não foi possível consultar a fila agora. O despacho manual continua disponível.</p>
              <button type="button" onClick={() => void smartDispatch.refresh()} className="min-h-11 rounded-lg border border-status-danger/30 px-3 text-sm font-bold text-status-danger">Tentar novamente</button>
            </div>
          ) : smartDispatch.suggestion?.manualFallback || !smartDispatch.suggestion?.driver ? (
            <div className="flex flex-col gap-4 rounded-lg border border-dashed border-border bg-muted/20 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-bold text-foreground">Sem sugestão segura agora</p><p className="mt-1 text-sm text-muted-foreground">Monte a rota manualmente enquanto a fila aguarda um entregador elegível.</p></div>
              <button type="button" onClick={openManualBuilder} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground">Usar montagem manual</button>
            </div>
          ) : (
            <div className="space-y-4">
              {smartDispatch.suggestion.queue[0]?.driverId !== smartDispatch.suggestion.driver.driverId && (
                <div className="flex items-start gap-3 border-l-4 border-status-warning bg-status-warning/10 px-4 py-3 text-sm text-foreground">
                  <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
                  <p><strong>A fila foi preservada.</strong> A posição 1 foi pulada temporariamente por não estar elegível agora e mantém seu lugar.</p>
                </div>
              )}
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">Sugestão atual</p>
                  <p className="mt-1 text-xl font-black text-foreground">{smartDispatch.suggestion.driver.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Posição {smartDispatch.suggestion.driver.queuePosition} na fila
                    {smartDispatch.suggestion.driver.distanceKm === null ? '' : ` · ${smartDispatch.suggestion.driver.distanceKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km da loja`}
                  </p>
                  <p className="mt-3 text-sm text-foreground"><strong>Pedidos:</strong> {smartDispatch.suggestion.orderIds.map((id) => builder.orders.find((order) => order.id === id)?.orderNumber).filter(Boolean).map((number) => `#${number}`).join(', ') || `${smartDispatch.suggestion.orderIds.length} selecionado(s)`}</p>
                  {smartDispatch.isStale && <p className="mt-2 text-xs font-semibold text-status-warning">A operação pode ter mudado. Atualize antes de confirmar.</p>}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  <button type="button" onClick={() => void acceptSuggestion()} disabled={smartDispatch.isAccepting || smartDispatch.isStale} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{smartDispatch.isAccepting ? 'Revalidando fila...' : 'Usar esta sugestão'}</button>
                  <button type="button" onClick={openManualBuilder} disabled={smartDispatch.isAccepting} className="min-h-11 rounded-lg border border-border px-4 text-sm font-bold text-foreground hover:bg-muted">Montar manualmente</button>
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <button type="button" aria-expanded={isQueueOpen} aria-controls="smart-dispatch-queue" onClick={() => setIsQueueOpen((open) => !open)} className="flex min-h-11 w-full items-center justify-between text-left text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  Ver fila de entregadores ({smartDispatch.suggestion.queue.length})
                  <ChevronDown className={`h-4 w-4 transition ${isQueueOpen ? 'rotate-180' : ''}`} />
                </button>
                {isQueueOpen && <ol id="smart-dispatch-queue" className="divide-y divide-border">{smartDispatch.suggestion.queue.map((driver) => <li key={driver.driverId} className="flex min-h-11 items-center gap-3 py-2 text-sm"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted font-black text-foreground">{driver.queuePosition}</span><span className="min-w-0 flex-1 truncate font-semibold text-foreground">{driver.name}</span><span className={`text-xs font-bold ${driver.status === 'eligible' ? 'text-status-success' : 'text-status-warning'}`}>{driver.status === 'eligible' ? 'Elegível' : driver.status === 'bypassed_distance' ? 'Distante agora' : driver.status === 'bypassed_stale_location' ? 'Localização indisponível' : 'Indisponível'}</span></li>)}</ol>}
              </div>
            </div>
          )}
          {smartFeedback && <p role="status" className="mt-3 text-sm font-semibold text-foreground">{smartFeedback}</p>}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card shadow-card" aria-labelledby="route-settings-title">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-muted p-2 text-muted-foreground">
              <Settings2 className="h-4 w-4" />
            </span>
            <div>
              <h2 id="route-settings-title" className="font-bold text-foreground">Aceite do entregador</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Se desligado, novas rotas são aceitas automaticamente ao atribuir.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-bold text-foreground">
            <span className="min-w-0">Exigir aceite</span>
            <Switch
              checked={settings.requiresAcceptance}
              onCheckedChange={(checked) => void updateSettings(checked)}
              aria-label="Exigir aceite do entregador"
            />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-card" aria-labelledby="driver-pay-settings-title">
        {isPaySettingsLoading ? (
          <div className="p-4 sm:p-5" aria-label="Carregando regras de pagamento">
            <div className="h-14 animate-pulse rounded-lg bg-muted" />
            <span className="sr-only">Carregando regras de pagamento...</span>
          </div>
        ) : isPaySettingsError || !paySettings ? (
          <div className="p-4 sm:p-5">
            <div role="alert" className="flex items-start gap-3 rounded-lg border border-status-danger/30 bg-status-danger/10 p-4 text-sm text-status-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Não foi possível carregar as regras de pagamento. Atualize a página para tentar novamente.
            </div>
          </div>
        ) : (
          <div>
            <div className={`flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${isPayEditorOpen ? 'border-b border-border' : ''}`}>
              <div className="flex min-w-0 items-start gap-3">
                <span className="rounded-lg bg-primary/10 p-2 text-primary"><WalletCards className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <h2 id="driver-pay-settings-title" className="font-bold text-foreground">Pagamento dos entregadores</h2>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">{driverPaySummary(payValue, paySettings.currency)}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span><strong className="text-foreground">Diária:</strong> {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: paySettings.currency }).format(payValue.dailyRate)}</span>
                    <span><strong className="text-foreground">Tentativa após chegada:</strong> {payValue.payFailedAttempt ? 'paga' : 'não paga'}</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">A taxa cobrada do cliente é independente do pagamento devido ao entregador.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setIsPayEditorOpen((open) => !open); setPayError(null); }}
                aria-expanded={isPayEditorOpen}
                aria-controls="driver-pay-editor"
                className="inline-flex w-full shrink-0 items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold text-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring sm:w-auto"
              >
                {isPayEditorOpen ? 'Fechar edição' : 'Editar regra'}
              </button>
            </div>
            {isPayEditorOpen && (
              <div id="driver-pay-editor" className="p-4 sm:p-5" aria-busy={isUpdatingPaySettings}>
                <DriverPayFields value={payValue} onChange={setPayValue} idPrefix="tenant-driver-pay" currency={paySettings.currency} disabled={isUpdatingPaySettings} scope="store" />
                {payError && <p role="alert" className="mt-3 text-sm font-semibold text-status-danger">{payError}</p>}
                <div className="mt-4 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => {
                    setPayValue({ mode: paySettings.mode, dailyRate: paySettings.dailyRate, fixedAmount: paySettings.fixedAmount, percentage: paySettings.percentage, rateTable: paySettings.rateTable.length ? paySettings.rateTable : [{ upToKm: null, amount: 0 }], payFailedAttempt: paySettings.payFailedAttempt });
                    setPayError(null);
                    setIsPayEditorOpen(false);
                  }} disabled={isUpdatingPaySettings} className="rounded-lg border border-border px-4 py-2.5 text-sm font-bold text-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60">Cancelar</button>
                  <button type="button" onClick={() => void savePaySettings()} disabled={isUpdatingPaySettings} className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card disabled:cursor-not-allowed disabled:opacity-60">
                    {isUpdatingPaySettings ? 'Salvando regra...' : 'Salvar regra de pagamento'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-card" aria-labelledby="route-builder-title">
        <div className="flex items-start gap-3 border-b border-border px-4 py-4 sm:px-5">
          <span className="rounded-lg bg-primary/10 p-2 text-primary"><Route className="h-5 w-5" /></span>
          <div>
            <h2 id="route-builder-title" className="font-bold text-foreground">Montar nova rota</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Somente entregadores online e livres aparecem aqui.</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.78fr)]">
          <div className="space-y-6 p-4 sm:p-5 lg:border-r lg:border-border">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground text-xs font-black text-background">1</span>
                <label className="text-sm font-bold text-foreground" htmlFor="delivery-run-driver">Escolha o entregador</label>
              </div>
              <select
                id="delivery-run-driver"
                value={driverId}
                onChange={(event) => setDriverId(event.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
              >
                <option value="">Selecione um entregador disponível</option>
                {builder.drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
              </select>
              {builder.drivers.length === 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /> Nenhum entregador com turno ativo está livre.</p>
              )}
            </div>

            <fieldset>
              <legend className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground text-xs font-black text-background">2</span>
                Selecione os pedidos prontos
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {builder.orders.map((order) => {
                  const selected = orderIds.includes(order.id);
                  return (
                    <label
                      key={order.id}
                      className={`group flex cursor-pointer gap-3 rounded-lg border p-3 transition focus-within:ring-2 focus-within:ring-ring ${selected ? 'border-primary bg-primary/5' : 'border-border hover:border-border-strong hover:bg-muted/50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleOrder(order.id)}
                        className="peer sr-only"
                      />
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background group-hover:border-primary/60'}`}>
                        {selected && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-foreground">Pedido {order.orderNumber}</span>
                        <span className="block truncate text-xs font-medium text-foreground/80">{order.customerName}</span>
                        <span className="mt-1.5 flex items-start gap-1 text-xs leading-relaxed text-muted-foreground">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> {order.address}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {builder.orders.length === 0 && (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-5 text-center">
                  <Package className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                  <p className="text-sm font-medium text-muted-foreground">Nenhum pedido elegível no momento.</p>
                </div>
              )}
            </fieldset>
          </div>

          <div className="flex min-h-72 flex-col bg-muted/20 p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground text-xs font-black text-background">3</span>
                Revise a sequência
              </h3>
              <span className="text-xs font-bold text-muted-foreground">{selectedOrders.length} parada(s)</span>
            </div>

            {selectedOrders.length > 0 ? (
              <ol className="relative flex-1 space-y-2 before:absolute before:bottom-5 before:left-[17px] before:top-5 before:w-px before:bg-border">
                {selectedOrders.map((order, index) => (
                  <li key={order.id} className="relative flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 shadow-sm">
                    <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-card text-xs font-black text-primary">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-foreground">Pedido {order.orderNumber}</span>
                      <span className="block truncate text-xs text-muted-foreground">{order.customerName}</span>
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => moveSelected(index, -1)} disabled={index === 0} aria-label={`Mover pedido ${order.orderNumber} para cima`} className="rounded-md border border-border p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => moveSelected(index, 1)} disabled={index === selectedOrders.length - 1} aria-label={`Mover pedido ${order.orderNumber} para baixo`} className="rounded-md border border-border p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-10 text-center">
                <Route className="mb-3 h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-bold text-foreground">A rota aparecerá aqui</p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">Selecione os pedidos e ajuste a ordem com os controles de subir e descer.</p>
              </div>
            )}

            <button
              type="button"
              onClick={() => void submitRun()}
              disabled={!driverId || orderIds.length === 0 || isCreating}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50"
            >
          {isCreating ? 'Atribuindo rota...' : `Atribuir rota com ${orderIds.length || 0} parada(s)`}
              {!isCreating && <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </section>

      <section aria-labelledby="active-runs-title" className="pt-1">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 id="active-runs-title" className="flex items-center gap-2 text-lg font-black text-foreground">
              <Truck className="h-5 w-5 text-primary" /> Rotas ativas
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Acompanhamento da operação em tempo real</p>
          </div>
          {activeRuns.length > 0 && <span className="rounded-md bg-muted px-2 py-1 text-xs font-bold text-muted-foreground">{activeRuns.length} ativa(s)</span>}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {activeRuns.map((run) => (
            <article key={run.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
              <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Truck className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-foreground">{run.driverName}</h3>
                    <p className="text-xs text-muted-foreground">{run.stops.length} entrega(s)</p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-bold ${RUN_STYLES[run.status]}`}>{RUN_LABELS[run.status]}</span>
              </div>

              <ol className="relative space-y-0 px-4 py-3 before:absolute before:bottom-8 before:left-[31px] before:top-8 before:w-px before:bg-border">
                {run.stops.map((stop) => {
                  const future = run.stops.filter((item) => item.status === 'PENDING');
                  const futureIndex = future.findIndex((item) => item.id === stop.id);
                  const canReorder = (
                    run.status === 'PENDING_ACCEPTANCE'
                    || run.status === 'ASSIGNED'
                    || run.status === 'IN_PROGRESS'
                  ) && stop.status === 'PENDING';
                  return (
                    <li key={stop.id} className="relative flex gap-3 py-2">
                      <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 bg-card text-xs font-black ${stop.status === 'CURRENT' ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>
                        {stop.sequence}
                      </span>
                      <div className={`min-w-0 flex-1 rounded-lg border p-3 ${stop.status === 'CURRENT' ? 'border-primary/30 bg-primary/5' : 'border-border bg-background'}`}>
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-foreground">Pedido {stop.orderNumber}</p>
                            <p className="truncate text-xs text-muted-foreground">{stop.customerName}</p>
                          </div>
                          {canReorder && (
                            <div className="flex shrink-0 items-center gap-1">
                              <button type="button" onClick={() => void moveFutureStop(run, stop.id, -1)} disabled={futureIndex === 0} aria-label={`Antecipar pedido ${stop.orderNumber}`} className="rounded-md border border-border p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"><ArrowUp className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => void moveFutureStop(run, stop.id, 1)} disabled={futureIndex === future.length - 1} aria-label={`Adiar pedido ${stop.orderNumber}`} className="rounded-md border border-border p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"><ArrowDown className="h-3.5 w-3.5" /></button>
                            </div>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className={`rounded-md border px-2 py-0.5 font-bold ${STOP_STYLES[stop.status]}`}>{STOP_LABELS[stop.status]}</span>
                          {stop.cancellationReason && <span className="font-medium text-status-danger">{stop.cancellationReason}</span>}
                          {stop.failureReason && <span className="font-medium text-status-warning">{stop.failureReason}</span>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {run.status === 'ASSIGNED' && run.kds?.blocked && !run.kds.overrideApplied && (
                <div className="border-t border-status-warning/30 bg-status-warning/10 px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-2 text-sm text-foreground"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" /><p><strong>Aguardando cozinha.</strong> {run.kds.blockingOrdersCount} {run.kds.blockingOrdersCount === 1 ? 'pedido ainda está' : 'pedidos ainda estão'} em preparo: {run.kds.blockingOrderNumbers.map((number) => `#${number}`).join(', ')}.</p></div>
                    <button type="button" onClick={() => { setOverrideRun(run); setOverrideReason(''); setOverrideError(null); }} className="min-h-11 shrink-0 rounded-lg border border-status-warning/40 px-3 text-sm font-bold text-foreground hover:bg-status-warning/10 focus:outline-none focus:ring-2 focus:ring-ring">Liberar excepcionalmente</button>
                  </div>
                </div>
              )}
              {run.status === 'ASSIGNED' && run.kds?.overrideApplied && (
                <p className="border-t border-status-success/30 bg-status-success/10 px-4 py-3 text-sm font-semibold text-foreground"><Check className="mr-2 inline h-4 w-4 text-status-success" />Saída excepcional liberada para esta rota.</p>
              )}

              {run.status !== 'PENDING_ACCEPTANCE' && run.status !== 'ASSIGNED' && (
                <p className="border-t border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">Pedidos não podem ser adicionados depois que a rota inicia.</p>
              )}
            </article>
          ))}
        </div>

        {activeRuns.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center shadow-card">
            <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground"><Package className="h-5 w-5" /></span>
            <p className="font-bold text-foreground">Nenhuma rota ativa</p>
            <p className="mt-1 text-sm text-muted-foreground">As próximas rotas criadas aparecerão aqui para acompanhamento.</p>
          </div>
        )}
      </section>

      {overrideRun && (
        <div role="presentation" className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !smartDispatch.isOverridingKds) setOverrideRun(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="kds-override-title" className="w-full max-w-lg rounded-t-2xl border border-border bg-card p-5 shadow-xl sm:rounded-xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-wider text-status-warning">Exceção operacional</p><h2 id="kds-override-title" className="mt-1 text-xl font-black text-foreground">Liberar rota antes da cozinha?</h2></div>
              <button type="button" aria-label="Fechar" disabled={smartDispatch.isOverridingKds} onClick={() => setOverrideRun(null)} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Esta liberação vale somente para a rota de {overrideRun.driverName}. O motivo fica registrado para auditoria da loja.</p>
            <label htmlFor="kds-override-reason" className="mt-4 block text-sm font-bold text-foreground">Motivo obrigatório</label>
            <textarea ref={overrideReasonRef} id="kds-override-reason" value={overrideReason} onChange={(event) => { setOverrideReason(event.target.value); setOverrideError(null); }} disabled={smartDispatch.isOverridingKds} rows={3} maxLength={255} placeholder="Ex.: pedido será entregue em uma segunda saída" className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-60" />
            {overrideError && <p role="alert" className="mt-2 text-sm font-semibold text-status-danger">{overrideError}</p>}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" disabled={smartDispatch.isOverridingKds} onClick={() => setOverrideRun(null)} className="min-h-11 rounded-lg border border-border text-sm font-bold text-foreground hover:bg-muted disabled:opacity-50">Cancelar</button>
              <button type="button" disabled={smartDispatch.isOverridingKds || !overrideReason.trim()} onClick={() => void submitKdsOverride()} className="min-h-11 rounded-lg bg-status-warning px-3 text-sm font-bold text-background disabled:cursor-not-allowed disabled:opacity-50">{smartDispatch.isOverridingKds ? 'Liberando...' : 'Confirmar liberação'}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

type DeliveryRunBuilderData = DeliveryRunBuilderDataDTO['orders'][number];
