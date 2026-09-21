import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import type {
  FinancialAccountDTO,
  Food99FinancialSyncResultDTO,
  Food99ReconciliationDTO,
  Food99SettlementDTO,
} from '@gestor/types';
import { FinancialAccountType } from '@gestor/types';
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, WalletCards } from 'lucide-react';
import { ApiError, api } from '../../lib/api-client';
import { Card } from '../../components/ui/Card';
import { ModalShell } from '../orders/v2/ModalShell';

type Props = { canManage: boolean; startDate?: string; endDate?: string };

const emptyReconciliation: Food99ReconciliationDTO = {
  connections: [],
  settlements: [],
  billEntries: [],
};

function safeSupportDetails(caught: unknown): string {
  if (!(caught instanceof ApiError)) return 'Sem resposta HTTP · sem código';
  const code = caught.code && /^[A-Z][A-Z0-9_]{1,48}$/.test(caught.code) ? caught.code : 'sem código';
  return `HTTP ${caught.status} · ${code}`;
}

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
  const [accessNotEnabled, setAccessNotEnabled] = useState(false);
  const [supportDetails, setSupportDetails] = useState<string | null>(null);
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<FinancialAccountType>(FinancialAccountType.BANK);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<Food99FinancialSyncResultDTO | null>(null);
  const [showDetails, setShowDetails] = useState(false);

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
    } catch {
      setError('Não foi possível carregar os repasses da 99Food. Tente novamente.');
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
    setSupportDetails(null);
    try {
      const response = await api.post<Food99FinancialSyncResultDTO>('/finance/marketplaces/99food/sync', {
        connectionId,
        startDate,
        endDate,
      });
      if (response.success) setSyncSummary(response.data);
      await load(connectionId);
    } catch (caught) {
      if (caught instanceof ApiError && (caught.code === 'FINANCE_ACCESS_NOT_ENABLED' || caught.code === 'FINANCE_PROVIDER_UNAUTHORIZED' || caught.code === 'FINANCE_AUTH_REJECTED' || /99Food financial request failed with HTTP 401/i.test(caught.message))) {
        setAccessNotEnabled(true);
        setSupportDetails(safeSupportDetails(caught));
      } else if (caught instanceof ApiError && (caught.code === 'FINANCE_PROVIDER_REJECTED' || /^FINANCE_PROVIDER_BUSINESS_\d+$/.test(caught.code ?? ''))) {
        setError('A 99Food recusou esta consulta financeira. Confira a liberação financeira da loja e, se necessário, fale com o suporte. Nenhum repasse foi registrado.');
        setSupportDetails(safeSupportDetails(caught));
      } else if (caught instanceof ApiError && caught.status === 404) {
        setError('Não foi possível encontrar a loja selecionada ou o recurso de sincronização nesta versão da API. Confira a loja e peça ao suporte para verificar a publicação.');
        setSupportDetails(safeSupportDetails(caught));
      } else {
        setError('Não foi possível atualizar os repasses agora. Tente novamente ou peça ajuda ao suporte.');
        setSupportDetails(safeSupportDetails(caught));
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
    } catch {
      setError('Não foi possível salvar a conta de destino. Confira a loja selecionada e tente novamente.');
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
    } catch {
      setError('Não foi possível confirmar o registro do repasse. Atualize a lista antes de tentar novamente.');
    } finally {
      setWorking(false);
    }
  };

  const createAccount = async () => {
    if (!canManage || !accountName.trim() || working) return;
    setWorking(true);
    setAccountError(null);
    try {
      const response = await api.post<FinancialAccountDTO>('/finance/accounts', {
        name: accountName.trim(), type: accountType, initialBalance: 0,
      });
      if (!response.success || !response.data.active) throw new Error('Conta não confirmada como ativa.');
      await load(connectionId || undefined);
      setAccountId(response.data.id);
      setAccountName('');
      setCreateAccountOpen(false);
    } catch {
      setAccountError('Não foi possível criar a conta. Confira os dados ou tente novamente.');
    } finally {
      setWorking(false);
    }
  };

  const summary = useMemo(() => ({
    awaiting: data.settlements.filter((settlement) => settlement.status === 'LIQUIDATED_UNPOSTED').length,
    posted: data.settlements.filter((settlement) => settlement.status === 'POSTED').length,
    divergence: data.settlements.filter((settlement) => settlement.status === 'RECONCILIATION_DISCREPANCY').length,
  }), [data.settlements]);

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
          ) : data.connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma loja 99Food conectada para este restaurante. Confira a conexão em Canais de venda.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Summary label="Aguardando registro" value={summary.awaiting} tone="attention" />
                <Summary label="Recebido" value={summary.posted} tone="success" />
                <Summary label="Com divergência" value={summary.divergence} tone="danger" />
              </div>
              <p className="text-sm text-muted-foreground">Escolha a loja e a conta para acompanhar os repasses. Os registros detalhados ficam em "Ver detalhes e suporte".</p>
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

              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
                <p>Selecione uma conta ativa para receber repasses confirmados. Criar ou escolher uma conta não registra o repasse.</p>
                {canManage ? <button type="button" onClick={() => { setAccountError(null); setCreateAccountOpen(true); }} className="inline-flex min-h-10 items-center gap-1 font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Plus className="h-4 w-4" aria-hidden /> Criar conta financeira</button> : null}
              </div>

              {accessNotEnabled && (
                <div role="alert" className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-foreground">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
                  <p><strong>Consulta financeira não autorizada pela 99Food.</strong> Peça ao suporte para verificar a autorização da loja e a habilitação do acesso financeiro. Atualize a lista antes de tentar novamente.</p>
                </div>
              )}
              {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
              {supportDetails && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer font-semibold text-primary">Ver informações para suporte</summary><p className="mt-2 break-all font-mono">{supportDetails}</p></details>}
              {syncSummary && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> Consulta concluída: {syncSummary.billEntriesReceived} registros diários e {syncSummary.settlementsReceived} fechamentos importados. Isso não confirma o recebimento na conta.</p>
              )}

              <button type="button" onClick={() => setShowDetails((current) => !current)} aria-expanded={showDetails} className="min-h-10 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{showDetails ? 'Fechar detalhes' : 'Ver detalhes e suporte'}</button>
              {showDetails ? <>

              <div>
                <h3 className="text-sm font-semibold text-foreground">Repasses processados</h3>
                <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-muted/45 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Referência do repasse</th><th className="px-3 py-2">Desembolso</th><th className="px-3 py-2">Valor</th><th className="px-3 py-2">Total dos pedidos</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2">Ação</th></tr></thead>
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
                    <thead className="bg-muted/45 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Pedido</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Referência diária</th><th className="px-3 py-2">Comissão</th><th className="px-3 py-2">Valor final</th><th className="px-3 py-2">Previsão</th></tr></thead>
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
              </> : null}
            </>
          )}
        </div>
      </Card>
      {canManage && <ModalShell open={createAccountOpen} title="Criar conta financeira" onClose={() => { if (!working) setCreateAccountOpen(false); }} size="standard">
        <form className="space-y-4 p-5 sm:p-6" onSubmit={(event) => { event.preventDefault(); void createAccount(); }}>
          <p className="text-sm text-muted-foreground">Cadastre uma conta ativa para receber repasses. O saldo começa em zero; nenhum repasse será registrado agora.</p>
          <label className="block text-sm font-semibold text-foreground">Nome da conta<input autoFocus required maxLength={100} value={accountName} disabled={working} onChange={(event) => setAccountName(event.target.value)} placeholder="Ex.: Banco da loja" className="mt-1 block min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" /></label>
          <label className="block text-sm font-semibold text-foreground">Tipo de conta<select value={accountType} disabled={working} onChange={(event) => setAccountType(event.target.value as FinancialAccountType)} className="mt-1 block min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"><option value={FinancialAccountType.BANK}>Conta bancária</option><option value={FinancialAccountType.DIGITAL_WALLET}>Carteira digital</option><option value={FinancialAccountType.CASH}>Dinheiro</option></select></label>
          {accountError && <p role="alert" className="text-sm text-destructive">{accountError}</p>}
          <div className="flex justify-end gap-2"><button type="button" disabled={working} onClick={() => setCreateAccountOpen(false)} className="min-h-10 rounded-lg border border-border px-4 text-sm font-semibold text-foreground">Cancelar</button><button type="submit" disabled={working || !accountName.trim()} className="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{working ? 'Criando...' : 'Criar e selecionar'}</button></div>
        </form>
      </ModalShell>}
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

function orderTypeLabel(type: 1 | 2 | 3 | 4 | 5): string {
  return ({ 1: 'Receita', 2: 'Estorno total', 3: 'Estorno parcial na venda', 4: 'Estorno após a venda', 5: 'Ajuste' })[type];
}

function formatCents(rawCents: string, currency: string): string {
  const cents = BigInt(rawCents);
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const amount = `${(absolute / 100n).toString()},${(absolute % 100n).toString().padStart(2, '0')}`;
  return `${negative ? '-' : ''}${currency === 'BRL' ? 'R$' : currency} ${amount}`;
}
