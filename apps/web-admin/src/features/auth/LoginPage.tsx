import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AdminLoginResponse } from '@gestor/types';
import { api, ApiError } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth.store';
import { Mail, Lock, Loader2, ArrowRight, AlertCircle, ShieldCheck } from 'lucide-react';

/**
 * SaaS Admin login page with premium aesthetics.
 */
export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { setUser } = useAuthStore();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post<AdminLoginResponse>('/auth/admin/login', {
        email,
        password,
      });

      const { accessToken, refreshToken, user } = res.data;

      localStorage.setItem('admin_accessToken', accessToken);
      localStorage.setItem('admin_refreshToken', refreshToken);

      setUser(user);

      navigate('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Credenciais administrativas inválidas.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 p-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex items-center gap-2 mb-6 px-1">
        <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600">
          <ShieldCheck size={20} />
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">Ambiente Seguro</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold p-4 rounded-2xl border border-red-100 dark:border-red-900/30 flex items-center gap-3 animate-in shake duration-500">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 ml-1">
              E-mail Administrativo
            </label>
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input-premium pl-12"
                placeholder="admin@gestorpro.com"
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 ml-1">
              Senha de Acesso
            </label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input-premium pl-12"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full h-12"
        >
          {loading ? (
            <Loader2 className="animate-spin" size={20} />
          ) : (
            <>
              Entrar no Sistema
              <ArrowRight className="group-hover:translate-x-1 transition-transform" size={18} />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
