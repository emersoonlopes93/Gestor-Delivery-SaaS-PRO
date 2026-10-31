import { CheckCircle2, Clock3, RefreshCw, WifiOff } from 'lucide-react';
import type { OrdersRealtimeConnectionState } from '../../../notifications/ordersRealtimeEvents';

function confirmationCopy(lastConfirmedAt: number | null, now: number): string {
  if (lastConfirmedAt === null) return 'aguardando primeira confirmação';
  const seconds = Math.max(0, Math.floor((now - lastConfirmedAt) / 1_000));
  if (seconds < 15) return 'confirmado agora';
  if (seconds < 60) return `confirmado há ${seconds}s`;
  return `confirmado há ${Math.floor(seconds / 60)} min`;
}

export function OrdersFreshnessStatus(props: {
  connectionState: OrdersRealtimeConnectionState;
  isStale: boolean;
  lastConfirmedAt: number | null;
  now: number;
}) {
  const { connectionState, isStale, lastConfirmedAt, now } = props;
  const connected = connectionState === 'connected';
  const copy = isStale
    ? `Conferindo conexão · ${confirmationCopy(lastConfirmedAt, now)}`
    : connected
      ? `Tempo real ativo · ${confirmationCopy(lastConfirmedAt, now)}`
      : connectionState === 'reconnecting' || connectionState === 'connecting'
        ? `Reconectando · ${confirmationCopy(lastConfirmedAt, now)}`
        : `Sem tempo real · ${confirmationCopy(lastConfirmedAt, now)}`;
  const Icon = isStale
    ? Clock3
    : connected
      ? CheckCircle2
      : connectionState === 'disconnected'
        ? WifiOff
        : RefreshCw;

  return (
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold ${
        connected && !isStale
          ? 'text-emerald-700 dark:text-emerald-300'
          : 'text-amber-700 dark:text-amber-300'
      }`}
    >
      <Icon className={`h-3.5 w-3.5 ${connectionState === 'reconnecting' || connectionState === 'connecting' ? 'animate-spin' : ''}`} aria-hidden="true" />
      {copy}
    </p>
  );
}
