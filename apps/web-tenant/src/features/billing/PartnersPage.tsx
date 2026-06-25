import { useQuery } from '@tanstack/react-query';
import { Handshake, ExternalLink } from 'lucide-react';
import { getTenantBillingOverview } from './billing-api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';

export function PartnersPage() {
  const overviewQuery = useQuery({
    queryKey: ['tenant-billing-overview'],
    queryFn: getTenantBillingOverview,
  });

  const partners = overviewQuery.data?.partners ?? [];

  if (overviewQuery.isLoading) {
    return <div className="p-6 text-sm font-bold text-muted-foreground">Carregando beneficios...</div>;
  }

  if (!partners.length) {
    return (
      <div className="p-6">
        <EmptyState icon={Handshake} title="Sem parceiros configurados" description="O SaaS Admin ainda nao publicou beneficios para sua loja." />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-black uppercase tracking-tight text-foreground">Beneficios para sua loja</h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">Podemos receber comissao por indicacoes de parceiros.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {partners.map((partner) => (
          <Card key={partner.key} className="flex flex-col gap-4 p-5">
            <div>
              <h2 className="text-lg font-black text-foreground">{partner.title}</h2>
              <p className="mt-2 text-sm font-medium text-muted-foreground">{partner.description}</p>
            </div>
            <div className="mt-auto">
              <Button
                type="button"
                variant="secondary"
                disabled={!partner.url}
                onClick={() => window.open(partner.url, '_blank', 'noopener,noreferrer')}
              >
                Conhecer parceiro <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
