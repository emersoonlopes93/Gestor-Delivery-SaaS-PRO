import { useState, FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth.store';
import type { TenantLoginResponse } from '@gestor/types';
import { Mail, Lock, Loader2, ArrowRight, AlertCircle } from 'lucide-react';

/**
 * Login page for tenant users with premium aesthetics.
 */
export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isExpired = searchParams.get('expired') === '1';
  const { setUser } = useAuthStore();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post<TenantLoginResponse>('/auth/tenant/login', {
        email,
        password,
      });

      const { accessToken, refreshToken, user } = res.data;

      // Store tokens
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);

      // Set user in store
      setUser(user);

      navigate('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Credenciais inválidas ou erro no servidor.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-premium p-8 shadow-2xl border-none bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {isExpired && !error && (
          <div className="alert-warning p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <AlertCircle size={20} className="shrink-0" />
            <p className="text-xs font-bold uppercase tracking-wide">Sua sessão expirou. Faça login novamente.</p>
          </div>
        )}

        {error && (
          <div className="alert-danger p-4 rounded-2xl flex items-center gap-3 animate-in shake duration-500">
            <AlertCircle size={20} className="shrink-0" />
            <p className="text-xs font-bold uppercase tracking-wide">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-2 ml-1"
            >
              E-mail de Acesso
            </label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary-500 transition-colors">
                <Mail size={18} />
              </div>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input-premium pl-12 h-12"
                placeholder="exemplo@gestor.com"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 ml-1">
              <label
                htmlFor="password"
                className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]"
              >
                Sua Senha
              </label>
              <button type="button" className="text-[10px] font-black text-primary-600 uppercase tracking-widest hover:underline decoration-2 underline-offset-4">
                Esqueci a senha
              </button>
            </div>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary-500 transition-colors">
                <Lock size={18} />
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input-premium pl-12 h-12"
                placeholder="••••••••••••"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full h-12 text-sm uppercase tracking-[0.2em] group relative overflow-hidden"
        >
          <span className={`flex items-center justify-center gap-2 transition-all ${loading ? 'opacity-0 scale-90' : 'opacity-100 scale-100'}`}>
            Acessar Painel
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </span>
          
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </button>

        <div className="pt-2 text-center">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            Não tem uma conta? <button type="button" className="text-primary-600 hover:underline decoration-2 underline-offset-4">Solicite uma demonstração</button>
          </p>
        </div>
      </form>
    </div>
  );
}
