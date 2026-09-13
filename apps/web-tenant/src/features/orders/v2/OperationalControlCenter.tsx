import { useEffect, useMemo, useState } from 'react';
import { Banknote, Clock3, Map, ReceiptText, Store, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { OrderBoardItemDTO, Tenant } from '@gestor/types';
import { api } from '../../../lib/api-client';
import { usePermissions } from '../../../hooks/use-tenant-auth';
import { getOperationalChannelCounters } from './operational-control-center';

export function OperationalControlCenter({ orders, alertCount }: { orders: readonly OrderBoardItemDTO[]; alertCount: number }) {
  const navigate = useNavigate();
  const { has } = usePermissions();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { void api.get<Tenant>('/tenant/me').then((r) => setTenant(r.data ?? null)).catch(() => setTenant(null)); }, []);
  const counters = useMemo(() => getOperationalChannelCounters(orders), [orders]);
  const paused = Boolean(tenant?.settings?.isStorePaused);
  const toggleStore = async () => {
    if (!has('settings.manage') || pending) return;
    setPending(true); setMessage(null);
    try {
      const response = await api.patch<Tenant>('/tenant/store-pause', { isStorePaused: !paused, storePauseReason: !paused ? 'Pausa operacional pelo Control Center' : '' });
      if (!response.success) throw new Error();
      setTenant(response.data ?? tenant); setMessage(!paused ? 'Loja pausada.' : 'Loja retomada.');
    } catch { setMessage('Não foi possível alterar o estado da loja.'); } finally { setPending(false); }
  };
  const action = (label: string, icon: React.ReactNode, path: string, allowed: boolean) => allowed ? <button type="button" onClick={() => navigate(path)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-black text-foreground hover:bg-muted"><span className="text-primary">{icon}</span>{label}</button> : null;
  return <section className="mb-5 overflow-hidden rounded-2xl border border-border bg-muted/20" aria-label="Controles operacionais">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
      <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-muted-foreground">Controles operacionais</p><p className={`mt-1 text-sm font-black ${paused ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>Loja: {paused ? 'PAUSADA' : 'ABERTA'}</p></div>
      <div className="flex flex-wrap gap-2">
        {has('settings.manage') ? <button type="button" disabled={pending} onClick={() => void toggleStore()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-black text-primary-foreground disabled:opacity-60"><Store className="h-4 w-4" />{pending ? 'Atualizando...' : paused ? 'Retomar loja' : 'Pausar loja'}</button> : null}
        {action('Tempos e taxas', <Clock3 className="h-4 w-4" />, '/delivery/rates', has('delivery.manage'))}
        {action('Radar', <Map className="h-4 w-4" />, '/delivery/map', has('delivery.read'))}
        {action('Lançamentos', <Banknote className="h-4 w-4" />, '/cash', has('cash.read'))}
      </div>
    </div>
    {message ? <p role="status" className="px-4 pt-3 text-xs font-bold text-muted-foreground">{message}</p> : null}
    <div className="grid gap-px bg-border md:grid-cols-3">
      <Channel title="Delivery" icon={<Truck className="h-4 w-4" />} onClick={() => navigate('/delivery/dispatch')} lines={[`${counters.delivery.active} ativos`, `${counters.delivery.kitchen} na cozinha`, `${counters.delivery.ready} aguardando despacho`, `${counters.delivery.route} em rota`]} />
      <Channel title="Balcão / retirada" icon={<ReceiptText className="h-4 w-4" />} onClick={() => navigate('/orders/manager?fulfillment=pickup')} lines={[`${counters.pickup.active} ativos`, `${counters.pickup.kitchen} na cozinha`, `${counters.pickup.ready} prontos para retirar`]} />
      {has('pos.read') ? <Channel title="Comandas" icon={<ReceiptText className="h-4 w-4" />} onClick={() => navigate('/pos/tables')} lines={[`${counters.dineIn.active} pedidos ativos`, 'Mesas e consumo no PDV', `${alertCount} alertas operacionais ativos`]} /> : null}
    </div>
  </section>;
}

function Channel({ title, icon, lines, onClick }: { title: string; icon: React.ReactNode; lines: string[]; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="min-h-28 bg-card p-4 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"><p className="flex items-center gap-2 text-sm font-black text-foreground">{icon}{title}</p>{lines.map((line) => <p key={line} className="mt-1 text-xs font-semibold text-muted-foreground">{line}</p>)}</button>;
}
