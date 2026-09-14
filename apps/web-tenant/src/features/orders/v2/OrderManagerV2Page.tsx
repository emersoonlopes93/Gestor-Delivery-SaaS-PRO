import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BellRing,
  ChevronDown,
  ChevronUp,
  ChefHat,
  PackageCheck,
  RefreshCw,
  Route,
  Search,
  Volume1,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from "lucide-react";
import type {
  OrderBoardItemDTO,
  OrderChangedEvent,
  OrderOperationalAction,
  OrderResponseDTO,
  UpdateOrderStatusDTO,
} from "@gestor/types";
import { api } from "../../../lib/api-client";
import { printOrderCustomerReceipt } from "../order-print";
import { subscribeOrdersRealtimeEvents } from "../../../notifications/ordersRealtimeEvents";
import {
  latestHintForOrder,
  orderDetailToBoardItem,
  reconcileBoardOrder,
} from "../order-reconciliation";
import { useOrdersRealtimeState } from "../hooks/useOrdersRealtimeState";
import { OrderCardV2 } from "./OrderCardV2";
import { OrderDetailsModalV2 } from "./OrderDetailsModalV2";
import { OperationalControlCenter, OperationalQuickActions } from './OperationalControlCenter';
import { filterOrdersForOperationalTab, OPERATIONAL_TAB_LANES, type OperationalTab } from './operational-control-center';
import {
  filterManagerOrders,
  getOperationalIntelligence,
  groupOrdersForManager,
  ORDER_MANAGER_LANES,
} from "./order-manager-v2";
import { useSharedClock } from "./useSharedClock";
import { useSoundManager } from "../../../notifications/useSoundManager";
import { useTenantAuth } from "../../../hooks/use-tenant-auth";
import { createNotificationEvent, emitNotificationEvent } from "../../../notifications/notificationEvents";
import {
  browserSpeechProvider,
  isVoiceAlertsEnabled,
  ORDER_ALERT_CENTER_TOGGLE_EVENT,
  setVoiceAlertsEnabled,
  VOICE_ALERTS_CHANGED_EVENT,
} from "./order-alert-coordinator";

const ORIGINS = ["all", "PEDEHUB", "IFOOD", "FOOD_99"] as const;
type OrderAlert = { id: string; orderId: string | null; severity: "INFO" | "ATTENTION" | "CRITICAL"; state: "ACTIVE" | "RECOVERED"; title: string; message: string; acknowledgedAt: string | null; firstSeenAt: string; lastSeenAt: string; recoveredAt: string | null };
const COCKPIT_COLLAPSED_STORAGE_KEY = "gestor:orders-v2:cockpit-collapsed";
const LANE_STYLE = {
  kitchen: {
    rule: "border-t-4 border-t-amber-500",
    badge: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
    icon: ChefHat,
  },
  ready: {
    rule: "border-t-4 border-t-emerald-500",
    badge: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
    icon: PackageCheck,
  },
  route: {
    rule: "border-t-4 border-t-sky-500",
    badge: "bg-sky-500/15 text-sky-800 dark:text-sky-200",
    icon: Route,
  },
} as const;

