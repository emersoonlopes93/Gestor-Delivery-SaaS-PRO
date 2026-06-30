import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Loader2, Link2, Store, ShoppingBag, Clock3, ArrowRight, SkipForward } from 'lucide-react';
import toast from 'react-hot-toast';
import { getTenantBillingOverview } from '../../billing/billing-api';
import { useConnectMarketplaceManual, useMarketplaceStatus } from '../../marketplace/hooks';

type IfoodChoice = 'skipped' | 'connected' | 'pending' | 'unavailable' | 'failed' | null;

interface Step8IfoodProps {
  onNext: (saveFn: () => Promise<void>) => void;
  onPrev: () => void;
  initialChoice?: IfoodChoice;
  onChoiceChange?: (choice: Exclude<IfoodChoice, null>) => void;
}

type ManualConnectForm = {
  externalMerchantId: string;
  externalStoreId: string;
  displayName: string;
};

export function Step8Ifood({ onNext, onPrev, initialChoice = null, onChoiceChange }: Step8IfoodProps) {
  const [manualForm, setManualForm] = useState<ManualConnectForm>({
    externalMerchantId: '',
    externalStoreId: '',
    displayName: 'iFood',
  });
  const [showManualForm, setShowManualForm] = useState(false);

  const { data: billingOverview, isLoading: loadingBilling } = useQuery({
    queryKey: ['tenant-billing-overview', 'onboarding-ifood'],
    queryFn: getTenantBillingOverview,
  });

  const { data: status, isLoading: loadingStatus, refetch: refetchStatus } = useMarketplaceStatus('ifood');
  const connectMutation = useConnectMarketplaceManual('ifood');

  const canUseIfoodIntegration = Boolean(billingOverview?.entitlements.flags.canUseIfoodIntegration);
  const isConnected = status?.status === 'CONNECTED';
  const currentChoice: IfoodChoice = isConnected ? 'connected' : initialChoice;

  const safeCapabilities = useMemo(() => {
    return [
      { label: 'Conexao com marketplace', state: 'available' as const },
      { label: 'Recebimento de pedidos', state: 'available' as const },
      { label: 'Importacao automatica de cardapio', state: 'soon' as const },
      { label: 'Importacao de horarios e pagamentos', state: 'soon' as const },
    ];
  }, []);

  const handleContinueWithoutIfood = () => {
    onChoiceChange?.(canUseIfoodIntegration ? 'skipped' : 'unavailable');
    onNext(async () => Promise.resolve());
  };

  const handleConnect = async () => {
    if (!manualForm.externalMerchantId.trim() || !manualForm.externalStoreId.trim()) {
      toast.error('Preencha merchant ID e store ID para conectar o iFood.');
      return;
    }

    try {
      onChoiceChange?.('pending');
      await connectMutation.mutateAsync({
        externalMerchantId: manualForm.externalMerchantId.trim(),
        externalStoreId: manualForm.externalStoreId.trim(),
        displayName: manualForm.displayName.trim() || 'iFood',
        authType: 'manual',
        settingsJson: {
          autoConfirmOrders: false,
          importAsStatus: 'pending',
          onboardingSource: 'wizard_ifood_beta',
        },
      });
      await refetchStatus();
      onChoiceChange?.('connected');
      toast.success('Conexao iFood salva. Voce pode continuar o onboarding.');
      onNext(async () => Promise.resolve());
    } catch (error) {
      onChoiceChange?.('failed');
      const message = error instanceof Error ? error.message : 'Falha ao conectar o iFood.';
      toast.error(message);
    }
  };

  const helperTone = isConnected
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : canUseIfoodIntegration
      ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
      : 'border-amber-200 bg-amber-50 text-amber-700';

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-sky-100 dark:bg-sky-900/40 rounded-2xl mb-3">
          <Link2 className="w-7 h-7 text-sky-600 dark:text-sky-400" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Deseja conectar sua loja ao iFood?</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Essa etapa e opcional. Voce pode continuar sem iFood e configurar seu cardapio manualmente.
        </p>
      </div>

      <div className={`rounded-2xl border p-4 ${helperTone}`}>
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="space-y-1 text-sm">
            {isConnected ? (
              <>
                <div className="font-black">Conexao iFood encontrada neste tenant.</div>
                <div>Os pedidos podem seguir pelo fluxo atual de marketplace. Importacao completa de catalogo ainda nao esta disponivel aqui.</div>
              </>
            ) : canUseIfoodIntegration ? (
              <>
                <div className="font-black">Integracao iFood em beta.</div>
                <div>Hoje ela pode apoiar conexao e fluxo de pedidos. Importacao automatica completa de cardapio, horarios e pagamentos ainda nao esta disponivel.</div>
              </>
            ) : (
              <>
                <div className="font-black">Importacao do iFood em breve.</div>
                <div>A conexao automatica ainda nao esta liberada para este tenant. Voce pode concluir o onboarding normalmente e voltar depois.</div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 space-y-4">
        <div className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
          O que esta pronto hoje
        </div>
        <div className="space-y-3">
          {safeCapabilities.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 px-4 py-3">
              <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{item.label}</div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                item.state === 'available'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
              }`}>
                {item.state === 'available' ? 'Disponivel' : 'Em breve'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {canUseIfoodIntegration || isConnected ? (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Conectar iFood - beta</div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Use os IDs da conexao manual ja existente. Se preferir, voce pode continuar sem integrar agora.
              </div>
            </div>
            {isConnected ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 px-3 py-1.5 text-xs font-black">
                <CheckCircle2 className="w-4 h-4" />
                Conectado
              </div>
            ) : null}
          </div>

          {!isConnected ? (
            <>
              <button
                type="button"
                onClick={() => setShowManualForm((value) => !value)}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-sm font-black text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
              >
                <Store className="w-4 h-4" />
                {showManualForm ? 'Ocultar conexao manual' : 'Conectar iFood'}
              </button>

              {showManualForm ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Merchant ID</span>
                    <input
                      value={manualForm.externalMerchantId}
                      onChange={(e) => setManualForm((prev) => ({ ...prev, externalMerchantId: e.target.value }))}
                      className="input-premium"
                      placeholder="merchant..."
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Store ID</span>
                    <input
                      value={manualForm.externalStoreId}
                      onChange={(e) => setManualForm((prev) => ({ ...prev, externalStoreId: e.target.value }))}
                      className="input-premium"
                      placeholder="store..."
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Nome exibido</span>
                    <input
                      value={manualForm.displayName}
                      onChange={(e) => setManualForm((prev) => ({ ...prev, displayName: e.target.value }))}
                      className="input-premium"
                      placeholder="iFood"
                    />
                  </label>
                </div>
              ) : null}
            </>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-4">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                <Link2 className="w-3.5 h-3.5" />
                Conexao
              </div>
              <div className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-200">Manual</div>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-4">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                <ShoppingBag className="w-3.5 h-3.5" />
                Pedidos
              </div>
              <div className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-200">Fluxo existente</div>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-4">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                <Clock3 className="w-3.5 h-3.5" />
                Importacao
              </div>
              <div className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-200">Catalogo completo em breve</div>
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-4 text-xs text-slate-500 dark:text-slate-400">
            Nao prometa ao lojista importacao completa de cardapio, horarios ou pagamentos nesta etapa. O foco aqui e conexao e fluxo de pedidos.
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 space-y-3">
          <div className="text-sm font-black text-slate-800 dark:text-slate-100">Conectar iFood</div>
          <div className="text-sm text-slate-600 dark:text-slate-300">
            A importacao automatica de cardapio do iFood ainda esta em preparacao. Quando estiver pronta, esta etapa podera ser ativada para tenants elegiveis.
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onPrev}
          className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-black rounded-2xl transition-all text-sm"
        >
          Voltar
        </button>

        {canUseIfoodIntegration && !isConnected && showManualForm ? (
          <button
            onClick={() => void handleConnect()}
            disabled={connectMutation.isPending || loadingBilling || loadingStatus}
            className="flex-[1.4] inline-flex items-center justify-center gap-2 py-4 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-black rounded-2xl transition-all text-sm"
          >
            {connectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Salvar conexao
          </button>
        ) : null}

        <button
          onClick={handleContinueWithoutIfood}
          className="flex-[1.6] inline-flex items-center justify-center gap-2 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl transition-all text-sm"
        >
          {isConnected ? <ArrowRight className="w-4 h-4" /> : <SkipForward className="w-4 h-4" />}
          {isConnected ? 'Continuar' : 'Continuar sem iFood'}
        </button>
      </div>

      {currentChoice === 'failed' ? (
        <div className="text-xs text-amber-600 dark:text-amber-400 font-bold">
          Se a conexao falhar, voce ainda pode concluir o onboarding sem iFood agora e voltar depois.
        </div>
      ) : null}
    </div>
  );
}
