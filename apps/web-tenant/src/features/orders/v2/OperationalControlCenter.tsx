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
  const action = (label: string, icon: ReactNode, key: Exclude<QuickAction, null>, allowed: boolean) => allowed ? <button type="button" onClick={() => setQuickAction(key)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-black text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="text-primary">{icon}</span>{label}</button> : null;
  return <section className="mb-5 overflow-hidden rounded-2xl border border-border bg-muted/20" aria-label="Controles operacionais">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
      <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-muted-foreground">Controles operacionais</p><p className="mt-1 text-sm font-black text-foreground">Cockpit do Gestor V2</p></div>
      <div className="flex flex-wrap gap-2">
        {action('Tempos e taxas', <Clock3 className="h-4 w-4" />, 'rates', has('delivery.manage'))}
        {action('Radar', <Map className="h-4 w-4" />, 'radar', has('delivery.read') && isFeatureEnabled('delivery_live_map'))}
        {action('Lançamentos', <Banknote className="h-4 w-4" />, 'cash', has('cash.read'))}
      </div>
    </div>
    <div className="grid gap-px bg-border md:grid-cols-3" role="tablist" aria-label="Canais operacionais">
      <Channel title="Delivery" icon={<Truck className="h-4 w-4" />} active={activeTab === 'delivery'} onClick={() => onTabChange('delivery')} lines={[`${counters.delivery.active} ativos`, `${counters.delivery.kitchen} na cozinha`, `${counters.delivery.ready} aguardando despacho`, `${counters.delivery.route} em rota`]} />
      <Channel title="Balcão / retirada" icon={<ReceiptText className="h-4 w-4" />} active={activeTab === 'pickup'} onClick={() => onTabChange('pickup')} lines={[`${counters.pickup.active} ativos`, `${counters.pickup.kitchen} na cozinha`, `${counters.pickup.ready} prontos para retirar`]} />
      {has('pos.read') && isFeatureEnabled('dine_in') ? <Channel title="Comandas" icon={<ReceiptText className="h-4 w-4" />} active={activeTab === 'dine_in'} onClick={() => onTabChange('dine_in')} lines={[`${counters.dineIn.active} pedidos ativos`, 'Atendimentos em mesa', `${alertCount} alertas operacionais ativos`]} /> : null}
    </div>
    {quickAction === 'rates' ? <OperationalOverlay title="Tempos e taxas" onClose={() => setQuickAction(null)}><DeliveryZonesPageRefactored /></OperationalOverlay> : null}
    {quickAction === 'radar' ? <OperationalOverlay title="Radar da frota" onClose={() => setQuickAction(null)} fullscreen><DeliveryMapPage /></OperationalOverlay> : null}
    {quickAction === 'cash' ? <OperationalOverlay title="Lançamentos de caixa" onClose={() => setQuickAction(null)}><CashPage /></OperationalOverlay> : null}
  </section>;
}

function Channel({ title, icon, lines, onClick, active }: { title: string; icon: ReactNode; lines: string[]; onClick: () => void; active: boolean }) {
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`min-h-28 bg-card border-b-4 p-4 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${active ? 'border-b-primary bg-primary/10' : 'border-b-transparent'}`}><p className="flex items-center gap-2 text-sm font-black text-foreground">{icon}{title}</p>{lines.map((line) => <p key={line} className="mt-1 text-xs font-semibold text-muted-foreground">{line}</p>)}</button>;
}
