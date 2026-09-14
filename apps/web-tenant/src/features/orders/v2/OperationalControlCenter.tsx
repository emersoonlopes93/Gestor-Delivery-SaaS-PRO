import { useMemo, useState, type ReactNode } from 'react';
import { Banknote, Clock3, Map, ReceiptText, Truck } from 'lucide-react';
import type { OrderBoardItemDTO } from '@gestor/types';
import { usePermissions } from '../../../hooks/use-tenant-auth';
import { useTenantCapabilities } from '../../../hooks/useTenantCapabilities';
import { DeliveryZonesPageRefactored } from '../../delivery/DeliveryZonesPageRefactored';
import { DeliveryMapPage } from '../../delivery/DeliveryMapPage';
import CashPage from '../../cash/CashPage';
import { OperationalOverlay } from './OperationalOverlay';
import { getOperationalChannelCounters, type OperationalTab } from './operational-control-center';

type QuickAction = 'rates' | 'radar' | 'cash' | null;

export function OperationalControlCenter({ orders, alertCount, activeTab, onTabChange }: { orders: readonly OrderBoardItemDTO[]; alertCount: number; activeTab: OperationalTab; onTabChange: (tab: OperationalTab) => void }) {
  const { has } = usePermissions();
  const { isFeatureEnabled } = useTenantCapabilities();
  const [quickAction, setQuickAction] = useState<QuickAction>(null);
  const counters = useMemo(() => getOperationalChannelCounters(orders), [orders]);
  const action = (label: string, icon: ReactNode, key: Exclude<QuickAction, null>, allowed: boolean) => allowed ? <button type="button" onClick={() => setQuickAction(key)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border bg-background px-2 text-[10px] font-black text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="text-primary">{icon}</span>{label}</button> : null;
  return <section className="mb-3 overflow-hidden rounded-2xl border border-border bg-muted/20" aria-label="Controles operacionais">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
      <p className="text-xs font-black text-foreground">Operação</p>
      <div className="flex flex-wrap gap-1">
        {action('Tempos e taxas', <Clock3 className="h-4 w-4" />, 'rates', has('delivery.manage'))}
        {action('Radar', <Map className="h-4 w-4" />, 'radar', has('delivery.read') && isFeatureEnabled('delivery_live_map'))}
        {action('Lançamentos', <Banknote className="h-4 w-4" />, 'cash', has('cash.read'))}
      </div>
    </div>
    <div className="grid grid-cols-3 gap-px bg-border" role="tablist" aria-label="Canais operacionais">
      <Channel title="Delivery" icon={<Truck className="h-4 w-4" />} active={activeTab === 'delivery'} onClick={() => onTabChange('delivery')} primary={`${counters.delivery.active} ativos`} detail={`${counters.delivery.kitchen} cozinha · ${counters.delivery.ready} prontos · ${counters.delivery.route} rota`} />
      <Channel title="Balcão / retirada" icon={<ReceiptText className="h-4 w-4" />} active={activeTab === 'pickup'} onClick={() => onTabChange('pickup')} primary={`${counters.pickup.active} ativos`} detail={`${counters.pickup.kitchen} cozinha · ${counters.pickup.ready} retirar`} />
      {has('pos.read') && isFeatureEnabled('dine_in') ? <Channel title="Comandas" icon={<ReceiptText className="h-4 w-4" />} active={activeTab === 'dine_in'} onClick={() => onTabChange('dine_in')} primary={`${counters.dineIn.active} ativas`} detail={`${alertCount} alertas operacionais`} /> : null}
    </div>
    {quickAction === 'rates' ? <OperationalOverlay title="Tempos e taxas" onClose={() => setQuickAction(null)}><DeliveryZonesPageRefactored /></OperationalOverlay> : null}
    {quickAction === 'radar' ? <OperationalOverlay title="Radar da frota" onClose={() => setQuickAction(null)} fullscreen><DeliveryMapPage /></OperationalOverlay> : null}
    {quickAction === 'cash' ? <OperationalOverlay title="Lançamentos de caixa" onClose={() => setQuickAction(null)}><CashPage /></OperationalOverlay> : null}
  </section>;
}

function Channel({ title, icon, primary, detail, onClick, active }: { title: string; icon: ReactNode; primary: string; detail: string; onClick: () => void; active: boolean }) {
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`min-h-[76px] bg-card border-b-4 p-2.5 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:p-3 ${active ? 'border-b-primary bg-primary/10' : 'border-b-transparent'}`}><p className="flex items-center gap-1.5 text-xs font-black text-foreground sm:text-sm">{icon}<span className="truncate">{title}</span></p><p className="mt-1 text-xs font-black tabular-nums text-foreground">{primary}</p><p className="mt-0.5 truncate text-[9px] font-semibold text-muted-foreground sm:text-[10px]">{detail}</p></button>;
}
