import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw,
  Clock,
  CheckCircle2,
  ChefHat,
  Printer,
  Eye,
  User,
  MessageSquare,
  X,
  Search,
  Wifi,
  WifiOff,
  Loader2,
  ArrowRight,
  UtensilsCrossed,
} from 'lucide-react';
import {
  KdsPrintJobDTO,
  PrintJobStatus,
} from '@gestor/types';
import { api } from '@/lib/api-client';
import { printThermalText } from '@/lib/thermal-print';

interface KdsPrintJobsResponse {
  items: KdsPrintJobDTO[];
  total: number;
  page: number;
  limit: number;
}

// ─── Configuração visual das colunas por setor ───────────────────────────────

interface SectorConfig {
  icon: string;
  description: string;
  accentColor: string;       // classe Tailwind para texto/ícone
  accentBg: string;          // fundo do cabeçalho da coluna
  accentBorder: string;      // borda da coluna
  accentBadge: string;       // fundo do badge contador
  primaryAction: 'concluir' | 'proximo'; // estilo do botão principal
}

const SECTOR_CONFIGS: Record<string, SectorConfig> = {
  Pizzas: {
    icon: '🍕',
    description: 'Preparo das pizzas no forno',
    accentColor: 'text-orange-400',
    accentBg: 'bg-orange-500/10',
    accentBorder: 'border-orange-500/25',
    accentBadge: 'bg-orange-500 text-white',
    primaryAction: 'concluir',
  },
  Fritadeira: {
    icon: '🍟',
    description: 'Porções, batatas e frituras',
    accentColor: 'text-yellow-400',
    accentBg: 'bg-yellow-500/10',
    accentBorder: 'border-yellow-500/25',
    accentBadge: 'bg-yellow-500 text-black',
    primaryAction: 'concluir',
  },
  Montagem: {
    icon: '🍔',
    description: 'Lanches, porções e finalização',
    accentColor: 'text-purple-400',
    accentBg: 'bg-purple-500/10',
    accentBorder: 'border-purple-500/25',
    accentBadge: 'bg-purple-500 text-white',
    primaryAction: 'proximo',
  },
  Bebidas: {
    icon: '🥤',
    description: 'Refrigerantes, sucos e bebidas',
    accentColor: 'text-emerald-400',
    accentBg: 'bg-emerald-500/10',
    accentBorder: 'border-emerald-500/25',
    accentBadge: 'bg-emerald-500 text-white',
    primaryAction: 'concluir',
  },
  GERAL: {
    icon: '🍽',
    description: 'Todos os pedidos da cozinha',
    accentColor: 'text-sky-400',
    accentBg: 'bg-sky-500/10',
    accentBorder: 'border-sky-500/25',
    accentBadge: 'bg-sky-500 text-white',
    primaryAction: 'concluir',
  },
};

const DEFAULT_SECTOR: SectorConfig = {
  icon: '🍽',
  description: 'Pedidos da cozinha',
  accentColor: 'text-sky-400',
  accentBg: 'bg-sky-500/10',
  accentBorder: 'border-sky-500/25',
  accentBadge: 'bg-sky-500 text-white',
  primaryAction: 'concluir',
};

// ─── Badge de canal ───────────────────────────────────────────────────────────

