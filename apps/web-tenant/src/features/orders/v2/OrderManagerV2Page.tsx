import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ChefHat,
  PackageCheck,
  RefreshCw,
  Route,
  Search,
  Wifi,
  Hourglass,
  Clock,
  CheckCircle2,
  Truck,
  ShoppingBag,
  Store,
  Filter,
  Settings2,
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
import ManagerOrderCard from './ManagerOrderCard';
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
  getOperationalAlertRepeatIntervalMs,
  isVoiceAlertsEnabled,
  ORDER_ALERT_CENTER_TOGGLE_EVENT,
  setVoiceAlertsEnabled,
  shouldAnnounceOperationalAlert,
  VOICE_ALERTS_CHANGED_EVENT,
} from "./order-alert-coordinator";

const ORIGINS = ["all", "PEDEHUB", "IFOOD", "FOOD_99"] as const;
const OPERATIONAL_TAB_LABELS: Record<OperationalTab, string> = {
  delivery: 'Delivery',
  pickup: 'Balcão',
  dine_in: 'Comandas',
};
type OrderAlert = { id: string; orderId: string | null; ruleKey: string; severity: "INFO" | "ATTENTION" | "CRITICAL"; state: "ACTIVE" | "RECOVERED"; title: string; message: string; acknowledgedAt: string | null; firstSeenAt: string; lastSeenAt: string; recoveredAt: string | null };

