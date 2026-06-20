import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Clock3, Loader2, Store, X } from 'lucide-react';

export type StoreStatusState = 'open' | 'paused' | 'closed';

interface StoreStatusBadgeProps {
  status: StoreStatusState;
  onManage?: () => void;
  compact?: boolean;
}

interface StoreStatusControlProps {
  isPaused: boolean;
  pauseReason: string;
  onTogglePause: (nextPaused: boolean, reason: string) => Promise<void>;
}

function statusTone(status: StoreStatusState) {
  if (status === 'paused') {
    return {
      wrapper: 'bg-status-warning/10 text-status-warning border-status-warning/20',
      dot: 'bg-status-warning',
      label: 'Loja pausada',
      helper: 'Clique para gerenciar',
    };
  }

  if (status === 'closed') {
    return {
      wrapper: 'bg-destructive/10 text-destructive border-destructive/20',
      dot: 'bg-destructive',
      label: 'Loja fechada',
      helper: 'Clique para gerenciar',
    };
  }

  return {
    wrapper: 'bg-status-success/10 text-status-success border-status-success/20',
    dot: 'bg-status-success',
    label: 'Loja aberta',
    helper: 'Clique para gerenciar',
  };
}

export function StoreStatusBadge({ status, onManage, compact = false }: StoreStatusBadgeProps) {
  const tone = useMemo(() => statusTone(status), [status]);

  if (compact) {
    return (
      <button
        type="button"
        onClick={onManage}
        title="Abrir configurações da loja"
        className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${status === 'paused' ? 'border-status-warning/20 bg-status-warning/10 text-status-warning' : status === 'closed' ? 'border-destructive/20 bg-destructive/10 text-destructive' : 'border-status-success/20 bg-status-success/10 text-status-success'}`}
      >
        <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
        <span>{tone.label}</span>
      </button>
    );
  }

  return (
    <div className={`rounded-2xl border p-3 ${tone.wrapper}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 h-9 w-9 shrink-0 rounded-xl border border-current/20 ${compact ? 'hidden sm:flex' : 'flex'} items-center justify-center bg-card/40`}>
          <Store className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
            <p className="text-[11px] font-black uppercase tracking-[0.22em]">{tone.label}</p>
          </div>
          <p className="mt-1 text-xs font-medium opacity-80">{tone.helper}</p>
        </div>
        {onManage ? (
          <button
            type="button"
            onClick={onManage}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-current/15 bg-card/50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-foreground transition hover:bg-card"
          >
            <span>Gerenciar</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function StoreStatusControl({
  isPaused,
  pauseReason,
  onTogglePause,
}: StoreStatusControlProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftReason, setDraftReason] = useState(pauseReason);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraftReason(pauseReason);
  }, [pauseReason, isPaused]);

  const nextPaused = !isPaused;
  const tone = statusTone(isPaused ? 'paused' : 'open');

  const title = nextPaused ? 'Pausar loja?' : 'Reabrir loja?';
  const description = nextPaused
    ? 'Sua loja deixará de receber novos pedidos até ser reaberta.'
    : 'Sua loja voltará a receber pedidos conforme os horários configurados.';
  const actionLabel = nextPaused ? 'Pausar agora' : 'Reabrir agora';

  const handleConfirm = async () => {
    setError('');
    setIsSaving(true);
    try {
      await onTogglePause(nextPaused, nextPaused ? draftReason.trim() : pauseReason.trim());
      setIsConfirmOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar o status da loja.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${isPaused ? 'border-status-warning/20 bg-status-warning/5' : 'border-border bg-card'}`}>
      <div className="flex items-start gap-4">
        <div className={`rounded-2xl p-3 ${isPaused ? 'bg-status-warning/10 text-status-warning' : 'bg-status-success/10 text-status-success'}`}>
          <Clock3 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-foreground">Status da loja</h2>
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                Pause temporariamente sua loja para não receber novos pedidos.
              </p>
            </div>
            <span className={`text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${isPaused ? 'bg-status-warning/10 text-status-warning' : 'bg-status-success/10 text-status-success'}`}>
              {isPaused ? 'Pausada' : 'Ativa'}
            </span>
          </div>

          <div className="mt-4">
            <div className={`rounded-2xl border p-4 ${tone.wrapper}`}>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
                <p className="text-sm font-black uppercase tracking-[0.22em]">{isPaused ? 'Loja pausada' : 'Loja aberta'}</p>
              </div>
              <p className="mt-2 text-xs font-medium opacity-80">
                {isPaused
                  ? 'Clique para reabrir quando estiver pronto.'
                  : 'Clique para pausar a operação com segurança.'}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIsConfirmOpen(true)}
              className={`rounded-2xl px-4 py-2.5 text-sm font-bold transition-all shadow-sm ${isPaused ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-status-warning text-slate-950 hover:bg-status-warning/90'}`}
            >
              {actionLabel}
            </button>
            <span className="text-xs font-medium text-muted-foreground">
              {isPaused ? 'Próximo passo: confirmar a reabertura.' : 'Ação controlada com confirmação.'}
            </span>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
              {error}
            </div>
          ) : null}
        </div>
      </div>

      {isConfirmOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setIsConfirmOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-[28px] border border-border bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-border px-6 py-5">
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-muted-foreground">
                  Confirmação
                </div>
                <h3 className="mt-2 text-xl font-black text-foreground">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{description}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="rounded-xl p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              {nextPaused ? (
                <label className="block">
                  <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.24em] text-muted-foreground">
                    Motivo da pausa
                  </span>
                  <textarea
                    value={draftReason}
                    onChange={(e) => setDraftReason(e.target.value)}
                    placeholder="Opcional"
                    className="min-h-[96px] w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary"
                  />
                </label>
              ) : null}

              <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2 font-bold text-foreground">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Ação sensível
                </div>
                <p className="mt-2">
                  {nextPaused
                    ? 'Pedidos novos serão interrompidos até a loja ser reaberta.'
                    : 'A loja voltará a receber pedidos de acordo com os horários configurados.'}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="rounded-2xl border border-border bg-background px-4 py-3 text-sm font-bold text-foreground transition hover:bg-muted/40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {actionLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
