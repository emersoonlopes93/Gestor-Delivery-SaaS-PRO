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
import {
  filterManagerOrders,
  groupOrdersForManager,
  ORDER_MANAGER_LANES,
} from "./order-manager-v2";
import { useSharedClock } from "./useSharedClock";
import { useSoundManager } from "../../../notifications/useSoundManager";
import { useTenantAuth } from "../../../hooks/use-tenant-auth";
import {
  browserSpeechProvider,
  isVoiceAlertsEnabled,
  setVoiceAlertsEnabled,
  VOICE_ALERTS_CHANGED_EVENT,
} from "./order-alert-coordinator";

const ORIGINS = ["all", "PEDEHUB", "IFOOD", "FOOD_99"] as const;
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
  const [selected, setSelected] = useState<OrderBoardItemDTO | null>(null);
  const [lastConfirmedAt, setLastConfirmedAt] = useState<number | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
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
      await reconcile({ eventId: `status-updated:${order.id}:${Date.now()}`, orderId: order.id, reason: 'status', occurredAt: new Date().toISOString() });
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

  useEffect(() => {
    void fetchBoard();
  }, [fetchBoard]);
  useEffect(() => {
    const interval = window.setInterval(
      () => void fetchBoard(),
      realtime.connectionState === "connected" ? 90_000 : 30_000,
    );
    return () => window.clearInterval(interval);
  }, [fetchBoard, realtime.connectionState]);
  useEffect(() => {
    const pending = new Map<string, OrderChangedEvent>();
    return subscribeOrdersRealtimeEvents((event) => {
      if (event.type !== "order.changed") return;
      const latest = latestHintForOrder(
        pending.get(event.hint.orderId),
        event.hint,
      );
      pending.set(event.hint.orderId, latest);
      void reconcile(latest);
    });
  }, [reconcile]);

  const filtered = useMemo(
    () => filterManagerOrders(orders, query, origin),
    [orders, origin, query],
  );
  const grouped = useMemo(() => groupOrdersForManager(filtered), [filtered]);
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
    <main className="mx-auto max-w-[1800px] space-y-4 p-3 sm:p-5">
      <header className="rounded-2xl border border-border border-b-4 border-b-primary bg-card p-3 shadow-sm sm:p-4">
        <div id="order-manager-v2-cockpit" className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/35 px-3 py-2">
          <div className="mr-auto min-w-0"><p className="truncate text-sm font-black text-foreground">Gestor de Pedidos</p><p className="text-[9px] font-black uppercase tracking-[0.16em] text-primary">Operação ao vivo</p></div>
          <Metric label="Ativos" value={kpis.active} />
          <Metric label="Atenção" value={kpis.attention} tone="text-amber-700 dark:text-amber-300" />
          <Metric label="Em rota" value={kpis.route} />
          <span className={`hidden items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold sm:inline-flex ${realtime.connectionState === "connected" ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300" : "border-amber-500/30 text-amber-700 dark:text-amber-300"}`}><Wifi className="h-3 w-3" />{realtime.connectionState === "connected" ? "Sincronizado" : "Reconectando"}</span>
          <span className="hidden text-[10px] font-bold text-muted-foreground lg:inline">Alertas: {soundManager.soundPreferenceEnabled ? "som ativo" : "som desligado"}</span>
          <button type="button" aria-expanded={!cockpitCollapsed} aria-controls="order-manager-v2-cockpit-expanded" title={cockpitCollapsed ? "Expandir painel operacional" : "Recolher painel operacional"} onClick={() => setCockpitCollapsed((current) => !current)} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="sr-only">{cockpitCollapsed ? "Expandir painel operacional" : "Recolher painel operacional"}</span>{cockpitCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</button>
        </div>
        <div id="order-manager-v2-cockpit-expanded" hidden={cockpitCollapsed} className="mt-3">
        <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-end">
          <div className="hidden">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">
              Sala de controle · operação ao vivo
            </p>
            <h1 className="mt-1 text-xl font-black tracking-tight text-foreground sm:text-2xl">
              Gestor de Pedidos
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
          <div className="flex flex-wrap items-stretch gap-2">
            <div className="border-l border-border px-3 text-right">
              <p className="font-mono text-lg font-black tabular-nums text-foreground">
                {new Date(now).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                relógio compartilhado
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1 border border-border bg-background p-1">
              <div className="hidden px-2 lg:block">
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-foreground">
                  Central de alertas
                </p>
                <p className="text-[9px] font-semibold text-muted-foreground">
                  uma aba anuncia
                </p>
              </div>
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
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <label className="relative min-w-[min(100%,280px)] w-full max-w-[440px]">
            <span className="sr-only">
              Buscar pedido, cliente ou item
            </span>
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input
              aria-label="Buscar pedido, cliente ou item"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar pedido, cliente ou item..."
              className="h-10 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-primary"
            />
          </label>
          <div className="flex flex-wrap gap-1" aria-label="Filtrar origem">
            {ORIGINS.map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => setOrigin(candidate)}
                className={`rounded-lg px-3 py-2 text-[11px] font-black ${origin === candidate ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-muted"}`}
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
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 xl:grid xl:grid-cols-3 xl:overflow-visible"
          aria-label="Kanban operacional horizontal"
        >
          {ORDER_MANAGER_LANES.map((lane) => {
            const style = LANE_STYLE[lane.id];
            const Icon = style.icon;
            return (
              <section
                key={lane.id}
                className={`min-h-[360px] min-w-[19rem] snap-start rounded-2xl border border-border bg-muted/15 xl:min-w-0 ${style.rule}`}
              >
                <header className="flex items-start justify-between rounded-t-2xl border-b border-border bg-card px-4 py-3">
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
                <div className="space-y-3 p-3">
                  {grouped[lane.id].map((order) => (
                    <OrderCardV2
                      key={order.id}
                      order={order}
                      now={now}
                      onOpen={setSelected}
                      onAction={handleStatusAction}
                      onPrint={handlePrint}
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
