import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ClipboardList, History, PackageOpen, Radio } from 'lucide-react';
import type { OrderBoardItemDTO, OrderOperationalAction, OrderResponseDTO } from '@gestor/types';
import { api } from '../../../lib/api-client';
import { OrderTimelineSection } from '../components/OrderTimelineSection';
import { ORDER_STATUS_PRESENTATION } from '../order-presenters';
import { ModalShell } from './ModalShell';
import { formatElapsed, isRunnableStatusAction } from './order-manager-v2';

type Props = { order: OrderBoardItemDTO | null; now: number; onClose: () => void; onAction: (order: OrderBoardItemDTO, action: OrderOperationalAction) => void; isActionPending: boolean };

export function OrderDetailsModalV2({ order, now, onClose, onAction, isActionPending }: Props) {
  const [detail, setDetail] = useState<OrderResponseDTO | null>(null);
  const [detailState, setDetailState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [tab, setTab] = useState<'summary' | 'timeline'>('summary');
  useEffect(() => {
    setDetail(null);
    if (!order) { setDetailState('idle'); return; }
    setDetailState('loading');
    void api.get<OrderResponseDTO>(`/orders/${order.id}`)
      .then((response) => { setDetail(response.data ?? null); setDetailState(response.data ? 'ready' : 'error'); })
      .catch(() => { setDetail(null); setDetailState('error'); });
  }, [order]);
  return <ModalShell open={Boolean(order)} title={order ? `Pedido #${order.orderNumber}` : 'Pedido'} onClose={onClose}>
    <div className="p-5 sm:p-7">
      {order ? <section className="mb-5 grid gap-px border border-border bg-border sm:grid-cols-4" aria-label="Resumo operacional do pedido">
        <OperationalSummary label="Status" value={ORDER_STATUS_PRESENTATION[order.status].label} icon={<Activity className="h-3.5 w-3.5" />} />
        <OperationalSummary label="Tempo aberto" value={formatElapsed(order.createdAt, now)} icon={<Radio className="h-3.5 w-3.5" />} />
        <OperationalSummary label="Sincronizacao" value={order.operational.syncState === 'FAILED' ? 'Falha - verificar' : order.operational.syncState === 'PENDING' ? 'Em andamento' : 'Confirmada'} icon={order.operational.syncState === 'FAILED' ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> : <Radio className="h-3.5 w-3.5" />} />
        <OperationalSummary label="Proxima acao" value={order.operational.primaryAction?.label ?? 'Somente consulta'} icon={<ClipboardList className="h-3.5 w-3.5" />} />
      </section> : null}
      {order ? <section className="mb-5 flex flex-wrap gap-2" aria-label="Acoes de status do pedido">
        {order.operational.availableActions.filter(isRunnableStatusAction).map((action) => <button key={action.type} type="button" disabled={isActionPending} onClick={() => onAction(order, action)} className="border border-primary bg-primary px-3 py-2 text-xs font-black text-primary-foreground hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60">{isActionPending ? 'Atualizando...' : action.label}</button>)}
      </section> : null}
      <div className="mb-6 flex gap-2 border-b border-border">
        <button type="button" onClick={() => setTab('summary')} className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-xs font-black ${tab === 'summary' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}><ClipboardList className="h-4 w-4" />Resumo</button>
        <button type="button" onClick={() => setTab('timeline')} className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-xs font-black ${tab === 'timeline' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}><History className="h-4 w-4" />Timeline</button>
      </div>
      {tab === 'summary' ? <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <section className="border border-border bg-muted/20 p-4"><h3 className="mb-3 text-[11px] font-black uppercase tracking-wider text-muted-foreground">Itens</h3>{detail ? <ul className="space-y-3">{detail.items.map((item) => <li key={item.id} className="flex justify-between gap-4 text-sm"><span><strong>{item.quantity}×</strong> {item.snapshotName}</span><span className="font-bold">R$ {item.lineTotal.toFixed(2)}</span></li>)}</ul> : detailState === 'error' ? <p role="alert" className="text-sm font-semibold text-destructive">Os detalhes não estão disponíveis agora. O contexto do quadro foi preservado.</p> : <p className="text-sm text-muted-foreground">Carregando detalhes do pedido…</p>}</section>
        <aside className="space-y-3"><div className="border border-border p-4"><p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Operação</p><p className="mt-2 text-sm font-bold text-foreground">{order?.operational.deliverySummary.label}</p><p className="mt-1 text-xs text-muted-foreground">Canal: {order?.operational.displayChannel}</p></div><div className="border border-border p-4"><p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Observações</p><p className="mt-2 text-sm text-foreground">{detail?.notes || 'Sem observações.'}</p></div></aside>
      </div> : <section className="max-w-xl border border-border bg-muted/15 p-5"><div className="mb-4 flex items-center gap-2 text-sm font-black"><PackageOpen className="h-4 w-4 text-primary" />Linha do tempo somente leitura</div>{detail ? <OrderTimelineSection timeline={detail.timeline} /> : detailState === 'error' ? <p role="alert" className="text-sm font-semibold text-destructive">A timeline não está disponível agora.</p> : <p className="text-sm text-muted-foreground">Carregando timeline…</p>}</section>}
    </div>
  </ModalShell>;
}

function OperationalSummary({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="bg-card px-3 py-3"><p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground">{icon}{label}</p><p className="mt-1.5 text-xs font-black text-foreground">{value}</p></div>;
}