const alertSeverityLabel = (severity: OrderAlert['severity']) => {
  if (severity === 'CRITICAL') return 'Ação imediata';
  if (severity === 'ATTENTION') return 'Requer atenção';
  return 'Informação';
};
type BoardLane = 'kitchen' | 'ready' | 'route';
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
  const [activeMobileLane, setActiveMobileLane] = useState<BoardLane>('kitchen');
  const [selected, setSelected] = useState<OrderBoardItemDTO | null>(null);
  const [lastConfirmedAt, setLastConfirmedAt] = useState<number | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<OrderAlert[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [cockpitCollapsed, setCockpitCollapsed] = useState(() => typeof window !== "undefined" && window.sessionStorage.getItem(COCKPIT_COLLAPSED_STORAGE_KEY) === "true");
  const ordersRef = useRef<OrderBoardItemDTO[]>([]);
  const reconcileRef = useRef<Map<string, Promise<void>>>(new Map());
  const alertPlayedAtRef = useRef<Map<string, number>>(new Map());
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
    const announce = () => {
      const timestamp = Date.now();
      const lastPlayed = alertPlayedAtRef.current;
      for (const [alertId, playedAt] of lastPlayed) {
        if (timestamp - playedAt > 5 * 60_000) lastPlayed.delete(alertId);
      }
      for (const alert of activeAlerts) {
        if (!shouldAnnounceOperationalAlert(alert)) continue;
        const cooldown = getOperationalAlertRepeatIntervalMs(alert);
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
  const operationalLanes = OPERATIONAL_TAB_LANES[operationalTab];
  const handleOperationalTabChange = useCallback((tab: OperationalTab) => {
    setOperationalTab(tab);
    setActiveMobileLane((lane) => OPERATIONAL_TAB_LANES[tab].includes(lane) ? lane : OPERATIONAL_TAB_LANES[tab][0]);
  }, []);
  const intelligence = useMemo(() => getOperationalIntelligence(orders, now), [orders, now]);
  const hasActiveFilters = query.trim().length > 0 || origin !== 'all';
  const operationalContextLabel = OPERATIONAL_TAB_LABELS[operationalTab];

  return (
    <main className="mx-auto max-w-[1800px] space-y-2 p-2 sm:space-y-3 sm:p-4">
      <header className="rounded-2xl border border-slate-800 border-b-4 border-b-primary bg-[#0b1120] p-1.5 shadow-sm sm:p-3">
      <header className="rounded-2xl border border-slate-800 border-b-4 border-b-primary bg-[#0b1120] p-1.5 shadow-sm sm:p-3">

        <div id="order-manager-v2-cockpit" className="rounded-xl p-2 sm:p-3">

          <div className="flex flex-wrap items-center gap-2">

            <div className="min-w-0 flex-1"><h1 className="text-lg font-black tracking-tight text-slate-100 sm:text-xl">Painel de Operações</h1><p className="truncate text-xs font-semibold text-slate-400">Acompanhe e gerencie seus pedidos em tempo real</p></div>

            <OperationalQuickActions orders={orders} onOpenOrder={setSelected} />

            <span className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-black ${realtime.connectionState === "connected" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}><Wifi className="h-3.5 w-3.5" />{realtime.connectionState === "connected" ? "Sincronizado" : "Reconectando"}</span>

            <button type="button" aria-expanded={!cockpitCollapsed} aria-controls="order-manager-v2-cockpit-expanded" title={cockpitCollapsed ? "Expandir resumo da operação" : "Recolher resumo da operação"} onClick={() => setCockpitCollapsed((current) => !current)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="sr-only">{cockpitCollapsed ? "Expandir resumo da operação" : "Recolher resumo da operação"}</span>{cockpitCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</button>

          </div>

          {alertsOpen ? (

            <section className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-border bg-background p-3" aria-label="Central de alertas">

              <div className="mb-2 flex items-center justify-between"><p className="text-xs font-black">Central de alertas</p><div className="flex gap-3"><button type="button" className="text-xs font-bold text-primary" onClick={() => void fetchAlerts()}>Atualizar</button><button type="button" className="text-xs font-bold text-muted-foreground" onClick={() => setAlertsOpen(false)}>Fechar</button></div></div>

              {alerts.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum alerta operacional no histórico recente.</p> : alerts.map((alert) => (

                <div key={alert.id} className="mb-2 flex gap-2 border-b border-border pb-2 last:border-0">

                  <span data-severity={alert.severity} className={`mt-0.5 text-[10px] font-black ${alert.severity === 'CRITICAL' ? 'text-destructive' : alert.severity === 'ATTENTION' ? 'text-amber-700 dark:text-amber-300' : 'text-primary'}`}>{alertSeverityLabel(alert.severity)}<span className="sr-only">Severidade técnica: {alert.severity}</span></span>

                  <div className="min-w-0 flex-1"><p className="text-xs font-bold">{alert.title}</p><p className="text-[11px] text-muted-foreground">{alert.state === 'RECOVERED' ? 'Recuperado' : alert.acknowledgedAt ? 'Reconhecido' : 'Pendente'} · {new Date(alert.lastSeenAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p></div>

                  {alert.orderId ? <button type="button" className="text-[11px] font-bold text-primary" onClick={() => setSelected(ordersRef.current.find((order) => order.id === alert.orderId) ?? null)}>Abrir</button> : null}

                  {alert.state === 'ACTIVE' && !alert.acknowledgedAt ? <button type="button" className="text-[11px] font-bold text-primary" onClick={() => void acknowledgeAlert(alert.id)}>ACK</button> : null}

                </div>

              ))}

            </section>

          ) : null}

          <div id="order-manager-v2-cockpit-expanded" hidden={cockpitCollapsed} className="mt-2">

            <section aria-labelledby="operation-summary-heading">

              <h2 id="operation-summary-heading" className="sr-only">Resumo da operação</h2>

              <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:gap-3" aria-label="Indicadores operacionais">

                <Metric label="Aguardando ação" value={intelligence.waitingAction} tone="text-amber-400" prefix={<Hourglass className="h-5 w-5 text-amber-400" />} />

                <Metric label="Atrasados" value={intelligence.delayed} tone="text-red-500" prefix={<div className="grid h-6 w-6 place-items-center rounded-full bg-red-500/20"><Clock className="h-4 w-4 text-red-500" /></div>} />

                <Metric label="Prontos" value={intelligence.ready} tone="text-emerald-400" prefix={<div className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500/20"><CheckCircle2 className="h-4 w-4 text-emerald-400" /></div>} />

                <Metric label="Delivery" value={intelligence.delivery} tone="text-slate-200" prefix={<Truck className="h-5 w-5 text-sky-400" />} />

                <Metric label="Retirada" value={intelligence.pickup} tone="text-slate-200" prefix={<ShoppingBag className="h-5 w-5 text-fuchsia-400" />} />

                <Metric label="PedeHub" value={intelligence.channels.PEDEHUB} tone="text-slate-200" prefix={<Store className="h-5 w-5 text-sky-400" />} />

                <Metric label="iFood" value={intelligence.channels.IFOOD} tone="text-slate-200" prefix={<span className="text-sm font-black italic text-red-500">iFood</span>} />

                <Metric label="99Food" value={intelligence.channels.FOOD_99} tone="text-slate-200" prefix={<span className="text-sm font-black italic text-yellow-500">99</span>} />

              </div>

            </section>

          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">

            <label className="relative w-full sm:w-[320px]">

              <span className="sr-only">Buscar pedido, cliente ou item</span>

              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />

              <input

                aria-label="Buscar pedido, cliente ou item"

                value={query}

                onChange={(event) => setQuery(event.target.value)}

                placeholder="Buscar pedido, cliente ou item..."

                className="h-9 w-full rounded-full border border-slate-700 bg-slate-900/50 pl-9 pr-3 text-xs text-slate-200 outline-none focus:border-primary"

              />

            </label>

            <div className="flex flex-wrap gap-1.5" aria-label="Filtrar origem">

              {ORIGINS.map((candidate) => (

                <button

                  key={candidate}

                  type="button"

                  onClick={() => setOrigin(candidate)}

                  className={`rounded-full px-4 py-1.5 text-[11px] font-bold transition-colors ${origin === candidate ? "bg-primary text-primary-foreground" : "border border-slate-700 text-slate-300 hover:bg-slate-800"}`}

                >

                  {candidate === "all" ? "Todos" : candidate === "FOOD_99" ? "99Food" : candidate === "PEDEHUB" ? "PedeHub" : "iFood"}

                </button>

              ))}

            </div>

            <div className="ml-auto flex items-center gap-2">

              <details className="group relative">

                <summary className="list-none inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-slate-700 bg-transparent px-3 text-[11px] font-bold text-slate-300 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">

                  <Settings2 className="h-4 w-4" /> Alertas

                </summary>

                <div className="absolute right-0 top-full z-50 mt-1 w-[260px] rounded-xl border border-border bg-card p-3 shadow-lg">

                  <div className="space-y-3">

                    <p className="text-xs font-bold text-foreground">Configurações de Alerta</p>

                    <label className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">

                      Som

                      <button type="button" onClick={() => soundManager.setSoundPreferenceEnabled(!soundManager.soundPreferenceEnabled)} className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${soundManager.soundPreferenceEnabled ? 'bg-primary' : 'bg-muted'}`} role="switch" aria-checked={soundManager.soundPreferenceEnabled}><span aria-hidden="true" className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${soundManager.soundPreferenceEnabled ? 'translate-x-4' : 'translate-x-0'}`} /></button>

                    </label>

                    <label className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">

                      Voz (Leitura)

                      <button type="button" onClick={() => setVoiceAlertsEnabled(!voiceEnabled, voiceScope)} className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${voiceEnabled ? 'bg-primary' : 'bg-muted'}`} role="switch" aria-checked={voiceEnabled}><span aria-hidden="true" className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${voiceEnabled ? 'translate-x-4' : 'translate-x-0'}`} /></button>

                    </label>

                    <label className="space-y-1.5 text-[11px] font-semibold text-muted-foreground block">

                      <span>Volume</span>

                      <input aria-label="Volume dos alertas" className="w-full accent-primary" type="range" min="0" max="1" step="0.05" value={soundManager.volume} onChange={(event) => soundManager.setVolume(Number(event.target.value))} />

                    </label>

                    <div className="flex gap-2">

                      <button type="button" onClick={() => void soundManager.testSound()} className="flex-1 rounded-md border border-border py-1 text-[10px] font-bold text-foreground hover:bg-muted">Testar Som</button>

                      <button type="button" onClick={() => void testVoice()} className="flex-1 rounded-md border border-border py-1 text-[10px] font-bold text-foreground hover:bg-muted">Testar Voz</button>

                    </div>

                    {soundManager.needsAudioUnlock && (

                      <button type="button" onClick={() => void soundManager.unlockAudio()} className="w-full rounded-md bg-amber-500/10 py-1.5 text-[11px] font-bold text-amber-600 border border-amber-500/20 mt-1">Desbloquear Áudio Automático</button>

                    )}

                  </div>

                </div>

              </details>

              <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-700 bg-transparent px-3 text-[11px] font-bold text-slate-300 hover:bg-slate-800">

                <Filter className="h-4 w-4" /> Filtros

              </button>

              <button type="button" onClick={() => void fetchBoard()} className="grid h-9 w-9 place-items-center rounded-full border border-slate-700 text-slate-300 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-primary" aria-label="Atualizar pedidos">

                <RefreshCw className="h-4 w-4" />

              </button>

            </div>

          </div>

        </div>

      </header>

      </header>
      <OperationalControlCenter orders={orders} activeTab={operationalTab} onTabChange={handleOperationalTabChange} />
      <div className="grid grid-cols-3 gap-1 xl:hidden" role="tablist" aria-label="Etapas do kanban">
        {ORDER_MANAGER_LANES.filter((lane) => operationalLanes.includes(lane.id)).map((lane) => {
          const style = LANE_STYLE[lane.id];
          const selected = activeMobileLane === lane.id;
          return <button key={lane.id} type="button" role="tab" aria-selected={selected} onClick={() => setActiveMobileLane(lane.id)} className={`min-h-10 rounded-lg border px-2 py-1.5 text-left text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? `${style.badge} border-current/40` : 'border-border bg-card text-muted-foreground'}`}><span className="flex items-center justify-between gap-1"><span className="truncate">{lane.label}</span><span className="grid h-5 min-w-5 place-items-center rounded-full border border-current/20 text-[11px]">{grouped[lane.id].length}</span></span></button>;
        })}
      </div>
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
          className="space-y-2 pb-5 xl:grid xl:grid-cols-3 xl:gap-3 xl:space-y-0"
          aria-label="Kanban operacional"
        >
          {ORDER_MANAGER_LANES.filter((lane) => OPERATIONAL_TAB_LANES[operationalTab].includes(lane.id)).map((lane) => {
            const style = LANE_STYLE[lane.id];
            const Icon = style.icon;
            return (
              <section
                key={lane.id}
                className={`${activeMobileLane === lane.id ? 'block' : 'hidden'} min-h-[300px] w-full rounded-2xl border border-border bg-muted/15 xl:block ${style.rule}`}
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
                    <ManagerOrderCard
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
                      <p>Sem pedidos em {lane.label.toLocaleLowerCase('pt-BR')} para {operationalContextLabel}{hasActiveFilters ? ' com os filtros atuais.' : '.'}</p>
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
  prefix,
  tone = "text-foreground",
}: {
  label: string;
  value: number;
  prefix?: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="flex min-w-[120px] flex-1 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 sm:flex-initial sm:min-w-0">
      {prefix && <div className="shrink-0">{prefix}</div>}
      <div className="min-w-0 flex-1">
        <p className={`text-lg font-black leading-none tabular-nums ${tone}`}>{value}</p>
        <p className="mt-1 truncate text-[11px] font-semibold text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
