import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Capacitor } from '@capacitor/core';
import {
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  ChevronRight,
  MapPin,
  Navigation,
  Package,
  Phone,
  Power,
  RotateCcw,
  Truck,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  DeliveryRunStatus,
  DeliveryStopStatus,
  type DeliveryStopDTO,
} from '@gestor/types';
import { NativeNotificationBanner } from '../components/NativeNotificationBanner';
import { DriverRouteMap } from '../components/DriverRouteMap';
import { useDriverRoute } from '../hooks/useDriverRoute';
import { useDriverTracking } from '../hooks/useDriverTracking';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

const REJECTION_REASONS = [
  'Muito longe',
  'Problema com veículo',
  'Encerrando turno',
  'Outro',
] as const;

const FAILURE_REASONS = [
  'Cliente não respondeu',
  'Cliente não estava no local',
  'Endereço não localizado',
  'Cliente recusou o recebimento',
  'Outro',
] as const;

function addressText(address: Record<string, unknown> | null) {
  if (!address) return 'Endereço não informado';
  const part = (key: string) => typeof address[key] === 'string' ? address[key].trim() : '';
  const firstLine = [part('street'), part('number')].filter(Boolean).join(', ');
  return [firstLine, part('neighborhood'), part('city')].filter(Boolean).join(' — ') || 'Endereço não informado';
}

function stopStatus(stop: DeliveryStopDTO) {
  const labels: Record<DeliveryStopStatus, string> = {
    [DeliveryStopStatus.PENDING]: 'Depois',
    [DeliveryStopStatus.CURRENT]: 'Próxima',
    [DeliveryStopStatus.ARRIVED]: 'No local',
    [DeliveryStopStatus.DELIVERED]: 'Entregue',
    [DeliveryStopStatus.FAILED_ATTEMPT]: 'Não concluída',
    [DeliveryStopStatus.RETURN_TO_STORE]: 'Retorno à loja',
    [DeliveryStopStatus.RETURNED_TO_STORE]: 'Devolvido à loja',
    [DeliveryStopStatus.CANCELLED]: 'Cancelada',
  };
  return labels[stop.status];
}

function StopIcon({ status }: { status: DeliveryStopStatus }) {
  if (status === DeliveryStopStatus.DELIVERED || status === DeliveryStopStatus.RETURNED_TO_STORE) {
    return <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />;
  }
  if (status === DeliveryStopStatus.CANCELLED) {
    return <XCircle className="h-4 w-4 text-slate-400" aria-hidden="true" />;
  }
  if (status === DeliveryStopStatus.RETURN_TO_STORE) {
    return <RotateCcw className="h-4 w-4 text-amber-600" aria-hidden="true" />;
  }
  if (status === DeliveryStopStatus.CURRENT || status === DeliveryStopStatus.ARRIVED) {
    return <ChevronRight className="h-4 w-4 text-orange-600" aria-hidden="true" />;
  }
  return <span className="h-2 w-2 rounded-full bg-slate-300" aria-hidden="true" />;
}

function ChoiceList({
  choices,
  selected,
  onSelect,
}: {
  choices: readonly string[];
  selected: string;
  onSelect: (choice: string) => void;
}) {
  return (
    <div className="grid gap-2" role="radiogroup">
      {choices.map((choice) => (
        <button
          key={choice}
          type="button"
          role="radio"
          aria-checked={selected === choice}
          onClick={() => onSelect(choice)}
          className={`min-h-11 rounded-xl border px-4 py-2.5 text-left text-sm font-semibold transition-colors ${
            selected === choice
              ? 'border-orange-500 bg-orange-50 text-orange-800 dark:bg-orange-950/30 dark:text-orange-200'
              : 'border-[var(--delivery-border)] bg-[var(--delivery-card)] text-[var(--delivery-foreground)]'
          }`}
        >
          <span className="mr-2" aria-hidden="true">{selected === choice ? '●' : '○'}</span>
          {choice}
        </button>
      ))}
    </div>
  );
}

