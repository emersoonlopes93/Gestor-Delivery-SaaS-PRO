import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Lock, Phone, Store, ArrowLeft } from 'lucide-react';
import type { DriverLoginResponse, DriverLoginResult, DriverTenantSelectionRequired } from '@gestor/types';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

type ApiEnvelope<T> = { success: true; data: T };

function unwrapResponse<T>(value: T | ApiEnvelope<T>): T {
  if (value && typeof value === 'object' && 'success' in value && 'data' in value) {
    return value.data;
  }
  return value;
}

function requiresTenantSelection(result: DriverLoginResult): result is DriverTenantSelectionRequired {
  return 'requiresTenantSelection' in result && result.requiresTenantSelection;
}

export function LoginPage() {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [tenantSelection, setTenantSelection] = useState<DriverTenantSelectionRequired | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const completeLogin = (result: DriverLoginResponse) => {
    setAuth(result.accessToken, result.refreshToken, result.driver);
    navigate('/');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await api.post<ApiEnvelope<DriverLoginResult> | DriverLoginResult>('/auth/driver/login', {
        phone,
        pin,
      });
      const result = unwrapResponse(response.data);
      if (requiresTenantSelection(result)) {
        setTenantSelection(result);
      } else {
        completeLogin(result);
      }
    } catch {
      setError('Não foi possível entrar. Verifique suas credenciais e tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTenantSelection = async (driverId: string) => {
    if (!tenantSelection) return;
    setError('');
    setIsLoading(true);
    try {
      const response = await api.post<ApiEnvelope<DriverLoginResponse> | DriverLoginResponse>(
        '/auth/driver/select-tenant',
        { selectionToken: tenantSelection.selectionToken, driverId },
      );
      completeLogin(unwrapResponse(response.data));
    } catch {
      setTenantSelection(null);
      setError('Não foi possível entrar. Verifique suas credenciais e tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="delivery-shell flex flex-col max-w-md mx-auto relative overflow-hidden font-sans">
      <div className="flex-1 flex flex-col justify-center px-6 py-12">
        
        <div className="mx-auto w-16 h-16 bg-orange-500 text-white rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-orange-500/30">
          <Package className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-black text-[var(--delivery-foreground)] text-center mb-2 tracking-tight">
          Gestor Delivery
        </h1>
        <p className="text-sm text-[var(--delivery-muted-foreground)] text-center mb-10">
          Acesso do Entregador
        </p>

        {tenantSelection ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--delivery-border)] bg-[var(--delivery-card)] p-4 shadow-sm">
              <p className="text-sm font-bold text-[var(--delivery-foreground)]">Escolha onde você vai trabalhar</p>
              <p className="mt-1 text-xs text-[var(--delivery-muted-foreground)]">Seu acesso foi confirmado. Selecione uma das lojas vinculadas.</p>
            </div>
            <div className="space-y-2" role="list" aria-label="Lojas disponíveis">
              {tenantSelection.tenants.map((option) => (
                <button
                  key={option.driverId}
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleTenantSelection(option.driverId)}
                  className="flex w-full items-center gap-3 rounded-xl border border-[var(--delivery-border)] bg-[var(--delivery-card)] p-4 text-left font-bold text-[var(--delivery-foreground)] transition-all hover:border-orange-400 hover:bg-orange-50 hover:text-slate-900 disabled:opacity-50"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                    <Store className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{option.tenant.name}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => setTenantSelection(null)}
              className="flex w-full items-center justify-center gap-2 py-2 text-sm font-semibold text-[var(--delivery-muted-foreground)] hover:text-[var(--delivery-foreground)] disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
          </div>
        ) : (
        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm font-medium border border-red-100">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--delivery-foreground)] mb-1">Telefone</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Phone className="h-5 w-5 text-[var(--delivery-muted-foreground)]" />
              </div>
              <input
                type="tel"
                required
                className="w-full pl-10 pr-3 py-3 rounded-xl border border-[var(--delivery-border)] bg-[var(--delivery-input)] text-[var(--delivery-foreground)] placeholder:text-[var(--delivery-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                placeholder="(00) 00000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--delivery-foreground)] mb-1">PIN / Código de Acesso</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-[var(--delivery-muted-foreground)]" />
              </div>
              <input
                type="password"
                required
                className="w-full pl-10 pr-3 py-3 rounded-xl border border-[var(--delivery-border)] bg-[var(--delivery-input)] text-[var(--delivery-foreground)] placeholder:text-[var(--delivery-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                placeholder="Seu código de acesso"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-6 py-3 px-4 rounded-xl text-white font-bold text-center bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 focus:ring-4 focus:ring-orange-500/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100"
          >
            {isLoading ? 'Entrando...' : 'Acessar'}
          </button>
        </form>
        )}

      </div>
    </div>
  );
}
