import { AdminTenantListItem, BillingUsageSnapshot, RevenueEvent, SubscriptionStatusHistory } from '../admin-billing-api';
import { money, formatDate, shortId, statusLabels } from '../types';
import { ClipboardList, FileText, Search, ShieldAlert } from 'lucide-react';
import { StatusBadge } from './BillingStatusBadge';
import { Panel, EmptyState, LoadingBlock } from './BillingShared';

export function BillingAuditTab(props: {
  tenants: AdminTenantListItem[];
  selectedTenantId: string;
  onSelectTenant: (tenantId: string) => void;
  revenueEvents: RevenueEvent[];
  snapshots: BillingUsageSnapshot[];
  subscriptionHistory: SubscriptionStatusHistory[];
  loading: boolean;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Panel title="Tenant">
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <select
              value={props.selectedTenantId}
              onChange={(event) => props.onSelectTenant(event.target.value)}
              className="w-full rounded-lg border border-input bg-card py-3 pl-10 pr-4 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Escolha um tenant</option>
              {props.tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} - {tenant.slug}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Panel>

      <div className="space-y-4">
        {!props.selectedTenantId ? (
          <EmptyState icon={ClipboardList} title="Auditoria por tenant" text="Selecione um tenant para ver ledger, snapshots e historico de assinatura." />
        ) : props.loading ? (
          <LoadingBlock />
        ) : (
          <>
            <Panel title="Revenue ledger">
              {props.revenueEvents.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[920px] text-sm">
                    <thead className="bg-muted text-left text-xs font-black uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Evento</th>
                        <th className="px-4 py-3">Origem</th>
                        <th className="px-4 py-3">Pedido</th>
                        <th className="px-4 py-3 text-right">Valor</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Ocorrido em</th>
                        <th className="px-4 py-3">Idempotencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {props.revenueEvents.map((event) => (
                        <tr key={event.id}>
                          <td className="px-4 py-3 font-mono text-xs font-bold text-foreground">{event.type}</td>
                          <td className="px-4 py-3 font-bold text-muted-foreground">{event.source}</td>
                          <td className="px-4 py-3 font-mono text-xs">{shortId(event.orderId)}</td>
                          <td className="px-4 py-3 text-right font-black">{money(event.amount, event.currency)}</td>
                          <td className="px-4 py-3"><StatusBadge status={event.status} /></td>
                          <td className="px-4 py-3">{formatDate(event.occurredAt)}</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{event.idempotencyKey}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-5">
                  <EmptyState icon={ClipboardList} title="Sem eventos no ledger" text="Pedidos antigos ainda podem aparecer por fallback de orders ate gerarem eventos novos." />
                </div>
              )}
            </Panel>

            <Panel title="Snapshots de usage">
              {props.snapshots.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead className="bg-muted text-left text-xs font-black uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Periodo</th>
                        <th className="px-4 py-3">Fonte</th>
                        <th className="px-4 py-3 text-right">Receita</th>
                        <th className="px-4 py-3 text-right">Pedidos</th>
                        <th className="px-4 py-3">Regra</th>
                        <th className="px-4 py-3">Checksum</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {props.snapshots.map((snapshot) => (
                        <tr key={snapshot.id}>
                          <td className="px-4 py-3 font-bold">{formatDate(snapshot.periodStart)} ate {formatDate(snapshot.periodEnd)}</td>
                          <td className="px-4 py-3"><StatusBadge status={snapshot.source} /></td>
                          <td className="px-4 py-3 text-right font-black">{money(snapshot.totalRevenue)}</td>
                          <td className="px-4 py-3 text-right font-bold">{snapshot.totalOrders}</td>
                          <td className="px-4 py-3 font-mono text-xs">{snapshot.billingRuleVersion?.version ? `v${snapshot.billingRuleVersion.version}` : shortId(snapshot.billingRuleVersionId)}</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{snapshot.checksum ? snapshot.checksum.slice(0, 16) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-5">
                  <EmptyState icon={FileText} title="Sem snapshots" text="Snapshots aparecem depois do preview/fechamento de ciclo." />
                </div>
              )}
            </Panel>

            <Panel title="Historico da assinatura">
              {props.subscriptionHistory.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-muted text-left text-xs font-black uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Transicao</th>
                        <th className="px-4 py-3">Motivo</th>
                        <th className="px-4 py-3">Fonte</th>
                        <th className="px-4 py-3">Ator</th>
                        <th className="px-4 py-3">Data</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {props.subscriptionHistory.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-4 py-3 font-bold">
                            {entry.previousStatus ?? 'novo'} {'->'} {statusLabels[entry.nextStatus] ?? entry.nextStatus}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{entry.reason}</td>
                          <td className="px-4 py-3 font-bold text-muted-foreground">{entry.source}</td>
                          <td className="px-4 py-3">{entry.actorType}{entry.actorId ? `:${shortId(entry.actorId)}` : ''}</td>
                          <td className="px-4 py-3">{formatDate(entry.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-5">
                  <EmptyState icon={ShieldAlert} title="Sem historico" text="Novas criacoes, suspensoes e reativacoes passam a gerar historico." />
                </div>
              )}
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}