export function ActiveDeliveryPage() {
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const {
    shift,
    activeRun,
    trackingRequired,
    isLoading,
    isMutating,
    error: routeError,
    refresh,
    startShift,
    endShift,
    acceptRun,
    rejectRun,
    startRun: mutateStartRun,
    markArrived,
    completeStop,
    markFailed,
    confirmReturn,
    completeRun,
  } = useDriverRoute();
  const {
    isTracking,
    startTracking,
    stopTracking,
    error: trackingError,
    lastLocation,
    lastDeliveryEvent,
    lastRouteEvent,
  } = useDriverTracking();
  const {
    permissionState,
    isSubscribed,
    isLoading: pushLoading,
    requestPermissionAndSubscribe,
    unsubscribe: unsubscribePush,
    cleanupForLogout: cleanupPushForLogout,
  } = usePushNotifications();

  const [notice, setNotice] = useState<string | null>(null);
  const [blockingMessage, setBlockingMessage] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showFailure, setShowFailure] = useState(false);
  const [failureReason, setFailureReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [logoutLoading, setLogoutLoading] = useState(false);
  const wasTrackingRequiredRef = useRef(false);

  const showPushBanner = permissionState !== 'unsupported' && permissionState !== 'denied' && !isSubscribed;
  const orderedStops = useMemo(
    () => [...(activeRun?.stops ?? [])].sort((left, right) => left.sequence - right.sequence),
    [activeRun?.stops],
  );
  const currentStop = orderedStops.find((stop) =>
    stop.status === DeliveryStopStatus.CURRENT || stop.status === DeliveryStopStatus.ARRIVED,
  );
  const returns = orderedStops.filter((stop) => stop.status === DeliveryStopStatus.RETURN_TO_STORE);
  const nativePlatform = Capacitor.isNativePlatform();

  useEffect(() => {
    if (trackingRequired && !isTracking) {
      void startTracking();
    } else if (!trackingRequired && wasTrackingRequiredRef.current && isTracking) {
      stopTracking();
    }
    wasTrackingRequiredRef.current = trackingRequired;
  }, [isTracking, startTracking, stopTracking, trackingRequired]);

  useEffect(() => {
    if (!lastDeliveryEvent) return;
    if (lastDeliveryEvent.type === 'delivery.cancelled') {
      setNotice('Pedido cancelado. Esta entrega não precisa mais ser realizada. Sua rota foi atualizada.');
    } else if (lastDeliveryEvent.type === 'delivery.assigned') {
      setNotice(`Nova entrega #${lastDeliveryEvent.orderNumber} atribuída a você.`);
    } else {
      setNotice(`A entrega #${lastDeliveryEvent.orderNumber} foi atualizada.`);
    }
    void refresh();
  }, [lastDeliveryEvent, refresh]);

  useEffect(() => {
    if (!lastRouteEvent) return;
    if (lastRouteEvent.change === 'reordered') {
      setNotice('Sua rota foi atualizada. A ordem das próximas entregas mudou.');
    } else if (lastRouteEvent.change === 'cancelled') {
      setNotice('Pedido cancelado. Esta entrega não precisa mais ser realizada. Sua rota foi atualizada.');
    } else if (lastRouteEvent.type === 'delivery.run_assigned') {
      setNotice('Uma nova rota chegou para você.');
    } else {
      setNotice('Sua rota foi atualizada.');
    }
    void refresh();
  }, [lastRouteEvent, refresh]);

  const runAction = async (action: () => Promise<boolean>, successMessage?: string) => {
    setBlockingMessage(null);
    const succeeded = await action();
    if (succeeded && successMessage) setNotice(successMessage);
    return succeeded;
  };

  const handleEndShift = async () => {
    if (activeRun) {
      setBlockingMessage('Você ainda está em rota. Finalize suas entregas ou devolva os pedidos pendentes antes de encerrar o turno.');
      return;
    }
    await runAction(endShift, 'Turno encerrado. Até a próxima!');
  };

  const startRun = async (runId: string) => {
    if (!isTracking && !(await startTracking())) {
      setBlockingMessage('A localização é necessária para iniciar a rota. Ative a permissão de localização e o GPS para continuar.');
      return false;
    }
    return mutateStartRun(runId);
  };

  const handleLogout = async () => {
    setLogoutLoading(true);
    setBlockingMessage(null);
    try {
      await api.post('/auth/driver/logout');
      stopTracking();
      await cleanupPushForLogout();
      clearSession();
      navigate('/login');
    } catch (requestError) {
      const serverMessage = axios.isAxiosError(requestError) && typeof requestError.response?.data?.message === 'string'
        ? requestError.response.data.message
        : null;
      setBlockingMessage(serverMessage ?? 'Você ainda está trabalhando. Finalize sua rota ou encerre seu turno antes de sair.');
    } finally {
      setLogoutLoading(false);
    }
  };

  const handleReject = async () => {
    if (!activeRun || !rejectReason) return;
    const reason = rejectReason === 'Outro' ? customReason.trim() : rejectReason;
    if (!reason) return;
    if (await runAction(() => rejectRun(activeRun.id, reason), 'Rota recusada. A loja foi avisada.')) {
      setShowReject(false);
      setRejectReason('');
      setCustomReason('');
    }
  };

  const handleFailure = async () => {
    if (!activeRun || !currentStop || !failureReason) return;
    const reason = failureReason === 'Outro' ? customReason.trim() : failureReason;
    if (!reason) return;
    if (await runAction(
      () => markFailed(activeRun.id, currentStop.id, reason),
      'Entrega não concluída. Este pedido deverá voltar à loja. Você pode seguir para a próxima entrega.',
    )) {
      setShowFailure(false);
      setFailureReason('');
      setCustomReason('');
    }
  };

  const callCustomer = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  return (
    <div className="delivery-shell mx-auto flex max-w-md flex-col overflow-hidden font-sans">
      <header className="relative z-10 flex min-h-16 items-center justify-between border-b border-[var(--delivery-border)] bg-[var(--delivery-card)] px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-950/40">
            <Package className="h-5 w-5 text-orange-600" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-orange-600">Minha rota</p>
            <h1 className="font-bold leading-tight text-[var(--delivery-foreground)]">Olá, {user?.name ?? 'entregador'}</h1>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={logoutLoading}
          aria-label="Sair"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[var(--delivery-muted-foreground)] transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/30"
        >
          <Power className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <NativeNotificationBanner />

      {showPushBanner && (
        <div className="mx-3 mt-3 flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 p-3 dark:border-orange-900 dark:bg-orange-950/30">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/50">
            <Bell className="h-5 w-5 text-orange-600" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800 dark:text-orange-100">Ativar alertas</p>
            <p className="text-xs text-slate-600 dark:text-orange-200/70">Receba avisos de novas rotas</p>
          </div>
          <button
            type="button"
            onClick={() => void requestPermissionAndSubscribe()}
            disabled={pushLoading}
            className="min-h-11 shrink-0 rounded-lg bg-orange-500 px-4 text-xs font-bold text-white disabled:opacity-50"
          >
            {pushLoading ? 'Ativando…' : 'Ativar'}
          </button>
        </div>
      )}
      {isSubscribed && (
        <div className="mx-3 mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 dark:border-emerald-900 dark:bg-emerald-950/30">
          <Bell className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          <p className="flex-1 text-xs font-medium text-emerald-700 dark:text-emerald-200">Alertas de entrega ativos</p>
          <button type="button" onClick={() => void unsubscribePush()} aria-label="Desativar alertas" className="flex min-h-11 min-w-11 items-center justify-center">
            <BellOff className="h-4 w-4 text-[var(--delivery-muted-foreground)]" aria-hidden="true" />
          </button>
        </div>
      )}

      <main className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {notice && (
          <div role="status" aria-live="polite" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
            {notice}
            <button type="button" onClick={() => { setNotice(null); void refresh(); }} className="mt-2 block min-h-11 font-bold text-blue-700 underline underline-offset-4 dark:text-blue-300">
              {notice.includes('ordem') ? 'Ver nova ordem' : notice.includes('não concluída') ? 'Próxima entrega' : 'Ver minha rota'}
            </button>
          </div>
        )}

        {(blockingMessage || routeError) && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
            <p className="font-bold">Você ainda está trabalhando</p>
            <p className="mt-1">{blockingMessage ?? routeError}</p>
            {activeRun && <button type="button" onClick={() => setBlockingMessage(null)} className="mt-2 min-h-11 font-bold underline underline-offset-4">Voltar para minha rota</button>}
          </div>
        )}

        <section className="rounded-2xl border border-[var(--delivery-border)] bg-[var(--delivery-card)] p-4 shadow-sm" aria-labelledby="shift-title">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p id="shift-title" className="text-sm font-bold text-[var(--delivery-foreground)]">Seu turno</p>
              <p className="mt-1 text-xs text-[var(--delivery-muted-foreground)]">
                {shift ? (activeRun ? 'Online e com rota em andamento' : 'Online para receber uma rota') : 'Você está offline'}
              </p>
            </div>
            <span className={`h-3 w-3 shrink-0 rounded-full ${shift ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
          </div>
          <button
            type="button"
            onClick={() => void (shift ? handleEndShift() : runAction(startShift, 'Turno iniciado. Você está online.'))}
            disabled={isMutating || isLoading}
            className={`mt-4 min-h-11 w-full rounded-xl px-4 text-sm font-bold transition-colors disabled:opacity-50 ${
              shift
                ? 'border border-[var(--delivery-border)] bg-[var(--delivery-muted)] text-[var(--delivery-foreground)]'
                : 'bg-emerald-600 text-white'
            }`}
          >
            {shift ? 'Encerrar turno' : 'Ficar online'}
          </button>
        </section>

        {isLoading ? (
          <div className="rounded-2xl border border-[var(--delivery-border)] bg-[var(--delivery-card)] p-8 text-center text-sm text-[var(--delivery-muted-foreground)]">Carregando sua rota…</div>
        ) : !activeRun ? (
          <section className="rounded-2xl border border-dashed border-[var(--delivery-border)] bg-[var(--delivery-card)] px-5 py-10 text-center">
            <Truck className="mx-auto h-8 w-8 text-[var(--delivery-muted-foreground)]" aria-hidden="true" />
            <h2 className="mt-3 font-bold text-[var(--delivery-foreground)]">Nenhuma rota agora</h2>
            <p className="mt-1 text-sm text-[var(--delivery-muted-foreground)]">{shift ? 'Quando uma rota chegar, ela aparecerá aqui.' : 'Fique online para começar a receber rotas.'}</p>
          </section>
        ) : (
          <>
            {activeRun.status === DeliveryRunStatus.PENDING_ACCEPTANCE && (
              <section className="rounded-2xl border border-orange-200 bg-[var(--delivery-card)] p-5 shadow-sm dark:border-orange-900">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600">Nova rota</p>
                <h2 className="mt-2 text-2xl font-black text-[var(--delivery-foreground)]">{orderedStops.length} {orderedStops.length === 1 ? 'entrega' : 'entregas'}</h2>
                <p className="mt-1 text-sm text-[var(--delivery-muted-foreground)]">Confira a ordem antes de aceitar.</p>
                {!showReject ? (
                  <div className="mt-5 grid gap-2">
                    <button type="button" disabled={isMutating} onClick={() => void runAction(() => acceptRun(activeRun.id), 'Rota aceita. Ela está pronta para começar.')} className="min-h-12 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-50">Aceitar rota</button>
                    <button type="button" disabled={isMutating} onClick={() => setShowReject(true)} className="min-h-12 rounded-xl border border-[var(--delivery-border)] px-4 text-sm font-bold text-[var(--delivery-foreground)] disabled:opacity-50">Não posso fazer esta rota</button>
                  </div>
                ) : (
                  <div className="mt-5">
                    <p className="mb-3 text-sm font-bold text-[var(--delivery-foreground)]">Por que você não pode fazer esta rota?</p>
                    <ChoiceList choices={REJECTION_REASONS} selected={rejectReason} onSelect={setRejectReason} />
                    {rejectReason === 'Outro' && <input value={customReason} onChange={(event) => setCustomReason(event.target.value)} maxLength={255} placeholder="Conte o motivo" className="mt-2 min-h-11 w-full rounded-xl border border-[var(--delivery-border)] bg-[var(--delivery-input)] px-3 text-sm text-[var(--delivery-foreground)]" />}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setShowReject(false)} className="min-h-11 rounded-xl border border-[var(--delivery-border)] text-sm font-bold">Voltar</button>
                      <button type="button" disabled={isMutating || !rejectReason || (rejectReason === 'Outro' && !customReason.trim())} onClick={() => void handleReject()} className="min-h-11 rounded-xl bg-red-600 px-3 text-sm font-bold text-white disabled:opacity-50">Confirmar</button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {activeRun.status === DeliveryRunStatus.ASSIGNED && (
              <section className="rounded-2xl border border-emerald-200 bg-[var(--delivery-card)] p-5 shadow-sm dark:border-emerald-900">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">Rota pronta</p>
                <h2 className="mt-2 text-2xl font-black text-[var(--delivery-foreground)]">{orderedStops.length} {orderedStops.length === 1 ? 'entrega' : 'entregas'}</h2>
                <p className="mt-1 text-sm text-[var(--delivery-muted-foreground)]">Inicie quando estiver pronto para sair.</p>
                <button type="button" disabled={isMutating} onClick={() => void runAction(() => startRun(activeRun.id), 'Rota iniciada. Siga para a próxima entrega.')} className="mt-5 min-h-12 w-full rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50">Iniciar rota</button>
              </section>
            )}

            {(activeRun.status === DeliveryRunStatus.IN_PROGRESS
              || activeRun.status === DeliveryRunStatus.RETURNING) && (
              <DriverRouteMap
                status={activeRun.status}
                stops={orderedStops}
                currentStop={currentStop}
                currentPosition={lastLocation}
                origin={activeRun.origin}
                nativePlatform={nativePlatform}
                addressText={addressText}
              />
            )}

            {activeRun.status === DeliveryRunStatus.IN_PROGRESS && currentStop && (
              <section className="overflow-hidden rounded-2xl border border-orange-200 bg-[var(--delivery-card)] shadow-sm dark:border-orange-900">
                <div className="bg-orange-500 px-5 py-4 text-white">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-100">Próxima entrega</p>
                  <h2 className="mt-1 text-xl font-black">Pedido #{currentStop.orderNumber}</h2>
                </div>
                <div className="p-5">
                  <p className="font-bold text-[var(--delivery-foreground)]">{currentStop.customerName}</p>
                  <p className="mt-2 flex items-start gap-2 text-sm text-[var(--delivery-muted-foreground)]"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />{addressText(currentStop.address)}</p>
                  {currentStop.customerPhone && <button type="button" onClick={() => callCustomer(currentStop.customerPhone)} className="mt-3 flex min-h-11 items-center gap-2 text-sm font-bold text-blue-600"><Phone className="h-4 w-4" aria-hidden="true" />Ligar para o cliente</button>}
                  {currentStop.status === DeliveryStopStatus.CURRENT ? (
                    <button type="button" disabled={isMutating} onClick={() => void runAction(() => markArrived(activeRun.id, currentStop.id), 'Chegada registrada. Confirme a entrega quando finalizar.')} className="mt-4 min-h-12 w-full rounded-xl bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-50">Cheguei ao local</button>
                  ) : !showFailure ? (
                    <div className="mt-4 grid gap-2">
                      <button type="button" disabled={isMutating} onClick={() => void runAction(() => completeStop(activeRun.id, currentStop.id), 'Entrega confirmada. Sua rota avançou para a próxima parada.')} className="min-h-12 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50"><span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Confirmar entrega</span></button>
                      <button type="button" disabled={isMutating} onClick={() => setShowFailure(true)} className="min-h-12 rounded-xl border border-red-200 px-4 text-sm font-bold text-red-700 disabled:opacity-50 dark:border-red-900 dark:text-red-300">Não foi possível entregar</button>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl bg-[var(--delivery-muted)] p-4">
                      <p className="font-bold text-[var(--delivery-foreground)]">O que aconteceu?</p>
                      <div className="mt-3"><ChoiceList choices={FAILURE_REASONS} selected={failureReason} onSelect={setFailureReason} /></div>
                      {failureReason === 'Outro' && <input value={customReason} onChange={(event) => setCustomReason(event.target.value)} maxLength={255} placeholder="Conte o que aconteceu" className="mt-2 min-h-11 w-full rounded-xl border border-[var(--delivery-border)] bg-[var(--delivery-input)] px-3 text-sm text-[var(--delivery-foreground)]" />}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setShowFailure(false)} className="min-h-11 rounded-xl border border-[var(--delivery-border)] text-sm font-bold">Voltar</button>
                        <button type="button" disabled={isMutating || !failureReason || (failureReason === 'Outro' && !customReason.trim())} onClick={() => void handleFailure()} className="min-h-11 rounded-xl bg-red-600 text-sm font-bold text-white disabled:opacity-50">Confirmar</button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {activeRun.status === DeliveryRunStatus.RETURNING && (
              <section className="rounded-2xl border border-amber-200 bg-[var(--delivery-card)] p-5 shadow-sm dark:border-amber-900">
                <RotateCcw className="h-7 w-7 text-amber-600" aria-hidden="true" />
                <h2 className="mt-3 text-xl font-black text-[var(--delivery-foreground)]">Retorno à loja</h2>
                <p className="mt-1 text-sm text-[var(--delivery-muted-foreground)]">Você possui {returns.length} {returns.length === 1 ? 'pedido' : 'pedidos'} para retornar à loja.</p>
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Volte para a loja e confirme cada devolução quando chegar.</p>
                <div className="mt-4 space-y-3">
                  {returns.map((stop) => (
                    <div key={stop.id} className="rounded-xl border border-[var(--delivery-border)] p-3">
                      <p className="font-bold text-[var(--delivery-foreground)]">Pedido #{stop.orderNumber}</p>
                      <p className="mt-1 text-xs text-[var(--delivery-muted-foreground)]">{stop.failureReason}</p>
                      <button type="button" disabled={isMutating} onClick={() => void runAction(() => confirmReturn(activeRun.id, stop.id), returns.length === 1 ? 'Devolução confirmada. Sua rota foi concluída.' : 'Devolução confirmada.')} className="mt-3 min-h-11 w-full rounded-xl bg-amber-500 px-3 text-sm font-bold text-slate-950 disabled:opacity-50">Confirmar devolução</button>
                    </div>
                  ))}
                </div>
                {returns.length === 0 && <button type="button" disabled={isMutating} onClick={() => void runAction(() => completeRun(activeRun.id), 'Rota concluída. Você está disponível novamente.')} className="mt-4 min-h-12 w-full rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-50">Concluir rota</button>}
              </section>
            )}

            <section className="rounded-2xl border border-[var(--delivery-border)] bg-[var(--delivery-card)] p-4 shadow-sm" aria-labelledby="route-list-title">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 id="route-list-title" className="font-bold text-[var(--delivery-foreground)]">Ordem das entregas</h2>
                  <p className="text-xs text-[var(--delivery-muted-foreground)]">{orderedStops.length} {orderedStops.length === 1 ? 'entrega' : 'entregas'}</p>
                </div>
                <button type="button" onClick={() => void refresh()} className="min-h-11 rounded-lg px-3 text-xs font-bold text-blue-600">Atualizar</button>
              </div>
              <ol className="mt-3 divide-y divide-[var(--delivery-border)]">
                {orderedStops.map((stop) => (
                  <li key={stop.id} className="flex min-h-16 items-center gap-3 py-3">
                    <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-black ${
                      stop.status === DeliveryStopStatus.CURRENT || stop.status === DeliveryStopStatus.ARRIVED
                        ? 'border-orange-500 bg-orange-500 text-white'
                        : stop.status === DeliveryStopStatus.RETURN_TO_STORE
                          ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
                          : stop.status === DeliveryStopStatus.DELIVERED || stop.status === DeliveryStopStatus.RETURNED_TO_STORE
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-800 opacity-70 dark:bg-emerald-950/30 dark:text-emerald-200'
                            : 'border-[var(--delivery-border)] bg-[var(--delivery-muted)] text-[var(--delivery-foreground)]'
                    }`} aria-label={`Parada ${stop.sequence}`}>
                      {stop.sequence}
                      <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-[var(--delivery-card)]"><StopIcon status={stop.status} /></span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--delivery-foreground)]">Pedido #{stop.orderNumber}</p>
                      <p className="truncate text-xs text-[var(--delivery-muted-foreground)]">{stop.customerName}</p>
                    </div>
                    <span className="text-right text-xs font-bold text-[var(--delivery-muted-foreground)]">{stopStatus(stop)}</span>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}

        <section className="mb-8 rounded-2xl border border-[var(--delivery-border)] bg-[var(--delivery-card)] p-4 shadow-sm" aria-labelledby="tracking-title">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="tracking-title" className="flex items-center gap-2 text-sm font-bold text-[var(--delivery-foreground)]"><Navigation className="h-4 w-4 text-blue-500" aria-hidden="true" />Localização</h2>
              {!nativePlatform && (
                <p className="mt-1 text-xs leading-5 text-[var(--delivery-muted-foreground)]">
                  Para acompanhar a rota com o app fechado ou tela bloqueada, use o aplicativo PedeHub Entregador para Android.
                </p>
              )}
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${isTracking ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-[var(--delivery-muted)] text-[var(--delivery-muted-foreground)]'}`}>{isTracking ? 'Ativa' : 'Pausada'}</span>
          </div>
          {isTracking && lastLocation && <p className="mt-3 rounded-lg bg-[var(--delivery-muted)] p-3 font-mono text-[11px] text-[var(--delivery-muted-foreground)]">Lat: {lastLocation.lat.toFixed(5)} · Lng: {lastLocation.lng.toFixed(5)}</p>}
          {trackingError && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-bold">Localização temporariamente indisponível</p>
              <p>
                {trackingRequired
                  ? 'Sua rota continua ativa e não será cancelada. Estamos tentando reconectar a localização.'
                  : trackingError}
              </p>
            </div>
          )}
          <button type="button" onClick={isTracking ? stopTracking : () => void startTracking()} className={`mt-4 min-h-11 w-full rounded-xl text-sm font-bold ${isTracking ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300' : 'bg-blue-600 text-white'}`}>{isTracking ? 'Parar localização' : 'Permitir localização'}</button>
        </section>
      </main>
    </div>
  );
}
