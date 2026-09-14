import { useMemo, useState, type ReactNode } from 'react';
import { Banknote, Clock3, Map, ReceiptText, Truck } from 'lucide-react';
import type { OrderBoardItemDTO } from '@gestor/types';
import { usePermissions } from '../../../hooks/use-tenant-auth';
import { useTenantCapabilities } from '../../../hooks/useTenantCapabilities';
import { DeliveryZonesPageRefactored } from '../../delivery/DeliveryZonesPageRefactored';
import CashPage from '../../cash/CashPage';
import { OperationalOverlay } from './OperationalOverlay';
import { getOperationalChannelCounters, type OperationalTab } from './operational-control-center';
import { OperationalRadar } from './OperationalRadar';

type QuickAction = 'rates' | 'radar' | 'cash' | null;

export function OperationalControlCenter({ orders, alertCount, activeTab, onTabChange, onOpenOrder }: { orders: readonly OrderBoardItemDTO[]; alertCount: number; activeTab: OperationalTab; onTabChange: (tab: OperationalTab) => void; onOpenOrder: (order: OrderBoardItemDTO) => void }) {
  const { has } = usePermissions();
  const { isFeatureEnabled } = useTenantCapabilities();
  const [quickAction, setQuickAction] = useState<QuickAction>(null);
  const counters = useMemo(() => getOperationalChannelCounters(orders), [orders]);
  const action = (label: string, icon: ReactNode, key: Exclude<QuickAction, null>, allowed: boolean) => allowed ? <button type="button" onClick={() => setQuickAction(key)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border bg-background px-2 text-[10px] font-black text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="text-primary">{icon}</span>{label}</button> : null;
  return <section className="mb-3 overflow-hidden rounded-2xl border border-border bg-muted/20" aria-label="Controles operacionais">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2" aria-label={`Operação com ${alertCount} alertas ativos`}>
      <p className="text-xs font-black text-foreground">Operação</p>
      <div className="flex flex-wrap gap-1">
        {action('Tempos e taxas', <Clock3 className="h-4 w-4" />, 'rates', has('delivery.manage'))}
        {action('Radar', <Map className="h-4 w-4" />, 'radar', has('delivery.read') && isFeatureEnabled('delivery_live_map'))}
        {action('Lançamentos', <Banknote className="h-4 w-4" />, 'cash', has('cash.read'))}
      </div>
    </div>
    <div className="grid gap-2 bg-background p-2 sm:grid-cols-3 sm:gap-3 sm:p-3" role="tablist" aria-label="Canais operacionais">
      <ModeChannel title="Delivery" icon={<Truck className="h-5 w-5" />} tone="primary" active={activeTab === 'delivery'} onClick={() => onTabChange('delivery')} activeCount={counters.delivery.active} chips={[{ label: 'Cozinha', value: counters.delivery.kitchen, tone: 'amber' }, { label: 'Entrega', value: counters.delivery.ready + counters.delivery.route, tone: 'emerald' }]} />
      <ModeChannel title="Balcão" icon={<ReceiptText className="h-5 w-5" />} tone="sky" active={activeTab === 'pickup'} onClick={() => onTabChange('pickup')} activeCount={counters.pickup.active} chips={[{ label: 'Cozinha', value: counters.pickup.kitchen, tone: 'amber' }, { label: 'Retirar', value: counters.pickup.ready, tone: 'emerald' }]} />
      {has('pos.read') && isFeatureEnabled('dine_in') ? <ModeChannel title="Comandas" icon={<ReceiptText className="h-5 w-5" />} tone="orange" active={activeTab === 'dine_in'} onClick={() => onTabChange('dine_in')} activeCount={counters.dineIn.active} statusLabel="Operação" statusValue={counters.dineIn.active > 0 ? 'Ativa' : 'Sem atividade'} /> : null}
    </div>
    {quickAction === 'rates' ? <OperationalOverlay title="Tempos e taxas" onClose={() => setQuickAction(null)}><DeliveryZonesPageRefactored /></OperationalOverlay> : null}
    {quickAction === 'radar' ? <OperationalOverlay title="Radar da frota" onClose={() => setQuickAction(null)} fullscreen><OperationalRadar orders={orders} onOpenOrder={onOpenOrder} /></OperationalOverlay> : null}
    {quickAction === 'cash' ? <OperationalOverlay title="Lançamentos de caixa" onClose={() => setQuickAction(null)}><CashPage /></OperationalOverlay> : null}
  </section>;
}

type ModeTone = 'primary' | 'sky' | 'orange';
type ChipTone = 'amber' | 'emerald';

function ModeChannel({ title, icon, activeCount, chips = [], statusLabel, statusValue, onClick, active, tone }: { title: string; icon: ReactNode; activeCount: number; chips?: readonly { label: string; value: number; tone: ChipTone }[]; statusLabel?: string; statusValue?: string; onClick: () => void; active: boolean; tone: ModeTone }) {
  const iconTone: Record<ModeTone, string> = { primary: 'bg-primary/15 text-primary', sky: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', orange: 'bg-orange-500/15 text-orange-700 dark:text-orange-300' };
  const chipTone: Record<ChipTone, string> = { amber: 'bg-amber-500/10 text-amber-800 dark:text-amber-300', emerald: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' };
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`min-h-[64px] rounded-xl border bg-card px-3 py-2 text-left shadow-sm transition hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-[68px] ${active ? 'border-primary ring-1 ring-primary/70' : 'border-border'}`}>
    <span className="flex h-full items-center gap-3">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${iconTone[tone]}`}>{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-[10px] font-black uppercase tracking-wide text-muted-foreground">{title}</span><span className="mt-0.5 flex items-baseline gap-1"><strong className="text-lg font-black tabular-nums text-foreground">{activeCount}</strong><small className="text-[10px] font-bold text-muted-foreground">ativos</small></span></span>
      {chips.length > 0 ? <span className="flex shrink-0 gap-1.5">{chips.map((chip) => <span key={chip.label} className={`grid min-w-12 rounded-md px-1.5 py-1 text-center ${chipTone[chip.tone]}`}><small className="text-[8px] font-black uppercase leading-none">{chip.label}</small><strong className="mt-1 text-sm font-black leading-none tabular-nums">{chip.value}</strong></span>)}</span> : <span className="shrink-0 text-right"><small className="block text-[9px] font-bold text-muted-foreground">{statusLabel}</small><strong className="block text-xs font-black text-emerald-700 dark:text-emerald-300">{statusValue}</strong></span>}
    </span>
  </button>;
}
