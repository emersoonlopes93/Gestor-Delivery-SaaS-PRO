import { ExternalLink, PackageCheck, Share2, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { TenantActivationStatus } from '@gestor/types';

type StoreActivationCardProps = {
  activation: TenantActivationStatus;
  publicUrl: string | null;
  onCopy: () => void;
};

const REASON_LABELS: Record<string, string> = {
  ONBOARDING_INCOMPLETE: 'revise a configuração inicial',
  TENANT_INACTIVE: 'verifique o status da conta',
  STORE_CONFIGURATION_PENDING: 'complete as configurações da loja',
  STORE_ADDRESS_MISSING: 'informe o endereço da loja',
  PAYMENT_METHOD_MISSING: 'configure uma forma de pagamento aceita',
  FULFILLMENT_METHOD_MISSING: 'habilite entrega ou retirada',
  OPERATING_HOURS_MISSING: 'configure os horários de funcionamento',
  NO_SELLABLE_PRODUCTS: 'adicione um item vendável ao cardápio',
  STORE_PAUSED: 'a loja está pausada',
  OUTSIDE_HOURS: 'a loja está fora do horário de atendimento',
};

export function StoreActivationCard({ activation, publicUrl, onCopy }: StoreActivationCardProps) {
  if (!activation.onboardingCompleted || activation.firstStorefrontOrder) return null;

  const status = activation.acceptingOrdersNow
    ? 'A loja está recebendo pedidos agora.'
    : activation.operationallyReady
      ? 'A loja está configurada, mas não está recebendo pedidos neste momento.'
      : 'Ainda há itens operacionais para revisar antes de divulgar o cardápio.';

  return (
    <section className="mb-4 rounded-2xl border border-primary/30 bg-card p-4 shadow-card sm:p-5" aria-labelledby="store-activation-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Próximo passo</p>
          <h2 id="store-activation-title" className="mt-1 text-base font-bold text-foreground">Prepare sua loja para o primeiro pedido</h2>
          <p className="mt-1 text-sm text-muted-foreground">{status}</p>
          {activation.reasons.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">Pendências: {activation.reasons.map((reason) => REASON_LABELS[reason] ?? reason).join(', ')}.</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/catalog/products" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring">
            <PackageCheck className="h-4 w-4" /> Conferir cardápio
          </Link>
          <Link to="/orders" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring">
            <ShoppingBag className="h-4 w-4" /> Acompanhar pedidos
          </Link>
          {publicUrl && activation.operationallyReady ? (
            <>
              <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring">
                <ExternalLink className="h-4 w-4" /> Testar vitrine
              </a>
              <button type="button" onClick={onCopy} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring">
                <Share2 className="h-4 w-4" /> Compartilhar
              </button>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
