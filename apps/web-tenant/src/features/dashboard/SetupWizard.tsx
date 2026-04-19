import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  CheckCircle2, 
  Circle, 
  MapPin, 
  Wallet, 
  Clock, 
  UtensilsCrossed, 
  Store,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { TenantSettings, TenantOperatingHours } from '@gestor/types';

interface SetupStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  path: string;
  isCompleted: boolean;
  isCritical?: boolean;
}

interface SetupWizardProps {
  settings: TenantSettings | null;
  operatingHours: TenantOperatingHours[];
  hasCategories: boolean;
  hasProducts: boolean;
}

export function SetupWizard({ settings, operatingHours, hasCategories, hasProducts }: SetupWizardProps) {
  const navigate = useNavigate();

  const steps: SetupStep[] = [
    {
      id: 'identity',
      title: 'Identidade da Loja',
      description: 'Nome, logo e contatos básicos da sua unidade.',
      icon: Store,
      path: '/settings',
      isCompleted: !!(settings?.logoUrl && settings?.businessPhone),
    },
    {
      id: 'address',
      title: 'Endereço e Localização',
      description: 'Essencial para calcular taxas de entrega e CEPs atendidos.',
      icon: MapPin,
      path: '/settings',
      isCritical: true,
      isCompleted: !!(settings?.street && settings?.number && settings?.neighborhood && settings?.zipCode),
    },
    {
      id: 'payments',
      title: 'Configurar Pagamentos',
      description: 'Configure sua chave PIX para receber pedidos online.',
      icon: Wallet,
      path: '/settings',
      isCritical: true,
      isCompleted: !!(settings?.pixKey && settings?.paymentMethods && settings.paymentMethods.length > 0),
    },
    {
      id: 'hours',
      title: 'Horários de Funcionamento',
      description: 'Defina quando sua loja está aberta para receber pedidos.',
      icon: Clock,
      path: '/settings',
      isCompleted: operatingHours.some(h => h.isOpen),
    },
    {
      id: 'catalog',
      title: 'Cardápio Base',
      description: 'Crie pelo menos uma categoria e um produto para começar.',
      icon: UtensilsCrossed,
      path: '/catalog/products',
      isCompleted: hasCategories && hasProducts,
    }
  ];

  const completedCount = steps.filter(s => s.isCompleted).length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);

  if (progressPercent === 100) return null;

  return (
    <div className="mb-10 animate-in fade-in slide-in-from-top-4 duration-700">
      <div className="bg-white border-2 border-primary-100 rounded-3xl overflow-hidden shadow-xl shadow-primary-50">
        <div className="bg-primary-600 p-6 sm:p-8 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black mb-1">Vamos montar sua loja? 🚀</h2>
              <p className="text-primary-100 font-medium">Complete os passos abaixo para começar a vender hoje mesmo.</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/20">
              <div className="text-xs font-black uppercase tracking-widest text-primary-200 mb-1">Progresso</div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 w-32 bg-white/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-white transition-all duration-1000 ease-out" 
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="font-black text-xl">{progressPercent}%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {steps.map((step) => (
              <div 
                key={step.id}
                onClick={() => navigate(step.path)}
                className={`group relative p-5 rounded-2xl border-2 transition-all cursor-pointer hover:shadow-lg ${
                  step.isCompleted 
                    ? 'border-green-100 bg-green-50/30' 
                    : step.isCritical 
                      ? 'border-amber-100 bg-white hover:border-amber-300' 
                      : 'border-gray-100 bg-white hover:border-primary-100'
                }`}
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className={`p-3 rounded-xl ${
                    step.isCompleted 
                      ? 'bg-green-100 text-green-600' 
                      : step.isCritical 
                        ? 'bg-amber-100 text-amber-600' 
                        : 'bg-gray-100 text-gray-400 group-hover:bg-primary-100 group-hover:text-primary-600'
                  }`}>
                    <step.icon className="h-6 w-6" />
                  </div>
                  {step.isCompleted ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  ) : (
                    <Circle className="h-6 w-6 text-gray-200" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className={`font-black tracking-tight ${step.isCompleted ? 'text-green-800' : 'text-gray-900'}`}>
                      {step.title}
                    </h3>
                    {step.isCritical && !step.isCompleted && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-[10px] font-black text-amber-700 uppercase">Obrigatório</span>
                    )}
                  </div>
                  <p className={`text-sm font-medium leading-relaxed ${step.isCompleted ? 'text-green-600' : 'text-gray-500'}`}>
                    {step.description}
                  </p>
                </div>

                {!step.isCompleted && (
                  <div className="mt-4 flex items-center gap-1 text-xs font-black uppercase tracking-widest text-primary-600 group-hover:translate-x-1 transition-transform">
                    Configurar agora <ChevronRight className="h-3 w-3" />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="text-sm font-bold">
                Atenção: A loja não aparecerá online até que o endereço e pagamentos estejam configurados.
              </p>
            </div>
            <button 
              onClick={() => navigate('/settings')}
              className="px-6 py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition-colors"
            >
              Configurações Completas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
