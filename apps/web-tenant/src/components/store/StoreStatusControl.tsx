import { useMemo } from 'react';
import { Store } from 'lucide-react';
import { Switch } from '../ui/Switch';
import type { StoreOperationalStatus } from './store-operational-status';

interface StoreStatusControlProps {
  status: StoreOperationalStatus;
  isPaused: boolean;
  canTogglePause: boolean;
  nextOpenTime: string | null;
  isSaving: boolean;
  onTogglePause: (nextPaused: boolean) => void;
}

function statusTone(status: StoreOperationalStatus) {
  if (status === 'paused') {
    return {
      wrapper: 'border-status-warning/20 bg-status-warning/10 text-status-warning',
      dot: 'bg-status-warning',
      label: 'Loja Pausada',
    };
  }
  if (status === 'closed') {
    return {
      wrapper: 'border-destructive/20 bg-destructive/10 text-destructive',
      dot: 'bg-destructive',
      label: 'Loja Fechada',
    };
  }
  return {
    wrapper: 'border-status-success/20 bg-status-success/10 text-status-success',
    dot: 'bg-status-success',
    label: 'Loja Aberta',
  };
}

export function StoreStatusControl({
  status,
  isPaused,
  canTogglePause,
  nextOpenTime,
  isSaving,
  onTogglePause,
}: StoreStatusControlProps) {
  const tone = useMemo(() => statusTone(status), [status]);
  const helper = status === 'closed' && nextOpenTime ? `Abre às ${nextOpenTime}` : 'Receber pedidos';

  return (
    <div className={`w-full rounded-xl border px-3 py-2 ${tone.wrapper}`}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Store className="h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
              <span className="truncate text-[11px] font-black uppercase tracking-wider">{tone.label}</span>
            </div>
            <p className="mt-0.5 truncate text-[10px] font-semibold opacity-80">{helper}</p>
          </div>
        </div>
        <Switch
          checked={status === 'open' && !isPaused}
          onCheckedChange={(checked) => onTogglePause(!checked)}
          disabled={!canTogglePause || isSaving}
          aria-label={canTogglePause ? (isPaused ? 'Retomar recebimento de pedidos' : 'Pausar recebimento de pedidos') : 'Recebimento indisponível fora do horário'}
          title={canTogglePause ? 'Pausar ou retomar pedidos' : 'Disponível somente dentro do horário de funcionamento'}
        />
      </div>
    </div>
  );
}