export function OrderManagerV2Page() {
  const [orders, setOrders] = useState<OrderBoardItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState<(typeof ORIGINS)[number]>("all");
  const [operationalTab, setOperationalTab] = useState<OperationalTab>('delivery');
  const [selected, setSelected] = useState<OrderBoardItemDTO | null>(null);
  const [lastConfirmedAt, setLastConfirmedAt] = useState<number | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<OrderAlert[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [cockpitCollapsed, setCockpitCollapsed] = useState(() => typeof window !== "undefined" && window.sessionStorage.getItem(COCKPIT_COLLAPSED_STORAGE_KEY) === "true");
  const ordersRef = useRef<OrderBoardItemDTO[]>([]);
  const reconcileRef = useRef<Map<string, Promise<void>>>(new Map());
  const now = useSharedClock();
  const realtime = useOrdersRealtimeState(lastConfirmedAt);
  const soundManager = useSoundManager();
  const { user } = useTenantAuth();
  const voiceScope = user ? `${user.tenantId}:${user.userId}` : undefined;
  const [voiceEnabled, setVoiceEnabled] = useState(() =>
    isVoiceAlertsEnabled(voiceScope),
  );

  useEffect(() => {
    const syncVoice = () => setVoiceEnabled(isVoiceAlertsEnabled(voiceScope));
    syncVoice();
    window.addEventListener("storage", syncVoice);
    window.addEventListener(VOICE_ALERTS_CHANGED_EVENT, syncVoice);
    return () => {
      window.removeEventListener("storage", syncVoice);
      window.removeEventListener(VOICE_ALERTS_CHANGED_EVENT, syncVoice);
    };
  }, [voiceScope]);

  useEffect(() => {
    window.sessionStorage.setItem(COCKPIT_COLLAPSED_STORAGE_KEY, String(cockpitCollapsed));
  }, [cockpitCollapsed]);

  const testVoice = useCallback(async () => {
    const speech = browserSpeechProvider();
    if (speech) await speech.speak("Teste de voz do Gestor de Pedidos.");
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const response = await api.get<OrderAlert[]>("/order-alerts");
      setAlerts(response.data ?? []);
    } catch { /* Board stays available if the alert center cannot refresh. */ }
  }, []);

  useEffect(() => {
    const openAlertCenter = () => { setAlertsOpen(true); void fetchAlerts(); };
    window.addEventListener(ORDER_ALERT_CENTER_TOGGLE_EVENT, openAlertCenter);
    return () => window.removeEventListener(ORDER_ALERT_CENTER_TOGGLE_EVENT, openAlertCenter);
  }, [fetchAlerts]);

  const acknowledgeAlert = useCallback(async (alertId: string) => {
    const response = await api.patch<OrderAlert>(`/order-alerts/${alertId}/acknowledge`, {});
    if (response.data) setAlerts((current) => current.map((alert) => alert.id === alertId ? response.data as OrderAlert : alert));
  }, []);

  const fetchBoard = useCallback(async () => {
    try {
      const response = await api.get<OrderBoardItemDTO[]>(
        "/orders/operation/board",
      );
      const next = response.data ?? [];
      ordersRef.current = next;
      setOrders(next);
      setError(null);
      setLastConfirmedAt(Date.now());
    } catch {
      setError("Não foi possível atualizar a visão operacional.");
    } finally {
      setLoading(false);
    }
  }, []);

  const reconcile = useCallback((hint: OrderChangedEvent): Promise<void> => {
    const previous =
      reconcileRef.current.get(hint.orderId) ?? Promise.resolve();
    const request = previous
      .catch(() => undefined)
      .then(async () => {
        try {
          const response = await api.get<OrderResponseDTO>(
            `/orders/${hint.orderId}?reconcile=${encodeURIComponent(hint.eventId)}`,
          );
          const item = response.data
            ? orderDetailToBoardItem(response.data)
            : null;
          setOrders((current) => {
            const next = reconcileBoardOrder(current, hint.orderId, item);
            ordersRef.current = next;
            return next;
          });
          setLastConfirmedAt(Date.now());
        } catch {
          /* A subsequent poll remains the authoritative fallback. */
        }
      })
      .finally(() => reconcileRef.current.delete(hint.orderId));
    reconcileRef.current.set(hint.orderId, request);
    return request;
  }, []);

  const handleStatusAction = useCallback(async (order: OrderBoardItemDTO, action: OrderOperationalAction) => {
    if (!action.enabled || !action.targetStatus || updatingOrderId) return;
    setUpdatingOrderId(order.id);
    try {
      const body: UpdateOrderStatusDTO = { status: action.targetStatus };
      const response = await api.patch<unknown>(`/orders/${order.id}/status`, body);
      if (!response.success) throw new Error('Atualização de status não confirmada.');
      void reconcile({ eventId: `status-updated:${order.id}:${Date.now()}`, orderId: order.id, reason: 'status', occurredAt: new Date().toISOString() });
      setLastConfirmedAt(Date.now());
      setError(null);
    } catch {
      setError('Nao foi possivel atualizar o status. O pedido sera reconciliado antes da proxima tentativa.');
      void reconcile({ eventId: `action-failed:${order.id}:${Date.now()}`, orderId: order.id, reason: 'status', occurredAt: new Date().toISOString() });
    } finally {
      setUpdatingOrderId(null);
    }
  }, [reconcile, updatingOrderId]);

  const handlePrint = useCallback(async (order: OrderBoardItemDTO) => {
    if (printingOrderId) return;
    setPrintingOrderId(order.id);
    try {
      await printOrderCustomerReceipt(order.id);
      setError(null);
    } catch {
      setError("Não foi possível imprimir o pedido. Verifique a impressora ou permita a janela de impressão.");
    } finally {
      setPrintingOrderId(null);
    }
  }, [printingOrderId]);

  const handleManualDeliveryCompleted = useCallback((order: OrderBoardItemDTO) => {
    void reconcile({ eventId: `manual-delivery:${order.id}:${Date.now()}`, orderId: order.id, reason: 'status', occurredAt: new Date().toISOString() });
  }, [reconcile]);

  useEffect(() => {
    void fetchBoard();
    void fetchAlerts();
  }, [fetchAlerts, fetchBoard]);
  useEffect(() => {
    const interval = window.setInterval(
      () => { void fetchBoard(); void fetchAlerts(); },
      realtime.connectionState === "connected" ? 90_000 : 30_000,
    );
    return () => window.clearInterval(interval);
  }, [fetchAlerts, fetchBoard, realtime.connectionState]);
  useEffect(() => {
    const pending = new Map<string, OrderChangedEvent>();
    return subscribeOrdersRealtimeEvents((event) => {
      if (event.type === 'order.alert.changed') { void fetchAlerts(); return; }
      if (event.type !== "order.changed") return;
      const latest = latestHintForOrder(
        pending.get(event.hint.orderId),
        event.hint,
      );
      pending.set(event.hint.orderId, latest);
      void reconcile(latest);
    });
  }, [fetchAlerts, reconcile]);

  const activeAlerts = useMemo(() => alerts.filter((alert) => alert.state === 'ACTIVE'), [alerts]);
  const activeAlertSeverityByOrderId = useMemo(() => {
    const byOrderId = new Map<string, OrderAlert['severity']>();
    const rank: Record<OrderAlert['severity'], number> = { INFO: 1, ATTENTION: 2, CRITICAL: 3 };
    for (const alert of activeAlerts) {
      const currentSeverity = alert.orderId ? byOrderId.get(alert.orderId) : undefined;
      if (!alert.orderId || (currentSeverity && rank[alert.severity] <= rank[currentSeverity])) continue;
      byOrderId.set(alert.orderId, alert.severity);
    }
    return byOrderId;
  }, [activeAlerts]);

  useEffect(() => {
    const lastPlayed = new Map<string, number>();
    const announce = () => {
      const timestamp = Date.now();
      for (const alert of activeAlerts) {
        if (alert.acknowledgedAt || alert.severity === 'INFO') continue;
        const cooldown = alert.severity === 'CRITICAL' ? 30_000 : 60_000;
        if (timestamp - (lastPlayed.get(alert.id) ?? 0) < cooldown) continue;
        lastPlayed.set(alert.id, timestamp);
        emitNotificationEvent(createNotificationEvent({
          id: `order-alert:${alert.id}:${timestamp}`,
          type: 'order.alert',
          orderId: alert.orderId ?? undefined,
          title: alert.title,
          message: alert.message,
          priority: alert.severity === 'CRITICAL' ? 'critical' : 'high',
          source: 'polling',
        }));
      }
    };
    announce();
    const interval = window.setInterval(announce, 15_000);
    return () => window.clearInterval(interval);
  }, [activeAlerts]);

  const filtered = useMemo(
    () => filterOrdersForOperationalTab(filterManagerOrders(orders, query, origin), operationalTab),
    [orders, origin, query, operationalTab],
  );
  const grouped = useMemo(() => groupOrdersForManager(filtered), [filtered]);
  const intelligence = useMemo(() => getOperationalIntelligence(orders, now), [orders, now]);
  const kpis = useMemo(
    () => ({
      active: filtered.length,
      attention: filtered.filter(
        (order) =>
          order.status === "pending" ||
          order.operational.syncState === "FAILED",
      ).length,
      route: grouped.route.length,
    }),
    [filtered, grouped.route.length],
  );

  return (
    <main className="mx-auto max-w-[1800px] space-y-2 p-2 sm:space-y-3 sm:p-4">
      <header className="rounded-2xl border border-border border-b-4 border-b-primary bg-card p-1.5 shadow-sm sm:p-3">
        <div id="order-manager-v2-cockpit" className="rounded-xl bg-muted/35 p-2 sm:p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-auto min-w-0"><h1 className="text-base font-black tracking-tight text-foreground sm:text-xl">Painel de Operações</h1><p className="text-[9px] font-semibold text-muted-foreground sm:text-xs">Acompanhe e gerencie seus pedidos em tempo real</p></div>
            <span className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-[10px] font-black sm:text-xs ${realtime.connectionState === "connected" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}><Wifi className="h-3.5 w-3.5" />{realtime.connectionState === "connected" ? "Sincronizado" : "Reconectando"}</span>
            <button type="button" aria-expanded={!cockpitCollapsed} aria-controls="order-manager-v2-cockpit-expanded" title={cockpitCollapsed ? "Expandir painel operacional" : "Recolher painel operacional"} onClick={() => setCockpitCollapsed((current) => !current)} className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="sr-only">{cockpitCollapsed ? "Expandir painel operacional" : "Recolher painel operacional"}</span>{cockpitCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</button>
          </div>
          <div className="mt-2"><OperationalQuickActions orders={orders} onOpenOrder={setSelected} /></div>
          <div className="mt-2 hidden grid-cols-3 gap-1.5 sm:grid sm:flex-wrap">
            <Metric label="Ativos" value={kpis.active} />
            <Metric label="Atenção" value={kpis.attention} tone="text-amber-700 dark:text-amber-300" />
            <Metric label="Em rota" value={kpis.route} />
          </div>
        </div>
        {alertsOpen ? (
          <section className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-border bg-background p-3" aria-label="Central de alertas">
            <div className="mb-2 flex items-center justify-between"><p className="text-xs font-black">Central de alertas</p><div className="flex gap-3"><button type="button" className="text-xs font-bold text-primary" onClick={() => void fetchAlerts()}>Atualizar</button><button type="button" className="text-xs font-bold text-muted-foreground" onClick={() => setAlertsOpen(false)}>Fechar</button></div></div>
            {alerts.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum alerta operacional no histórico recente.</p> : alerts.map((alert) => (
              <div key={alert.id} className="mb-2 flex gap-2 border-b border-border pb-2 last:border-0">
                <span className={`mt-0.5 text-[10px] font-black ${alert.severity === 'CRITICAL' ? 'text-destructive' : alert.severity === 'ATTENTION' ? 'text-amber-700 dark:text-amber-300' : 'text-primary'}`}>{alert.severity}</span>
                <div className="min-w-0 flex-1"><p className="text-xs font-bold">{alert.title}</p><p className="text-[11px] text-muted-foreground">{alert.state === 'RECOVERED' ? 'Recuperado' : alert.acknowledgedAt ? 'Reconhecido' : 'Pendente'} · {new Date(alert.lastSeenAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p></div>
                {alert.orderId ? <button type="button" className="text-[11px] font-bold text-primary" onClick={() => setSelected(ordersRef.current.find((order) => order.id === alert.orderId) ?? null)}>Abrir</button> : null}
                {alert.state === 'ACTIVE' && !alert.acknowledgedAt ? <button type="button" className="text-[11px] font-bold text-primary" onClick={() => void acknowledgeAlert(alert.id)}>ACK</button> : null}
              </div>
            ))}
          </section>
        ) : null}
        <div id="order-manager-v2-cockpit-expanded" hidden={cockpitCollapsed} className="mt-2">
        <div className="grid grid-cols-4 gap-1 sm:flex sm:flex-wrap" aria-label="Indicadores operacionais">
          <Metric label="Aguardando ação" value={intelligence.waitingAction} tone="text-amber-700 dark:text-amber-300" />
          <Metric label="Atrasados" value={intelligence.delayed} tone="text-destructive" />
          <Metric label="Prontos" value={intelligence.ready} tone="text-emerald-700 dark:text-emerald-300" />
          <Metric label="Delivery" value={intelligence.delivery} />
          <Metric label="Retirada" value={intelligence.pickup} />
          <Metric label="PedeHub" value={intelligence.channels.PEDEHUB} />
          <Metric label="iFood" value={intelligence.channels.IFOOD} />
          <Metric label="99Food" value={intelligence.channels.FOOD_99} />
        </div>
        <div className="mt-2 hidden flex-col gap-2 sm:flex 2xl:flex-row 2xl:items-center 2xl:justify-end">
          <div className="hidden">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">
              Sala de controle · operação ao vivo
            </p>
            <h1 className="mt-1 text-xl font-black tracking-tight text-foreground sm:text-2xl">
              Painel de Operações
            </h1>
          </div>
          <div className="hidden">
            <Metric label="Ativos" value={kpis.active} />
            <Metric
              label="Atenção"
              value={kpis.attention}
              tone="text-amber-700 dark:text-amber-300"
            />
            <Metric label="Em rota" value={kpis.route} />
          </div>
          <div className="flex flex-wrap items-stretch gap-1.5">
            <div className="flex flex-wrap items-center gap-1 border border-border bg-background p-1">
              <button
                type="button"
                onClick={() =>
                  soundManager.setSoundPreferenceEnabled(
                    !soundManager.soundPreferenceEnabled,
                  )
                }
                className={`inline-flex min-h-9 items-center gap-1.5 border px-2 text-[10px] font-black uppercase tracking-wide focus-visible:ring-2 focus-visible:ring-primary ${soundManager.soundPreferenceEnabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border text-muted-foreground hover:bg-muted"}`}
                aria-pressed={soundManager.soundPreferenceEnabled}
              >
                {soundManager.soundPreferenceEnabled ? (
                  <Volume1 className="h-3.5 w-3.5" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5" />
                )}
                Som {soundManager.soundPreferenceEnabled ? "on" : "off"}
              </button>
              <button
                type="button"
                onClick={() => setVoiceAlertsEnabled(!voiceEnabled, voiceScope)}
                className={`inline-flex min-h-9 items-center gap-1.5 border px-2 text-[10px] font-black uppercase tracking-wide focus-visible:ring-2 focus-visible:ring-primary ${voiceEnabled ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                aria-pressed={voiceEnabled}
              >
                {voiceEnabled ? (
                  <Volume2 className="h-3.5 w-3.5" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5" />
                )}
                Voz {voiceEnabled ? "on" : "off"}
              </button>
              <label className="flex min-h-9 items-center gap-2 px-2 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                Volume
                <input
                  aria-label="Volume dos alertas"
                  className="w-20 accent-primary"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={soundManager.volume}
                  onChange={(event) => soundManager.setVolume(Number(event.target.value))}
                />
              </label>
              <button
                type="button"
                onClick={() => void soundManager.testSound()}
                className="inline-flex min-h-9 items-center gap-1.5 border border-border px-2 text-[10px] font-black uppercase tracking-wide text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
              >
                Testar som
              </button>
              <button
                type="button"
                onClick={() => void testVoice()}
                className="inline-flex min-h-9 items-center gap-1.5 border border-border px-2 text-[10px] font-black uppercase tracking-wide text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
              >
                Testar voz
              </button>
              {soundManager.needsAudioUnlock ? (
                <button
                  type="button"
                  onClick={() => void soundManager.unlockAudio()}
                  className="inline-flex min-h-9 items-center gap-1.5 border border-amber-500/40 bg-amber-500/10 px-2 text-[10px] font-black uppercase tracking-wide text-amber-800 dark:text-amber-200"
                >
                  <BellRing className="h-3.5 w-3.5" />
                  Liberar
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void fetchBoard()}
              className="grid min-h-11 min-w-11 place-items-center border border-border text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Atualizar pedidos"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
          <label className="relative w-full sm:w-[260px]">
            <span className="sr-only">
              Buscar pedido, cliente ou item
            </span>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              aria-label="Buscar pedido, cliente ou item"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar pedido, cliente ou item..."
              className="h-8 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-[11px] outline-none focus:border-primary sm:h-9 sm:text-xs"
            />
          </label>
          <div className="flex flex-wrap gap-1" aria-label="Filtrar origem">
            {ORIGINS.map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => setOrigin(candidate)}
                className={`rounded-lg px-2 py-1.5 text-[9px] font-black sm:text-[10px] ${origin === candidate ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-muted"}`}
              >
                {candidate === "all" ? "Todos" : candidate}
              </button>
            ))}
          </div>
          <span
            className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-bold ${realtime.connectionState === "connected" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}
          >
            {realtime.connectionState === "connected" ? (
              <Wifi className="h-3.5 w-3.5" />
            ) : (
              <WifiOff className="h-3.5 w-3.5" />
            )}
            {realtime.isStale
              ? "Dados aguardando atualização"
              : realtime.connectionState === "connected"
                ? "Sincronizado"
                : "Reconectando"}
          </span>
        </div>
      </header>
      <OperationalControlCenter orders={orders} activeTab={operationalTab} onTabChange={setOperationalTab} />
      {error ? (
        <div
          role="alert"
          className="flex items-center gap-2 border border-destructive/30 bg-destructive/10 p-4 text-sm font-bold text-destructive"
        >
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      ) : null}
      {loading ? (
        <div className="grid min-h-64 place-items-center border border-dashed border-border text-sm font-bold text-muted-foreground">
          <Activity className="mb-2 h-5 w-5 animate-pulse" />
          Carregando operação…
        </div>
      ) : (
        <section
          className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-px-3 px-3 pb-5 sm:mx-0 sm:px-0 xl:grid xl:grid-cols-3 xl:overflow-visible"
          aria-label="Kanban operacional horizontal"
        >
          {ORDER_MANAGER_LANES.filter((lane) => OPERATIONAL_TAB_LANES[operationalTab].includes(lane.id)).map((lane) => {
            const style = LANE_STYLE[lane.id];
            const Icon = style.icon;
            return (
              <section
                key={lane.id}
                className={`min-h-[300px] min-w-[calc(100vw-2.5rem)] snap-start rounded-2xl border border-border bg-muted/15 sm:min-w-[22rem] xl:min-w-0 ${style.rule}`}
              >
                <header className="flex items-start justify-between rounded-t-2xl border-b border-border bg-card px-3 py-2">
                  <div className="flex items-start gap-2">
                    <Icon className="mt-0.5 h-4 w-4 text-foreground" />
                    <div>
                      <h2 className="text-sm font-black text-foreground">
                        {lane.label}
                      </h2>
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {lane.description}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-lg border border-current/15 px-2 py-1 text-xs font-black ${style.badge}`}
                  >
                    {grouped[lane.id].length}
                  </span>
                </header>
                <div className="space-y-2 p-2.5 sm:p-3">
                  {grouped[lane.id].map((order) => (
                    <OrderCardV2
                      key={order.id}
                      order={order}
                      now={now}
                      onOpen={setSelected}
                      onAction={handleStatusAction}
                      onPrint={handlePrint}
                      alertSeverity={activeAlertSeverityByOrderId.get(order.id)}
                      onOpenAlert={() => window.dispatchEvent(new Event(ORDER_ALERT_CENTER_TOGGLE_EVENT))}
                      isActionPending={updatingOrderId === order.id}
                      isPrinting={printingOrderId === order.id}
                    />
                  ))}
                  {grouped[lane.id].length === 0 ? (
                    <div className="grid min-h-36 place-items-center rounded-xl border border-dashed border-border p-4 text-center text-xs font-bold text-muted-foreground">
                      Sem pedidos nesta etapa
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </section>
      )}
      <OrderDetailsModalV2
        order={selected}
        now={now}
        onClose={() => setSelected(null)}
        onAction={handleStatusAction}
        onPrint={handlePrint}
        onManualDeliveryCompleted={handleManualDeliveryCompleted}
        isActionPending={updatingOrderId === selected?.id}
        isPrinting={printingOrderId === selected?.id}
      />
    </main>
  );
}

function Metric({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="min-w-14 rounded-lg border border-border bg-background px-2 py-1 text-center">
      <p className={`text-sm font-black tabular-nums ${tone}`}>{value}</p>
      <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
