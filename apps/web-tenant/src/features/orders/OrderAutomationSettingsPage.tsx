import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Clock3, Loader2, Save, ShieldAlert, ShoppingBag } from 'lucide-react';
import toast from 'react-hot-toast';
import type { OrderAutoAcceptSettings } from '@gestor/types';
import { api } from '../../lib/api-client';

const DEFAULT_SETTINGS: OrderAutoAcceptSettings = {
  autoAcceptOrdersEnabled: false,
  autoAcceptDelaySeconds: 0,
  autoAcceptDeliveryOrders: true,
  autoAcceptPickupOrders: true,
};

export function OrderAutomationSettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<OrderAutoAcceptSettings>(DEFAULT_SETTINGS);

  const { data, isLoading } = useQuery({
    queryKey: ['order-auto-accept-settings'],
    queryFn: async () => {
      const res = await api.get<OrderAutoAcceptSettings>('/orders/settings/auto-accept');
      return res.data;
    },
  });

  useEffect(() => {
    if (data) {
      setForm(data);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (payload: OrderAutoAcceptSettings) => {
      const res = await api.patch<OrderAutoAcceptSettings>('/orders/settings/auto-accept', payload);
      return res.data;
    },
    onSuccess: (payload) => {
      setForm(payload);
      queryClient.invalidateQueries({ queryKey: ['order-auto-accept-settings'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      toast.success('Autoaceite atualizado com sucesso.');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Nao foi possivel salvar o autoaceite.';
      toast.error(message);
    },
  });

  const toggleFulfillment = (key: 'autoAcceptDeliveryOrders' | 'autoAcceptPickupOrders') => {
    setForm((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  if (isLoading) {
    return (
      <div className="p-12 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-lg sm:text-2xl font-black text-foreground flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl text-primary-foreground shadow-lg shadow-primary/20">
              <Bot className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            Autoaceite de Pedidos
          </h1>
          <p className="text-xs sm:text-base text-muted-foreground mt-1 font-medium leading-relaxed">
            Aceite automaticamente apenas pedidos validos do cardapio online, com seguranca operacional e trilha de auditoria.
          </p>
        </div>

        <button
          type="button"
          onClick={() => mutation.mutate(form)}
          disabled={mutation.isPending}
          className="w-full lg:w-auto min-w-[180px] justify-center bg-primary text-primary-foreground hover:bg-primary/90 px-4 sm:px-8 py-3 rounded-2xl flex items-center gap-2 shadow-xl disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed font-semibold transition-colors"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {mutation.isPending ? 'Salvando...' : 'Salvar autoaceite'}
        </button>
      </header>

      <section className="bg-card rounded-3xl border border-border p-4 sm:p-6 shadow-sm space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-2xl transition-colors ${form.autoAcceptOrdersEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-foreground">Aceitar pedidos automaticamente</h2>
              <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                Quando ativado, o sistema confirma pedidos elegiveis do storefront sem intervencao manual.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setForm((current) => ({ ...current, autoAcceptOrdersEnabled: !current.autoAcceptOrdersEnabled }))}
            className={`w-14 h-8 rounded-full border transition-colors duration-300 relative shrink-0 ${form.autoAcceptOrdersEnabled ? 'bg-primary border-primary' : 'bg-muted border-border'}`}
          >
            <div className={`absolute top-[3px] w-6 h-6 rounded-full bg-white shadow-sm transition-all duration-300 ${form.autoAcceptOrdersEnabled ? 'right-1' : 'left-1'}`} />
          </button>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 flex gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-300 font-medium leading-relaxed">
            Use com cuidado: o pedido so sera aceito automaticamente se a loja estiver aberta, o pedido estiver valido, o tipo de atendimento estiver habilitado e nao houver pendencia critica de pagamento.
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock3 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Tempo para aceitar</h3>
          </div>

          <div className="grid gap-3">
            <label className={`rounded-2xl border p-4 flex items-start gap-3 cursor-pointer transition-all ${form.autoAcceptDelaySeconds === 0 ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/40'}`}>
              <input
                type="radio"
                name="autoAcceptDelaySeconds"
                checked={form.autoAcceptDelaySeconds === 0}
                onChange={() => setForm((current) => ({ ...current, autoAcceptDelaySeconds: 0 }))}
                className="mt-1"
              />
              <div>
                <div className="text-sm font-black text-foreground">Imediatamente</div>
                <div className="text-xs text-muted-foreground font-medium">MVP atual: usa o fluxo seguro ja existente no backend, sem scheduler fragil.</div>
              </div>
            </label>

            {[30, 60].map((delay) => (
              <label key={delay} className="rounded-2xl border border-dashed border-border p-4 flex items-start gap-3 opacity-60 cursor-not-allowed bg-muted/20">
                <input type="radio" name="autoAcceptDelaySeconds" disabled checked={false} className="mt-1" />
                <div>
                  <div className="text-sm font-black text-foreground">Apos {delay} segundos</div>
                  <div className="text-xs text-muted-foreground font-medium">Em breve. Fase atual nao ativa delay sem uma fila confiavel.</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Aplicar para</h3>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => toggleFulfillment('autoAcceptDeliveryOrders')}
              className={`rounded-2xl border p-4 text-left transition-all ${form.autoAcceptDeliveryOrders ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/40'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-foreground">Delivery</div>
                  <div className="text-xs text-muted-foreground font-medium">So entra no autoaceite se a entrega for valida e sem pendencias criticas.</div>
                </div>
                <div className={`w-10 h-6 rounded-full transition-colors ${form.autoAcceptDeliveryOrders ? 'bg-primary' : 'bg-muted'}`}>
                  <div className={`mt-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${form.autoAcceptDeliveryOrders ? 'ml-4' : 'ml-0.5'}`} />
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => toggleFulfillment('autoAcceptPickupOrders')}
              className={`rounded-2xl border p-4 text-left transition-all ${form.autoAcceptPickupOrders ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/40'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-foreground">Retirada</div>
                  <div className="text-xs text-muted-foreground font-medium">Mantem a conferencia operacional, mas sem exigir aceite manual quando elegivel.</div>
                </div>
                <div className={`w-10 h-6 rounded-full transition-colors ${form.autoAcceptPickupOrders ? 'bg-primary' : 'bg-muted'}`}>
                  <div className={`mt-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${form.autoAcceptPickupOrders ? 'ml-4' : 'ml-0.5'}`} />
                </div>
              </div>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