function ChannelBadge({ channel }: { channel: string }) {
  const cfg = useMemo(() => {
    const lower = (channel || '').toLowerCase();
    if (lower.includes('ifood')) {
      return { label: 'iFood', cls: 'bg-[#ea1d2c]/15 text-[#ea1d2c] border-[#ea1d2c]/25', dot: 'bg-[#ea1d2c]' };
    }
    if (lower.includes('99food') || lower.includes('99')) {
      return { label: '99Food', cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25', dot: 'bg-yellow-400' };
    }
    return { label: 'PedeHub', cls: 'bg-primary/15 text-primary border-primary/25', dot: 'bg-primary' };
  }, [channel]);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider ${cfg.cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Badge SLA ────────────────────────────────────────────────────────────────

function SlaBadge({ elapsed, isScheduled, scheduledForStr }: {
  elapsed: number;
  isScheduled: boolean;
  scheduledForStr: string;
}) {
  if (isScheduled) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/25 text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
        <Clock className="w-3 h-3 shrink-0" />
        <span>Agend. {scheduledForStr}</span>
      </span>
    );
  }

  let cls = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25';
  if (elapsed > 20) {
    cls = 'bg-rose-500/15 text-rose-400 border-rose-500/25 animate-pulse';
  } else if (elapsed >= 10) {
    cls = 'bg-amber-500/15 text-amber-400 border-amber-500/25';
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${cls}`}>
      <Clock className="w-3 h-3 shrink-0" />
      <span>{elapsed} min</span>
    </span>
  );
}

// ─── Card KDS ─────────────────────────────────────────────────────────────────

interface KdsCardProps {
  job: KdsPrintJobDTO;
  onPrint: (content: string) => void;
  onComplete: (jobId: string) => void;
  updatingId: string | null;
  onViewTicket: (content: string) => void;
  primaryAction: 'concluir' | 'proximo';
}

function KdsCard({ job, onPrint, onComplete, updatingId, onViewTicket, primaryAction }: KdsCardProps) {
  const order = job.order;
  const isScheduled = order?.isScheduled ?? false;
  const scheduledForStr = order?.scheduledFor
    ? new Date(order.scheduledFor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';

  const getElapsedMin = useCallback(() => {
    const min = Math.floor((new Date().getTime() - new Date(job.createdAt).getTime()) / 60000);
    return min >= 0 ? min : 0;
  }, [job.createdAt]);

  const [elapsed, setElapsed] = useState(getElapsedMin());

  useEffect(() => {
    setElapsed(getElapsedMin());
    const timer = setInterval(() => setElapsed(getElapsedMin()), 30000);
    return () => clearInterval(timer);
  }, [getElapsedMin]);

  const isUpdating = updatingId === job.id;

  // Canal de origem: usa channel do order se disponível, senão station
  const orderMeta = order as (typeof order & { channel?: string; source?: string }) | undefined;
  const channelSource = orderMeta?.channel ?? orderMeta?.source ?? job.station;

  const fulfillmentLabels: Record<string, string> = {
    delivery: 'Entrega',
    pickup: 'Retirada',
    dine_in: 'Salão',
    table: 'Mesa',
  };
  const fulfillmentLabel = fulfillmentLabels[order?.fulfillmentType ?? ''] ?? order?.fulfillmentType ?? 'Outro';

  return (
    <article
      className={`
        w-full flex flex-col rounded-2xl border bg-card shadow-sm
        transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5
        ${isScheduled ? 'border-amber-500/30 ring-1 ring-amber-500/10' : 'border-border'}
        ${isUpdating ? 'opacity-70 pointer-events-none' : ''}
      `}
      aria-label={`Pedido #${order?.orderNumber ?? '---'} — ${order?.customerName ?? ''}`}
    >
      {/* ── Cabeçalho do card ───────────────────────────────────────────── */}
      <header className="px-4 pt-3.5 pb-3 flex items-center justify-between gap-2 border-b border-border/40">
        {/* Coluna esquerda: canal + número */}
        <div className="min-w-0 flex flex-col gap-1">
          <ChannelBadge channel={channelSource} />
          <span className="text-base font-black text-foreground">
            #{order?.orderNumber ?? '---'}
          </span>
        </div>

        {/* Coluna direita: SLA badge */}
        <div className="shrink-0">
          <SlaBadge elapsed={elapsed} isScheduled={isScheduled} scheduledForStr={scheduledForStr} />
        </div>
      </header>

      {/* ── Corpo do card ────────────────────────────────────────────────── */}
      <div className="px-4 py-3 flex-1 flex flex-col gap-3">
        {/* Nome do cliente + tipo de entrega */}
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-bold text-foreground truncate">
            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{order?.customerName ?? '---'}</span>
          </span>
          <span className="shrink-0 px-2 py-0.5 rounded-lg bg-secondary text-secondary-foreground text-[10px] font-black uppercase tracking-wider">
            {fulfillmentLabel}
          </span>
        </div>

        {/* Lista de itens */}
        <div className="space-y-2">
          {order?.items?.map((item) => (
            <div key={item.id} className="text-sm">
              <div className="flex items-start gap-1.5 font-semibold text-foreground">
                <span className="shrink-0 text-muted-foreground text-xs font-black mt-0.5">
                  {item.quantity}x
                </span>
                <span>{item.snapshotName}</span>
              </div>

              {/* Adicionais / composição */}
              {(() => {
                const options = (item.snapshotCatalogV2Json as { optionItems?: Array<{ snapshotName: string }> })?.optionItems ?? [];
                const composition = item.snapshotComposition
                  ? item.snapshotComposition.split('\n').map((l) => l.trim()).filter(Boolean)
                  : [];
                if (options.length === 0 && composition.length === 0) return null;
                return (
                  <div className="ml-6 mt-0.5 space-y-0.5">
                    {options.map((o, idx: number) => (
                      <div key={idx} className="text-xs text-muted-foreground font-medium">
                        + {o.snapshotName}
                      </div>
                    ))}
                    {composition.map((line, idx) => (
                      <div key={`comp-${idx}`} className="text-xs text-muted-foreground font-medium">
                        {line}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Obs do item */}
              {item.notes && (
                <div className="ml-6 mt-1 flex items-start gap-1 text-[11px] text-amber-500 font-semibold bg-amber-500/8 px-2 py-1 rounded-lg border border-amber-500/15">
                  <MessageSquare className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>{item.notes}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Obs gerais do pedido */}
        {order?.notes && (
          <div className="flex items-start gap-2 p-2.5 bg-amber-500/8 rounded-xl border border-amber-500/15">
            <MessageSquare className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold text-amber-500 leading-none mb-0.5">Observações</p>
              <p className="text-amber-400/90 font-medium leading-relaxed">{order.notes}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Ações do card ───────────────────────────────────────────────── */}
      <footer className="px-4 pb-4 pt-2 flex flex-col gap-2 border-t border-border/40 mt-auto">
        {/* Ações secundárias */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onViewTicket(job.content)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-bold border border-border/50 hover:border-border transition-all active:scale-95"
            title="Ver ticket"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Ver ticket</span>
          </button>
          <button
            type="button"
            onClick={() => onPrint(job.content)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-bold border border-border/50 hover:border-border transition-all active:scale-95"
            title="Imprimir"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir</span>
          </button>
        </div>

        {/* Ação principal */}
        <button
          type="button"
          onClick={() => onComplete(job.id)}
          disabled={isUpdating}
          className={`
            w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
            text-xs font-black uppercase tracking-wider
            transition-all active:scale-[0.98] disabled:opacity-60
            ${primaryAction === 'proximo'
              ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-500/15'
              : isScheduled
                ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-md shadow-amber-500/15'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/15'
            }
          `}
          aria-label={primaryAction === 'proximo' ? 'Pronto para próxima etapa' : 'Concluir setor'}
        >
          {isUpdating ? (
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          ) : primaryAction === 'proximo' ? (
            <ArrowRight className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span>
            {isUpdating
              ? 'Processando…'
              : primaryAction === 'proximo'
                ? 'Pronto p/ próxima etapa'
                : isScheduled
                  ? 'Concluir Agendamento'
                  : 'Concluir setor'}
          </span>
        </button>
      </footer>
    </article>
  );
}

// ─── Coluna de setor ──────────────────────────────────────────────────────────

interface SectorColumnProps {
  station: string;
  jobs: KdsPrintJobDTO[];
  onPrint: (content: string) => void;
  onComplete: (jobId: string) => void;
  updatingId: string | null;
  onViewTicket: (content: string) => void;
}

function SectorColumn({ station, jobs, onPrint, onComplete, updatingId, onViewTicket }: SectorColumnProps) {
  const cfg = SECTOR_CONFIGS[station] ?? DEFAULT_SECTOR;

  return (
    <section
      className={`flex flex-col rounded-2xl border ${cfg.accentBorder} overflow-hidden min-w-[280px] max-w-full`}
      aria-label={`Setor ${station}`}
    >
      {/* Cabeçalho da coluna */}
      <header className={`px-4 py-3 ${cfg.accentBg} border-b ${cfg.accentBorder}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl leading-none">{cfg.icon}</span>
            <div>
              <h2 className={`text-sm font-black ${cfg.accentColor}`}>{station}</h2>
              <p className="text-[10px] text-muted-foreground font-medium leading-tight">{cfg.description}</p>
            </div>
          </div>
          <span className={`text-xs font-black px-2.5 py-0.5 rounded-full ${cfg.accentBadge}`}>
            {jobs.length}
          </span>
        </div>
      </header>

      {/* Cards da coluna */}
      <div className="flex flex-col gap-3 p-3 overflow-y-auto flex-1">
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 opacity-30" />
            <p className="text-xs font-medium text-center">Setor vazio</p>
          </div>
        ) : (
          jobs.map((job) => (
            <KdsCard
              key={job.id}
              job={job}
              onPrint={onPrint}
              onComplete={onComplete}
              updatingId={updatingId}
              onViewTicket={onViewTicket}
              primaryAction={cfg.primaryAction}
            />
          ))
        )}
      </div>
    </section>
  );
}

// ─── Página principal KDS ─────────────────────────────────────────────────────

export function KdsPage() {
  const [stationId, setStationId] = useState<string>(localStorage.getItem('kds_station') ?? 'ALL');
  const [printJobs, setPrintJobs] = useState<KdsPrintJobDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [stations, setStations] = useState<string[]>(['GERAL']);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewingTicketContent, setViewingTicketContent] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const activeStatuses = useMemo(
    () => new Set<PrintJobStatus>([PrintJobStatus.pending, PrintJobStatus.printing]),
    [],
  );

  const fetchJobs = useCallback(async () => {
    try {
      setLoadError(null);
      setIsRefreshing(true);
      const res = await api.get<KdsPrintJobsResponse>(
        `/kds/print-jobs?station=${encodeURIComponent(stationId)}&limit=100`,
      );
      setPrintJobs((res.data.items ?? []).filter((job) => activeStatuses.has(job.status)));
      setLastSynced(new Date());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Erro ao carregar KDS.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [activeStatuses, stationId]);

  useEffect(() => {
    const fetchStations = async () => {
      try {
        const res = await api.get<string[]>('/kds/stations');
        if (Array.isArray(res.data) && res.data.length > 0) {
          setStations(res.data);
        }
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Erro ao carregar setores do KDS.');
      }
    };
    fetchStations();
  }, []);

  useEffect(() => {
    localStorage.setItem('kds_station', stationId);
    fetchJobs();
    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
  }, [fetchJobs, stationId]);

  const handleComplete = async (jobId: string) => {
    if (updatingId) return;
    setUpdatingId(jobId);
    try {
      await api.put(`/kds/print-jobs/${jobId}/completed`);
      await fetchJobs();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Erro ao concluir job do KDS.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handlePrint = (content: string) => {
    printThermalText(content, { title: 'Imprimir Ticket', paperWidthMm: 58 });
  };

  // Filtrar por busca
  const filteredJobs = useMemo(() => {
    if (!search.trim()) return printJobs;
    const term = search.toLowerCase().trim();
    return printJobs.filter((job) => {
      const order = job.order;
      return (
        String(order?.orderNumber ?? '').includes(term) ||
        (order?.customerName ?? '').toLowerCase().includes(term) ||
        order?.items?.some((i) => i.snapshotName.toLowerCase().includes(term))
      );
    });
  }, [printJobs, search]);

  // Agrupar por setor (quando todos os setores estão visíveis)
  const sectorGroups = useMemo(() => {
    if (stationId !== 'ALL') {
      return [{ station: stationId === 'ALL' ? 'GERAL' : stationId, jobs: filteredJobs }];
    }
    const map = new Map<string, KdsPrintJobDTO[]>();
    for (const job of filteredJobs) {
      const key = job.station || 'GERAL';
      const existing = map.get(key);
      if (existing) {
        existing.push(job);
      } else {
        map.set(key, [job]);
      }
    }
    return Array.from(map.entries()).map(([station, jobs]) => ({ station, jobs }));
  }, [filteredJobs, stationId]);

  const lastSyncedLabel = useMemo(() => {
    if (!lastSynced) return null;
    const diffSec = Math.floor((Date.now() - lastSynced.getTime()) / 1000);
    if (diffSec < 10) return 'Agora há pouco';
    if (diffSec < 60) return `${diffSec}s atrás`;
    return `${Math.floor(diffSec / 60)} min atrás`;
  }, [lastSynced]);

  return (
    <div className="h-[100dvh] md:h-[calc(100dvh-64px)] flex flex-col bg-background overflow-hidden">

      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <header className="shrink-0 px-5 py-4 border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">

          {/* Título + subtítulo */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <ChefHat className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-black text-foreground leading-tight">Cozinha (KDS)</h1>
              <p className="text-[11px] text-muted-foreground font-medium">
                Acompanhe e conclua os pedidos por setor em tempo real.
              </p>
            </div>
          </div>

          {/* Controles */}
          <div className="flex flex-wrap items-center gap-2">

            {/* Filtro de setores */}
            <select
              id="kds-station-filter"
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              className="text-sm bg-background border border-input text-foreground rounded-xl px-3 py-2 font-semibold focus:outline-none focus:ring-2 focus:ring-ring h-9"
              aria-label="Filtrar por setor"
            >
              <option value="ALL">Todos os setores</option>
              {stations.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            {/* Busca */}
            <div className="relative flex-1 min-w-[180px] max-w-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                id="kds-search"
                type="search"
                placeholder="Buscar pedido, cliente ou item…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 text-sm bg-background border border-input rounded-xl text-foreground placeholder:text-muted-foreground font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label="Buscar pedido, cliente ou item"
              />
            </div>

            {/* Sincronização */}
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              {loadError ? (
                <WifiOff className="w-3.5 h-3.5 text-destructive" />
              ) : (
                <Wifi className="w-3.5 h-3.5 text-emerald-500" />
              )}
              <span className="hidden sm:inline">
                {loadError ? 'Sem conexão' : lastSyncedLabel ? `Sincronizado · ${lastSyncedLabel}` : 'Sincronizando…'}
              </span>
            </div>

            {/* Botão Atualizar */}
            <button
              id="kds-refresh-btn"
              type="button"
              onClick={() => { fetchJobs(); }}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 h-9 px-3.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-black transition-all active:scale-95 disabled:opacity-60"
              aria-label="Atualizar painel"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Erro ──────────────────────────────────────────────────────── */}
      {loadError && (
        <div
          role="alert"
          className="shrink-0 mx-5 mt-3 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm font-semibold text-destructive"
        >
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => setLoadError(null)}
            className="ml-auto p-1 hover:bg-destructive/10 rounded-lg transition-colors"
            aria-label="Fechar erro"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Conteúdo principal ────────────────────────────────────────── */}
      <main className="flex-1 overflow-x-auto overflow-y-hidden">
        {loading ? (
          /* Loading state */
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
            <div className="relative">
              <ChefHat className="w-14 h-14 opacity-20" />
              <Loader2 className="w-6 h-6 animate-spin absolute -bottom-1 -right-1 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-bold text-foreground">Carregando cozinha…</p>
              <p className="text-sm mt-0.5">Buscando pedidos em tempo real</p>
            </div>
          </div>
        ) : sectorGroups.length === 0 || filteredJobs.length === 0 ? (
          /* Estado vazio */
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
            <div className="p-6 rounded-full bg-muted/30">
              <UtensilsCrossed className="w-12 h-12 opacity-40" />
            </div>
            <div className="text-center max-w-xs">
              <p className="text-lg font-black text-foreground">
                {search ? 'Nenhum resultado encontrado' : 'Cozinha em dia!'}
              </p>
              <p className="text-sm mt-1 leading-relaxed">
                {search
                  ? `Nenhum pedido corresponde a "${search}".`
                  : 'Nenhum pedido pendente para este setor. Você está em dia!'}
              </p>
            </div>
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-xs font-bold text-primary hover:underline"
              >
                Limpar busca
              </button>
            )}
          </div>
        ) : (
          /* Colunas kanban */
          <div className="h-full flex gap-4 p-5 overflow-x-auto">
            {sectorGroups.map(({ station, jobs }) => (
              <div key={station} className="flex flex-col h-full shrink-0 w-[300px] lg:w-[320px]">
                <SectorColumn
                  station={station}
                  jobs={jobs}
                  onPrint={handlePrint}
                  onComplete={handleComplete}
                  updatingId={updatingId}
                  onViewTicket={setViewingTicketContent}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Modal de Visualização de Ticket ───────────────────────────── */}
      {viewingTicketContent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Visualização do ticket"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setViewingTicketContent(null)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <header className="px-5 py-4 border-b border-border/40 flex items-center justify-between bg-muted/20 rounded-t-2xl">
              <h3 className="text-base font-black text-foreground flex items-center gap-2">
                <ChefHat className="w-4 h-4 text-primary" />
                Visualização do Ticket
              </h3>
              <button
                type="button"
                onClick={() => setViewingTicketContent(null)}
                className="p-1.5 hover:bg-muted rounded-xl transition-all active:scale-90"
                aria-label="Fechar"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </header>

            <div className="p-5 overflow-y-auto flex-1">
              <pre className="whitespace-pre-wrap font-mono text-xs text-foreground bg-muted p-4 rounded-xl border border-border leading-relaxed">
                {viewingTicketContent}
              </pre>
            </div>

            <footer className="p-4 border-t border-border/40 flex justify-end gap-2 bg-muted/10 rounded-b-2xl">
              <button
                type="button"
                onClick={() => {
                  handlePrint(viewingTicketContent);
                  setViewingTicketContent(null);
                }}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black uppercase tracking-wider transition-all active:scale-95"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir
              </button>
              <button
                type="button"
                onClick={() => setViewingTicketContent(null)}
                className="px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-black uppercase tracking-wider transition-all active:scale-95"
              >
                Fechar
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
