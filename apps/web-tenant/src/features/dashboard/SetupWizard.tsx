import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  AlertTriangle, 
  ChevronRight,
  X,
  MapPin,
  Wallet
} from 'lucide-react';
import { TenantSettings, TenantOperatingHours } from '@gestor/types';
import { useAuthStore } from '../../stores/auth.store';

interface SetupWizardProps {
  settings: TenantSettings | null;
  operatingHours: TenantOperatingHours[];
  hasCategories: boolean;
  hasProducts: boolean;
}

export function SetupWizard({ settings, operatingHours, hasCategories, hasProducts }: SetupWizardProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const tenantId = user?.tenantId || 'default';
  const dismissKey = `onboarding_dismissed_${tenantId}`;

  // Estado para controlar se o onboarding foi dispensado
  const [dismissed, setDismissed] = useState<boolean>(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const isDismissed = localStorage.getItem(dismissKey) === 'true';
    setDismissed(isDismissed);
    setIsLoaded(true);
  }, [dismissKey]);

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    localStorage.setItem(dismissKey, 'true');
    setDismissed(true);
  };

  // 1. Identidade da Loja
  const isIdentityDone = !!(settings?.logoUrl && settings?.businessPhone);
  
  // 2. Endereço e Localização (CRÍTICO)
  const isAddressDone = !!(settings?.street && settings?.number && settings?.neighborhood && settings?.zipCode);
  
  // 3. Configurar Pagamentos (CRÍTICO)
  const isPaymentsDone = !!(settings?.pixKey && settings?.paymentMethods && settings.paymentMethods.length > 0);
  
  // 4. Horários de Funcionamento
  const isHoursDone = operatingHours.some(h => h.isOpen);
  
  // 5. Cardápio Base
  const isCatalogDone = hasCategories && hasProducts;

  const steps = [
    { id: 'identity', title: 'Identidade da Loja', isCompleted: isIdentityDone },
    { id: 'address', title: 'Endereço', isCompleted: isAddressDone, isCritical: true },
    { id: 'payments', title: 'Pagamentos (Pix)', isCompleted: isPaymentsDone, isCritical: true },
    { id: 'hours', title: 'Horários', isCompleted: isHoursDone },
    { id: 'catalog', title: 'Cardápio Base', isCompleted: isCatalogDone }
  ];

  const completedCount = steps.filter(s => s.isCompleted).length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);
  const setupStatus = progressPercent === 100 ? 'completed' : 'pending';

  // Se o setup estiver completo ou se o onboarding já foi dispensado, não exibe nada no Dashboard
  if (!isLoaded || setupStatus === 'completed' || dismissed) {
    return null;
  }

  // Verifica se há alguma pendência crítica ativa
  const hasCriticalPending = !isAddressDone || !isPaymentsDone;

  // Se não houver pendências críticas, não exibe o card compacto no dashboard (dashboard limpo para quem já configurou o básico)
  if (!hasCriticalPending) {
    return null;
  }

  return (
    <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="relative bg-gradient-to-r from-amber-500/10 to-orange-500/10 dark:from-amber-500/5 dark:to-orange-500/5 border border-amber-200/40 dark:border-amber-900/30 rounded-3xl p-5 sm:p-6 shadow-md shadow-amber-500/5">
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 transition-colors"
          title="Dispensar aviso"
          aria-label="Dispensar aviso"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 pr-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-2xl shrink-0 animate-pulse">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-black text-amber-800 dark:text-amber-400 uppercase tracking-tight flex items-center gap-2">
                Sua loja ainda não está pronta para vender!
              </h2>
              <p className="text-sm font-medium text-amber-700/80 dark:text-amber-400/70 leading-relaxed max-w-2xl">
                Para ativar os pedidos online e o cálculo de entregas no cardápio, configure as seguintes pendências críticas:
              </p>
              
              <div className="flex flex-wrap gap-3 mt-3">
                {!isAddressDone && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs font-black text-amber-800 dark:text-amber-400">
                    <MapPin className="w-3.5 h-3.5" /> Endereço da Loja
                  </span>
                )}
                {!isPaymentsDone && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs font-black text-amber-800 dark:text-amber-400">
                    <Wallet className="w-3.5 h-3.5" /> Meios de Pagamento (PIX)
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-row sm:flex-col md:items-end gap-3 shrink-0 mt-2 md:mt-0">
            <button
              onClick={() => navigate('/onboarding')}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600 text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95"
            >
              Configurar Agora
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDismiss}
              className="inline-flex items-center justify-center px-4 py-2.5 text-xs font-bold text-amber-800 dark:text-amber-400 hover:underline transition-all"
            >
              Lembrar mais tarde
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
