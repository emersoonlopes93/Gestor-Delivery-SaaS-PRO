import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { api } from '../../../lib/api-client';
import { usePermissions } from '../../../hooks/use-tenant-auth';
import { useTenantCapabilities } from '../../../hooks/useTenantCapabilities';
import { ORDER_ALERT_CENTER_TOGGLE_EVENT } from './order-alert-coordinator';

type OrderAlertSummary = { state: 'ACTIVE' | 'RECOVERED' };

/** Global trigger only; acknowledgement remains authoritative in Gestor V2. */
export function OrderAlertTopbarButton() {
  const { has } = usePermissions();
  const { isFeatureEnabled } = useTenantCapabilities();
  const canUseKanban = has('orders.use_kanban') && isFeatureEnabled('order_manager_v2');
  const [activeCount, setActiveCount] = useState(0);
  useEffect(() => {
    if (!canUseKanban) return;
    const refresh = async () => {
      try {
        const response = await api.get<OrderAlertSummary[]>('/order-alerts');
        setActiveCount((response.data ?? []).filter((alert) => alert.state === 'ACTIVE').length);
      } catch { /* The manager retains its own reconciliation fallback. */ }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [canUseKanban]);
  if (!canUseKanban) return null;
  return <button type="button" onClick={() => window.dispatchEvent(new Event(ORDER_ALERT_CENTER_TOGGLE_EVENT))} className="relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground transition hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" title="Alertas operacionais" aria-label={`Abrir alertas operacionais${activeCount ? `, ${activeCount} ativos` : ''}`}><BellRing className="h-4 w-4" aria-hidden />{activeCount > 0 ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-black text-destructive-foreground">{activeCount}</span> : null}</button>;
}
