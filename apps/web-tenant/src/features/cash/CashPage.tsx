import { useState } from 'react';
import {
  useActiveSession,
  useCashSessionDetail,
  useCashSessions,
  useOpenCashSession,
  useCloseCashSession,
  useAddCashMovement,
} from './hooks/useCashSession';
import type { CashMovementDTO } from '@gestor/types';
import { Button } from '../../components/ui/Button';
import { CurrencyInput } from '@gestor/ui';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

const MOVEMENT_LABELS: Record<string, string> = {
  opening: 'Abertura',
  sale: 'Venda',
  withdrawal: 'Sangria',
  supply: 'Suprimento',
  refund: 'Estorno',
  adjustment: 'Ajuste',
  closing: 'Fechamento',
};

export default function CashPage() {
  const { data: activeSession, isLoading } = useActiveSession();
  const openMutation = useOpenCashSession();
  const closeMutation = useCloseCashSession();
  const movementMutation = useAddCashMovement();
  const { data: sessionsHistory } = useCashSessions(1, 10);

  const [openingAmount, setOpeningAmount] = useState<number | null>(null);
  const [closingAmount, setClosingAmount] = useState<number | null>(null);
  const [closingNotes, setClosingNotes] = useState('');
  const [movementAmount, setMovementAmount] = useState<number | null>(null);
  const [movementType, setMovementType] = useState<'withdrawal' | 'supply'>('withdrawal');
  const [movementDesc, setMovementDesc] = useState('');

  // Load detail for active session
  const { data: sessionDetail } = useCashSessionDetail(activeSession?.id ?? null);

  const handleOpen = () => {
    const amount = openingAmount;
    if (amount === null || isNaN(amount) || amount < 0) return;
    openMutation.mutate(amount, {
      onSuccess: () => setOpeningAmount(null),
    });
  };

  const handleClose = () => {
    if (!activeSession) return;
    const amount = closingAmount;
    if (amount === null || isNaN(amount) || amount < 0) return;
    closeMutation.mutate(
      { sessionId: activeSession.id, closingAmountDeclared: amount, notes: closingNotes || undefined },
      { onSuccess: () => { setClosingAmount(null); setClosingNotes(''); } },
    );
  };

  const handleMovement = () => {
    if (!activeSession) return;
    const amount = movementAmount;
    if (amount === null || isNaN(amount) || amount <= 0) return;
    movementMutation.mutate(
      { sessionId: activeSession.id, type: movementType, amount, description: movementDesc || undefined },
      { onSuccess: () => { setMovementAmount(null); setMovementDesc(''); } },
    );
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">Caixa Operacional</h1>

      {/* ========== NO ACTIVE SESSION ========== */}
      {!activeSession && (
        <div className="bg-card rounded-xl p-6 border border-border">
          <h2 className="text-lg font-semibold text-status-warning mb-4">Nenhum caixa aberto</h2>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm text-muted-foreground mb-1">Valor de Abertura (R$)</label>
              <CurrencyInput
                value={openingAmount}
                onChange={setOpeningAmount}
                className="input-premium"
              />
            </div>
            <Button
              onClick={handleOpen}
              disabled={openMutation.isPending}
              className="bg-status-success hover:opacity-90 text-white"
            >
              {openMutation.isPending ? 'Abrindo...' : 'Abrir Caixa'}
            </Button>
          </div>
          {openMutation.isError && (
            <p className="mt-2 text-destructive text-sm">{(openMutation.error as Error).message}</p>
          )}
        </div>
      )}

      {/* ========== ACTIVE SESSION ========== */}
      {activeSession && (
        <>
          {/* Session Info Banner */}
          <div className="bg-emerald-950/30 dark:bg-emerald-900/30 border border-emerald-700 rounded-xl p-4 flex justify-between items-center">
            <div>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">● Caixa Aberto</span>
              <p className="text-sm text-muted-foreground mt-1">
                Operador: {activeSession.operatorName} · Aberto em: {formatDate(activeSession.openedAt)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Abertura</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(activeSession.openingAmount)}</p>
            </div>
          </div>

          {/* Movements */}
          <div className="bg-card rounded-xl p-6 border border-border">
            <h2 className="text-lg font-semibold text-foreground mb-4">Sangria / Suprimento</h2>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Tipo</label>
                <select
                  value={movementType}
                  onChange={(e) => setMovementType(e.target.value as 'withdrawal' | 'supply')}
                  className="input-premium w-auto"
                >
                  <option value="withdrawal">Sangria</option>
                  <option value="supply">Suprimento</option>
                </select>
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="block text-sm text-muted-foreground mb-1">Valor (R$)</label>
                <CurrencyInput
                  value={movementAmount}
                  onChange={setMovementAmount}
                  className="input-premium"
                />
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="block text-sm text-muted-foreground mb-1">Descrição</label>
                <input
                  type="text"
                  value={movementDesc}
                  onChange={(e) => setMovementDesc(e.target.value)}
                  className="input-premium"
                  placeholder="Opcional"
                />
              </div>
              <Button
                onClick={handleMovement}
                disabled={movementMutation.isPending}
                variant="primary"
              >
                Registrar
              </Button>
            </div>
          </div>

          {/* Movements List */}
          {sessionDetail && sessionDetail.movements.length > 0 && (
            <div className="bg-card rounded-xl p-6 border border-border">
              <h2 className="text-lg font-semibold text-foreground mb-4">Movimentações da Sessão</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border">
                      <th className="text-left pb-2">Tipo</th>
                      <th className="text-right pb-2">Valor</th>
                      <th className="text-left pb-2">Descrição</th>
                      <th className="text-left pb-2">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionDetail.movements.map((m: CashMovementDTO) => (
                      <tr key={m.id} className="border-b border-border/50 text-foreground">
                        <td className="py-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            m.type === 'sale' ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300' :
                            m.type === 'withdrawal' ? 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300' :
                            m.type === 'supply' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300' :
                            m.type === 'refund' ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {MOVEMENT_LABELS[m.type] || m.type}
                          </span>
                        </td>
                        <td className="py-2 text-right font-mono">{formatCurrency(m.amount)}</td>
                        <td className="py-2 text-muted-foreground">{m.description || '—'}</td>
                        <td className="py-2 text-muted-foreground">{formatDate(m.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-card border border-border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Vendas</p>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(sessionDetail.totalSales)}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Dinheiro</p>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(sessionDetail.totalCash)}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">PIX</p>
                  <p className="text-lg font-bold text-cyan-600 dark:text-cyan-400">{formatCurrency(sessionDetail.totalPix)}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Crédito</p>
                  <p className="text-lg font-bold text-violet-600 dark:text-violet-400">{formatCurrency(sessionDetail.totalCreditCard)}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Débito</p>
                  <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{formatCurrency(sessionDetail.totalDebitCard)}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Outros</p>
                  <p className="text-lg font-bold text-muted-foreground">{formatCurrency(sessionDetail.totalOther)}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Sangrias</p>
                  <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(sessionDetail.totalWithdrawals)}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Suprimentos</p>
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatCurrency(sessionDetail.totalSupplies)}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Estornos</p>
                  <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{formatCurrency(sessionDetail.totalRefunds)}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Esperado</p>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(sessionDetail.expectedAmount)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Close Cash Register */}
          <div className="bg-card rounded-xl p-6 border border-destructive/30">
            <h2 className="text-lg font-semibold text-destructive mb-4">Fechar Caixa</h2>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[150px]">
                <label className="block text-sm text-muted-foreground mb-1">Valor Contado (R$)</label>
                <CurrencyInput
                  value={closingAmount}
                  onChange={setClosingAmount}
                  className="input-premium"
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <label className="block text-sm text-muted-foreground mb-1">Observação</label>
                <input
                  type="text"
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  className="input-premium"
                  placeholder="Opcional"
                />
              </div>
              <Button
                onClick={handleClose}
                disabled={closeMutation.isPending}
                variant="destructive"
              >
                {closeMutation.isPending ? 'Fechando...' : 'Fechar Caixa'}
              </Button>
            </div>
            {closeMutation.isSuccess && closeMutation.data && (
              <div className="mt-4 bg-muted rounded-lg p-4">
                <h3 className="text-sm font-semibold text-foreground mb-2">Resumo do Fechamento</h3>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Declarado</p>
                    <p className="text-foreground font-mono">{formatCurrency(closeMutation.data.closingAmountDeclared ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Calculado</p>
                    <p className="text-foreground font-mono">{formatCurrency(closeMutation.data.closingAmountCalculated ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Diferença</p>
                    <p className={`font-mono font-bold ${(closeMutation.data.closingDifference ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatCurrency(closeMutation.data.closingDifference ?? 0)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {sessionsHistory && sessionsHistory.data.length > 0 && (
        <div className="bg-card rounded-xl p-6 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">Histórico de Sessões</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left pb-2">Operador</th>
                  <th className="text-left pb-2">Status</th>
                  <th className="text-left pb-2">Abertura</th>
                  <th className="text-left pb-2">Fechamento</th>
                  <th className="text-right pb-2">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {sessionsHistory.data.map((session) => (
                  <tr key={session.id} className="border-b border-border/50 text-foreground">
                    <td className="py-2">{session.operatorName}</td>
                    <td className="py-2">
                      <span className={session.status === 'open' ? 'text-status-success font-semibold' : 'text-muted-foreground font-semibold'}>
                        {session.status === 'open' ? 'Aberto' : 'Fechado'}
                      </span>
                    </td>
                    <td className="py-2">{formatDate(session.openedAt)}</td>
                    <td className="py-2">{session.closedAt ? formatDate(session.closedAt) : '-'}</td>
                    <td className="py-2 text-right font-mono">{formatCurrency(session.closingDifference ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
