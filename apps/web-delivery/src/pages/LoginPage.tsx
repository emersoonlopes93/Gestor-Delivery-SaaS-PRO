import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Lock, Phone, Globe } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

export function LoginPage() {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  // Auto-detect tenant slug from subdomain if present
  useEffect(() => {
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    if (parts.length > 2 && parts[0] !== 'www') {
      setTenantSlug(parts[0]);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await api.post('/auth/driver/login', { 
        phone, 
        pin,
        tenantSlug 
      });
      // TransformInterceptor na API envelopa tudo em { success: true, data: { ... } }
      const responseData = response.data.success ? response.data.data : response.data;
      const { accessToken, refreshToken, driver } = responseData;
      
      setAuth(accessToken, refreshToken, driver);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao fazer login. Verifique suas credenciais.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 max-w-md mx-auto relative overflow-hidden font-sans">
      <div className="flex-1 flex flex-col justify-center px-6 py-12">
        
        <div className="mx-auto w-16 h-16 bg-orange-500 text-white rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-orange-500/30">
          <Package className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-black text-slate-900 text-center mb-2 tracking-tight">
          Gestor Delivery
        </h1>
        <p className="text-sm text-slate-500 text-center mb-10">
          Acesso do Entregador
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm font-medium border border-red-100">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Identificador da Loja (Slug)</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Globe className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                required
                className="w-full pl-10 pr-3 py-3 rounded-xl border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                placeholder="ex: pizzaria-do-joao"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Telefone</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Phone className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="tel"
                required
                className="w-full pl-10 pr-3 py-3 rounded-xl border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                placeholder="(00) 00000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">PIN / Código de Acesso</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="password"
                required
                className="w-full pl-10 pr-3 py-3 rounded-xl border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
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

      </div>
    </div>
  );
}
