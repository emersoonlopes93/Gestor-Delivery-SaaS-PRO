import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import type {
  FinancialAccountDTO,
  Food99FinancialSyncResultDTO,
  Food99ReconciliationDTO,
  Food99SettlementDTO,
} from '@gestor/types';
import { CheckCircle2, RefreshCw, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api-client';
import { ApiError } from '../../lib/api-client';
import { Card } from '../../components/ui/Card';

type Props = { canManage: boolean; startDate?: string; endDate?: string };

const emptyReconciliation: Food99ReconciliationDTO = {
  connections: [],
  settlements: [],
  billEntries: [],
};

export function Food99ReconciliationPanel({ canManage, startDate: providedStartDate, endDate: providedEndDate }: Props) {
  const defaultPeriod = useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') };
  }, []);
  const startDate = providedStartDate ?? defaultPeriod.start;
  const endDate = providedEndDate ?? defaultPeriod.end;
  const [data, setData] = useState<Food99ReconciliationDTO>(emptyReconciliation);
  const [accounts, setAccounts] = useState<FinancialAccountDTO[]>([]);
  const [connectionId, setConnectionId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<Food99FinancialSyncResultDTO | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [settlementToPost, setSettlementToPost] = useState<Food99SettlementDTO | null>(null);
  const postingConfirmationRef = useRef<HTMLTableRowElement>(null);

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
        const onlyConnection = !selectedConnectionId && reconciliationResponse.data.connections.length === 1
          ? reconciliationResponse.data.connections[0]
          : undefined;
        if (onlyConnection) setConnectionId(onlyConnection.id);
        setAccountId((selected ?? onlyConnection)?.settlementFinancialAccountId ?? '');
      }
      if (accountsResponse.success) setAccounts(accountsResponse.data.filter((account) => account.active));
    } catch (caught) {
      setError(financialErrorMessage(caught, 'consultar'));
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
    try {
      const response = await api.post<Food99FinancialSyncResultDTO>('/finance/marketplaces/99food/sync', {
        connectionId,
        startDate,
        endDate,
      });
      if (response.success) setSyncSummary(response.data);
      await load(connectionId);
    } catch (caught) {
      setError(financialErrorMessage(caught, 'sincronizar'));
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
    } catch {
      setError('Não foi possível configurar a conta de destino agora.');
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
      setSettlementToPost(null);
    } catch {
      setError('Não foi possível registrar o repasse. Confira a conta de destino e tente novamente.');
    } finally {
      setWorking(false);
    }
  };

  const summary = useMemo(() => ({
    awaiting: data.settlements.filter((settlement) => settlement.status === 'LIQUIDATED_UNPOSTED').length,
    posted: data.settlements.filter((settlement) => settlement.status === 'POSTED').length,
    divergence: data.settlements.filter((settlement) => settlement.status === 'RECONCILIATION_DISCREPANCY').length,
  }), [data.settlements]);
  const savedAccountId = settlementToPost
    ? data.connections.find((connection) => connection.id === settlementToPost.connectionId)?.settlementFinancialAccountId
    : null;
  const savedAccountName = savedAccountId ? accounts.find((account) => account.id === savedAccountId)?.name ?? 'conta financeira configurada' : null;
  const selectedConnection = data.connections.find((connection) => connection.id === connectionId);
  const authorizationReady = selectedConnection?.status === 'CONNECTED';

  useEffect(() => {
    if (!settlementToPost) return;
    postingConfirmationRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    postingConfirmationRef.current?.focus();
  }, [settlementToPost]);

  return (
    <section className="mt-6" aria-labelledby="food99-reconciliation-title">
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-muted/35 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">99Food</p>
              <h2 id="food99-reconciliation-title" className="mt-1 text-lg font-semibold text-foreground">Conciliação de repasses</h2>
              <p className="mt-1 text-sm text-muted-foreground">Os detalhes explicam os repasses; somente um repasse confirmado altera o saldo.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <label className="text-xs font-medium text-muted-foreground">
                Início
                <input className="mt-1 block min-h-10 rounded-md border border-border bg-card px-2 text-sm text-foreground" type="date" value={startDate} readOnly aria-label="Início do período selecionado no Financeiro" />
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                Fim
                <input className="mt-1 block min-h-10 rounded-md border border-border bg-card px-2 text-sm text-foreground" type="date" value={endDate} readOnly aria-label="Fim do período selecionado no Financeiro" />
              </label>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando conciliação...</p>
          ) : error && data.connections.length === 0 ? (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"><p className="font-semibold">Não foi possível carregar a conciliação 99Food.</p><p className="mt-1">{error}</p><button type="button" onClick={() => void load(connectionId || undefined)} className="mt-3 min-h-10 rounded-lg border border-destructive/30 bg-card px-3 font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Tentar novamente</button></div>
          ) : data.connections.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
              <p className="font-semibold text-foreground">Conecte uma loja 99Food para ver seus repasses.</p>
              <p className="mt-1 text-sm text-muted-foreground">A conexão é configurada em Canais de venda; nenhum saldo é criado nesta etapa.</p>
              <Link to="/settings/integrations" className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Ir para Canais de venda</Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Summary label="Aguardando registro" value={summary.awaiting} tone="attention" />
                <Summary label="Recebido" value={summary.posted} tone="success" />
                <Summary label="Com divergência" value={summary.divergence} tone="danger" />
              </div>
              <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">Sincronizar apenas consulta e atualiza os detalhes recebidos da 99Food. Esta etapa não altera o saldo da sua conta.</p>
              {connectionId && !authorizationReady ? (
                <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-foreground">
                  <p className="font-semibold">Confirme a autorização da loja antes de sincronizar.</p>
                  <p className="mt-1 text-muted-foreground">Conclua a verificação em Canais de venda. Nenhuma consulta financeira será feita enquanto a conexão não estiver pronta.</p>
                  <Link to="/settings/integrations" className="mt-2 inline-flex font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Ir para Canais de venda</Link>
                </div>
              ) : null}
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end"><label className="text-xs font-medium text-muted-foreground">Integração<select className="mt-1 block min-h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground" value={connectionId} onChange={(event) => { setConnectionId(event.target.value); setAccountId(''); }}><option value="">Selecione uma loja para configurar ou sincronizar</option>{data.connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.displayName || connection.appShopId || connection.id}</option>)}</select></label><label className="text-xs font-medium text-muted-foreground">Conta financeira de destino<select className="mt-1 block min-h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground" value={accountId} disabled={!canManage || !connectionId} onChange={(event) => setAccountId(event.target.value)}><option value="">Não configurada</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>{canManage ? <div className="flex gap-2"><button type="button" disabled={working || !connectionId} onClick={() => void saveAccount()} className="min-h-10 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50">Salvar conta</button><button type="button" disabled={working || !connectionId || !authorizationReady} onClick={() => void sync()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden /> Sincronizar</button></div> : null}</div>
              <button type="button" onClick={() => setShowDetails((current) => !current)} className="min-h-10 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{showDetails ? 'Ocultar detalhes' : 'Detalhes'}</button>
              {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
              {syncSummary && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> Sincronização concluída: {syncSummary.billEntriesReceived} eventos e {syncSummary.settlementsReceived} repasses recebidos.</p>
              )}

              <div>
                <h3 className="text-sm font-semibold text-foreground">Repasses processados</h3>
                <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-muted/45 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Repasse</th><th className="px-3 py-2">Desembolso</th><th className="px-3 py-2">Valor</th><th className="px-3 py-2">CNPJ / CERC</th><th className="px-3 py-2">Composição Bill</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Ação</th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {data.settlements.length === 0 ? <tr><td className="px-3 py-5 text-muted-foreground" colSpan={7}>Nenhum repasse no período.</td></tr> : data.settlements.map((settlement) => (<Fragment key={settlement.id}>
                        <tr key={settlement.id}>
                          <td className="max-w-48 break-all px-3 py-3 font-mono text-xs text-foreground">{settlement.weekPaymentId}</td>
                          <td className="px-3 py-3 text-muted-foreground">{format(new Date(settlement.withdrawDate), 'dd/MM/yyyy')}</td>
                          <td className="px-3 py-3 font-semibold text-foreground">{formatCents(settlement.withdrawAmountCents, settlement.currency)}</td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">{settlement.payeeCnpj || settlement.payerCnpj || 'Não informado'}{settlement.cercAmountCents ? <><br />CERC: {formatCents(settlement.cercAmountCents, settlement.currency)}</> : null}</td>
                          <td className="px-3 py-3 text-muted-foreground">
                            <span>{formatCents(settlement.linkedSettlementAmountCents, settlement.currency)}</span>
                            {settlement.hasCompositionDiscrepancy && <span className="ml-2 text-amber-700 dark:text-amber-400">Divergência: {formatCents(settlement.compositionDifferenceCents, settlement.currency)}</span>}
                          </td>
                          <td className="px-3 py-3"><SettlementStatus settlement={settlement} /></td>
                          <td className="px-3 py-3">
                            {canManage && settlement.status === 'LIQUIDATED_UNPOSTED' && (
                              <button type="button" disabled={working || !data.connections.find((connection) => connection.id === settlement.connectionId)?.settlementFinancialAccountId} onClick={() => setSettlementToPost(settlement)} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"><WalletCards className="h-4 w-4" aria-hidden /> Registrar no financeiro</button>
                            )}
                          </td>
                        </tr>
                        {settlementToPost?.id === settlement.id ? <tr ref={postingConfirmationRef} tabIndex={-1} className="bg-amber-500/10 outline-none"><td colSpan={7} className="p-4"><section aria-label="Confirmar registro de repasse"><p className="font-semibold text-foreground">Confirmar registro do repasse</p><p className="mt-1 text-sm text-muted-foreground">O valor de {formatCents(settlement.withdrawAmountCents, settlement.currency)} será registrado em <strong>{savedAccountName ?? 'uma conta financeira configurada'}</strong>. Esta confirmação altera o saldo financeiro.</p><p className="mt-1 text-xs text-muted-foreground">A conta exibida é a conta já salva para esta conexão; alterações ainda não salvas não serão usadas.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={working} onClick={() => setSettlementToPost(null)} className="min-h-10 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted">Cancelar</button><button type="button" disabled={working || !savedAccountId} onClick={() => void postSettlement(settlement)} className="min-h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{working ? 'Registrando...' : 'Confirmar registro'}</button></div></section></td></tr> : null}
                      </Fragment>))}
                    </tbody>
                  </table>
                </div>
              </div>

              {showDetails ? <div>
                <h3 className="text-sm font-semibold text-foreground">Eventos do Bill Data</h3>
                <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-muted/45 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Pedido</th><th className="px-3 py-2">Evento</th><th className="px-3 py-2">dayPaymentId</th><th className="px-3 py-2">Comissão</th><th className="px-3 py-2">Ajustes</th><th className="px-3 py-2">Valor final</th><th className="px-3 py-2">Previsão</th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {data.billEntries.length === 0 ? <tr><td className="px-3 py-5 text-muted-foreground" colSpan={7}>Nenhum evento financeiro no período.</td></tr> : data.billEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="max-w-48 break-all px-3 py-3 font-mono text-xs text-foreground">{entry.orderId}</td>
                          <td className="px-3 py-3 text-muted-foreground">{orderTypeLabel(entry.orderType)}</td>
                          <td className="max-w-48 break-all px-3 py-3 font-mono text-xs text-muted-foreground">{entry.dayPaymentId}</td>
                          <td className="px-3 py-3 text-muted-foreground">{formatCents(entry.commissionAmountCents, 'BRL')}</td>
                          <td className="px-3 py-3 text-xs text-muted-foreground"><BillAdjustments entry={entry} /></td>
                          <td className="px-3 py-3 font-medium text-foreground">{formatCents(entry.settlementAmountCents, 'BRL')}</td>
                          <td className="px-3 py-3 text-muted-foreground">{entry.expectSettleDate ? format(new Date(entry.expectSettleDate), 'dd/MM/yyyy') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div> : null}
              {connectionId && accounts.length === 0 ? <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-sm"><p className="font-semibold text-foreground">Nenhuma conta financeira ativa está disponível.</p><p className="mt-1 text-muted-foreground">Crie ou ative uma conta antes de escolher onde registrar o repasse.</p><Link to="/management/finance" className="mt-2 inline-flex font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Gerenciar contas financeiras</Link></div> : null}
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

function Summary({ label, value, tone }: { label: string; value: number; tone: 'success' | 'attention' | 'danger' }) {
  const valueClass = tone === 'success' ? 'text-emerald-700 dark:text-emerald-400' : tone === 'danger' ? 'text-destructive' : 'text-amber-700 dark:text-amber-400';
  return <div className="rounded-lg border border-border bg-muted/25 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-1 text-xl font-semibold tabular-nums ${valueClass}`}>{value}</p></div>;
}

function orderTypeLabel(type: 1 | 2 | 3 | 4 | 5 | 8 | 9): string {
  return ({ 1: 'Receita', 2: 'Refund total', 3: 'Refund parcial na venda', 4: 'Refund pós-venda', 5: 'Despesa não vinculada a pedido', 8: 'Perda de refeição', 9: 'Ajuste por troca de item' })[type];
}

function BillAdjustments({ entry }: { entry: Food99ReconciliationDTO['billEntries'][number] }) {
  const adjustments = [
    entry.mealLossDeductAmountCents !== null ? `Perda: ${formatCents(entry.mealLossDeductAmountCents, 'BRL')}` : null,
    entry.vatAmountCents !== null ? `VAT: ${formatCents(entry.vatAmountCents, 'BRL')}` : null,
    entry.merchantAppealAmountCents !== null ? `Apelação: ${formatCents(entry.merchantAppealAmountCents, 'BRL')}` : null,
  ].filter((value): value is string => value !== null);
  return adjustments.length > 0 ? <>{adjustments.map((value) => <span key={value} className="block">{value}</span>)}</> : <>—</>;
}

function financialErrorMessage(caught: unknown, action: 'consultar' | 'sincronizar'): string {
  if (caught instanceof ApiError && caught.code === 'FINANCE_ACCESS_NOT_ENABLED') {
    return 'A 99Food requer liberação/WhiteList para consultar os dados financeiros desta loja. Isso não indica saldo zerado.';
  }
  if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403)) {
    return 'A conexão 99Food não tem autorização para dados financeiros. Confira a conexão da loja e tente novamente.';
  }
  if (caught instanceof ApiError && caught.status === 404) {
    return 'A loja ou os dados financeiros não foram encontrados para a conexão selecionada.';
  }
  return action === 'sincronizar'
    ? 'Não foi possível atualizar os detalhes de repasses agora. Nenhum saldo foi alterado.'
    : 'Não foi possível consultar os dados financeiros agora. Tente novamente em alguns minutos.';
}

function formatCents(rawCents: string, currency: string): string {
  const cents = BigInt(rawCents);
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const amount = `${(absolute / 100n).toString()},${(absolute % 100n).toString().padStart(2, '0')}`;
  return `${negative ? '-' : ''}${currency === 'BRL' ? 'R$' : currency} ${amount}`;
}
