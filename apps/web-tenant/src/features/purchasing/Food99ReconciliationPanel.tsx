import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import type {
  FinancialAccountDTO,
  Food99FinancialSyncResultDTO,
  Food99ReconciliationDTO,
  Food99SettlementDTO,
} from '@gestor/types';
import { AlertTriangle, CheckCircle2, RefreshCw, WalletCards } from 'lucide-react';
import { ApiError, api } from '../../lib/api-client';
import { Card } from '../../components/ui/Card';

type Props = { canManage: boolean };

const emptyReconciliation: Food99ReconciliationDTO = {
  connections: [],
  settlements: [],
  billEntries: [],
};

export function Food99ReconciliationPanel({ canManage }: Props) {
  const defaultPeriod = useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') };
  }, []);
  const [startDate, setStartDate] = useState(defaultPeriod.start);
  const [endDate, setEndDate] = useState(defaultPeriod.end);
  const [data, setData] = useState<Food99ReconciliationDTO>(emptyReconciliation);
  const [accounts, setAccounts] = useState<FinancialAccountDTO[]>([]);
  const [connectionId, setConnectionId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessNotEnabled, setAccessNotEnabled] = useState(false);
  const [syncSummary, setSyncSummary] = useState<Food99FinancialSyncResultDTO | null>(null);

  const load = useCallback(async (selectedConnectionId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ startDate, endDate });
      if (selectedConnectionId) query.set('connectionId', selectedConnectionId);
      const [reconciliationResponse, accountsResponse] = await Promise.all([
        api.get<Food99ReconciliationDTO>(`/finance/marketplaces/99food/reconciliation?${query.toString()}`),
        api.get<FinancialAccountDTO[]>('/finance/accounts'),
      ]);
      if (reconciliationResponse.success) {
        setData(reconciliationResponse.data);
        const selected = selectedConnectionId
          ? reconciliationResponse.data.connections.find((connection) => connection.id === selectedConnectionId)
          : undefined;
        setAccountId(selected?.settlementFinancialAccountId ?? '');
      }
      if (accountsResponse.success) setAccounts(accountsResponse.data.filter((account) => account.active));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao carregar a conciliação 99Food.');
    } finally {
      setLoading(false);
    }
  }, [endDate, startDate]);

  useEffect(() => {
    void load(connectionId || undefined);
  }, [connectionId, load]);

  const sync = async () => {
    if (!connectionId) return;
    setWorking(true);
    setError(null);
    setAccessNotEnabled(false);
    try {
      const response = await api.post<Food99FinancialSyncResultDTO>('/finance/marketplaces/99food/sync', {
        connectionId,
        startDate,
        endDate,
      });
      if (response.success) setSyncSummary(response.data);
      await load(connectionId);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'FINANCE_ACCESS_NOT_ENABLED') {
        setAccessNotEnabled(true);
      } else {
        setError(caught instanceof Error ? caught.message : 'Falha ao sincronizar a 99Food.');
      }
    } finally {
      setWorking(false);
    }
  };

  const saveAccount = async () => {
    if (!connectionId) return;
    setWorking(true);
    setError(null);
    try {
      await api.put(`/finance/marketplaces/99food/connections/${connectionId}/settlement-account`, {
        accountId: accountId || null,
      });
      await load(connectionId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao configurar a conta de destino.');
    } finally {
      setWorking(false);
    }
  };

  const postSettlement = async (settlement: Food99SettlementDTO) => {
    setWorking(true);
    setError(null);
    try {
      await api.post(`/finance/marketplaces/99food/settlements/${settlement.id}/post`);
      await load(connectionId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao registrar o repasse.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="mb-6" aria-labelledby="food99-reconciliation-title">
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-muted/35 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">99Food</p>
              <h2 id="food99-reconciliation-title" className="mt-1 text-lg font-semibold text-foreground">Conciliação de repasses</h2>
              <p className="mt-1 text-sm text-muted-foreground">Bill Data explica os eventos; somente um repasse confirmado altera o saldo.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <label className="text-xs font-medium text-muted-foreground">
                Início
                <input className="mt-1 block min-h-10 rounded-md border border-border bg-card px-2 text-sm text-foreground" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                Fim
                <input className="mt-1 block min-h-10 rounded-md border border-border bg-card px-2 text-sm text-foreground" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </label>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando conciliação...</p>
          ) : data.connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma integração 99Food disponível para este tenant.</p>
          ) : (
            <>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
                <label className="text-xs font-medium text-muted-foreground">
                  Integração
                  <select
                    className="mt-1 block min-h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground"
                    value={connectionId}
                    onChange={(event) => {
                      setConnectionId(event.target.value);
                      setAccountId('');
                    }}
                  >
                    <option value="">Todas as integrações</option>
                    {data.connections.map((connection) => (
                      <option key={connection.id} value={connection.id}>{connection.displayName || connection.appShopId || connection.id}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-muted-foreground">
                  Conta financeira de destino
                  <select className="mt-1 block min-h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground" value={accountId} disabled={!canManage || !connectionId} onChange={(event) => setAccountId(event.target.value)}>
                    <option value="">Não configurada</option>
                    {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                  </select>
                </label>
                {canManage && (
                  <div className="flex gap-2">
                    <button type="button" disabled={working || !connectionId} onClick={() => void saveAccount()} className="min-h-10 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50">Salvar conta</button>
                    <button type="button" disabled={working || !connectionId} onClick={() => void sync()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden /> Sincronizar</button>
                  </div>
                )}
              </div>

              {accessNotEnabled && (
                <div role="alert" className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-foreground">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
                  <p><strong>Integração financeira indisponível.</strong> A 99Food requer liberação/WhiteList para Bill Data e Settlements Data.</p>
                </div>
              )}
              {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
              {syncSummary && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> Sincronização concluída: {syncSummary.billEntriesReceived} eventos e {syncSummary.settlementsReceived} repasses recebidos.</p>
              )}

              <div>
                <h3 className="text-sm font-semibold text-foreground">Repasses processados</h3>
                <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-muted/45 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">weekPaymentId</th><th className="px-3 py-2">Desembolso</th><th className="px-3 py-2">Valor</th><th className="px-3 py-2">Composição Bill</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Ação</th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {data.settlements.length === 0 ? <tr><td className="px-3 py-5 text-muted-foreground" colSpan={6}>Nenhum repasse no período.</td></tr> : data.settlements.map((settlement) => (
                        <tr key={settlement.id}>
                          <td className="max-w-48 break-all px-3 py-3 font-mono text-xs text-foreground">{settlement.weekPaymentId}</td>
                          <td className="px-3 py-3 text-muted-foreground">{format(new Date(settlement.withdrawDate), 'dd/MM/yyyy')}</td>
                          <td className="px-3 py-3 font-semibold text-foreground">{formatCents(settlement.withdrawAmountCents, settlement.currency)}</td>
                          <td className="px-3 py-3 text-muted-foreground">
                            <span>{formatCents(settlement.linkedSettlementAmountCents, settlement.currency)}</span>
                            {settlement.hasCompositionDiscrepancy && <span className="ml-2 text-amber-700 dark:text-amber-400">Divergência: {formatCents(settlement.compositionDifferenceCents, settlement.currency)}</span>}
                          </td>
                          <td className="px-3 py-3"><SettlementStatus settlement={settlement} /></td>
                          <td className="px-3 py-3">
                            {canManage && settlement.status === 'LIQUIDATED_UNPOSTED' && (
                              <button type="button" disabled={working || !data.connections.find((connection) => connection.id === settlement.connectionId)?.settlementFinancialAccountId} onClick={() => void postSettlement(settlement)} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"><WalletCards className="h-4 w-4" aria-hidden /> Registrar no financeiro</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground">Eventos do Bill Data</h3>
                <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-muted/45 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Pedido</th><th className="px-3 py-2">Evento</th><th className="px-3 py-2">dayPaymentId</th><th className="px-3 py-2">Comissão</th><th className="px-3 py-2">Valor final</th><th className="px-3 py-2">Previsão</th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {data.billEntries.length === 0 ? <tr><td className="px-3 py-5 text-muted-foreground" colSpan={6}>Nenhum evento financeiro no período.</td></tr> : data.billEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="max-w-48 break-all px-3 py-3 font-mono text-xs text-foreground">{entry.orderId}</td>
                          <td className="px-3 py-3 text-muted-foreground">{orderTypeLabel(entry.orderType)}</td>
                          <td className="max-w-48 break-all px-3 py-3 font-mono text-xs text-muted-foreground">{entry.dayPaymentId}</td>
                          <td className="px-3 py-3 text-muted-foreground">{formatCents(entry.commissionAmountCents, 'BRL')}</td>
                          <td className="px-3 py-3 font-medium text-foreground">{formatCents(entry.settlementAmountCents, 'BRL')}</td>
                          <td className="px-3 py-3 text-muted-foreground">{entry.expectSettleDate ? format(new Date(entry.expectSettleDate), 'dd/MM/yyyy') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>
    </section>
  );
}

function SettlementStatus({ settlement }: { settlement: Food99SettlementDTO }) {
  if (settlement.status === 'POSTED') return <span className="text-emerald-700 dark:text-emerald-400">Conciliado</span>;
  if (settlement.status === 'RECONCILIATION_DISCREPANCY') return <span className="text-destructive">Divergência do provedor</span>;
  return <span className="text-amber-700 dark:text-amber-400">Aguardando registro financeiro</span>;
}

function orderTypeLabel(type: 1 | 2 | 3 | 4 | 5): string {
  return ({ 1: 'Receita', 2: 'Refund total', 3: 'Refund parcial na venda', 4: 'Refund pós-venda', 5: 'Ajuste' })[type];
}

function formatCents(rawCents: string, currency: string): string {
  const cents = BigInt(rawCents);
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const amount = `${(absolute / 100n).toString()},${(absolute % 100n).toString().padStart(2, '0')}`;
  return `${negative ? '-' : ''}${currency === 'BRL' ? 'R$' : currency} ${amount}`;
}
