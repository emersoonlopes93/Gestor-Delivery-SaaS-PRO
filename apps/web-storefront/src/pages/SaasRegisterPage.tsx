import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Store, User, Phone, Mail, Lock, ArrowRight, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { api } from '../lib/api-client';
import { maskPhone, unmask } from '@gestor/utils';

export function SaasRegisterPage() {
  const [formData, setFormData] = useState({
    ownerName: '',
    shopName: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (formData.password !== formData.confirmPassword) {
      setError('As senhas não conferem.');
      setLoading(false);
      return;
    }
    
    try {
      const payload = {
        ownerName: formData.ownerName,
        shopName: formData.shopName,
        email: formData.email,
        password: formData.password,
        phone: unmask(formData.phone), // enviar normalizado
      };

      await api.post('/auth/tenant/register', payload);
      setSuccess(true);
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'Ocorreu um erro ao criar a conta.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    if (name === 'phone') {
      setFormData({ ...formData, phone: maskPhone(value) });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-slate-100">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Conta criada!</h2>
          <p className="text-slate-600 mb-8">
            Seu delivery inteligente já está pronto. Acesse o painel de gerenciamento para concluir a configuração inicial.
          </p>
          <Link
            to="/login"
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 px-4 rounded-xl hover:bg-indigo-700 transition-colors font-medium"
          >
            Acessar Meu Painel <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--storefront-background)] text-[var(--storefront-foreground)] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-[var(--storefront-foreground)]">
          Crie sua Loja Grátis
        </h2>
        <p className="mt-2 text-center text-sm text-[var(--storefront-muted-foreground)]">
          Ou{' '}
          <Link to="/login" className="font-medium text-[var(--storefront-primary)] hover:opacity-90">
            faça login se já possui uma conta
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-[var(--storefront-card)] py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-[var(--storefront-border)]">
          
          {error && (
            <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-[var(--storefront-foreground)]">Seu Nome</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-[var(--storefront-muted-foreground)]" />
                </div>
                <input
                  name="ownerName"
                  type="text"
                  required
                  value={formData.ownerName}
                  onChange={handleChange}
                  className="appearance-none block w-full pl-10 px-3 py-3 border border-[var(--storefront-border)] rounded-xl shadow-sm placeholder-[var(--storefront-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--storefront-primary)] sm:text-sm bg-[var(--storefront-background)] text-[var(--storefront-foreground)] focus:bg-[var(--storefront-card)] transition-colors"
                  placeholder="Ex: João Silva"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--storefront-foreground)]">Nome da Loja</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Store className="h-5 w-5 text-[var(--storefront-muted-foreground)]" />
                </div>
                <input
                  name="shopName"
                  type="text"
                  required
                  value={formData.shopName}
                  onChange={handleChange}
                  className="appearance-none block w-full pl-10 px-3 py-3 border border-[var(--storefront-border)] rounded-xl shadow-sm placeholder-[var(--storefront-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--storefront-primary)] sm:text-sm bg-[var(--storefront-background)] text-[var(--storefront-foreground)] focus:bg-[var(--storefront-card)] transition-colors"
                  placeholder="Ex: Lanches do João"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--storefront-foreground)]">WhatsApp</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Phone className="h-5 w-5 text-[var(--storefront-muted-foreground)]" />
                </div>
                <input
                  name="phone"
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={handleChange}
                  className="appearance-none block w-full pl-10 px-3 py-3 border border-[var(--storefront-border)] rounded-xl shadow-sm placeholder-[var(--storefront-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--storefront-primary)] sm:text-sm bg-[var(--storefront-background)] text-[var(--storefront-foreground)] focus:bg-[var(--storefront-card)] transition-colors"
                  placeholder="(11) 99999-9999"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--storefront-foreground)]">E-mail</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-[var(--storefront-muted-foreground)]" />
                </div>
                <input
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="appearance-none block w-full pl-10 px-3 py-3 border border-[var(--storefront-border)] rounded-xl shadow-sm placeholder-[var(--storefront-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--storefront-primary)] sm:text-sm bg-[var(--storefront-background)] text-[var(--storefront-foreground)] focus:bg-[var(--storefront-card)] transition-colors"
                  placeholder="voce@exemplo.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--storefront-foreground)]">Senha</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-[var(--storefront-muted-foreground)]" />
                </div>
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="appearance-none block w-full pl-10 pr-10 px-3 py-3 border border-[var(--storefront-border)] rounded-xl shadow-sm placeholder-[var(--storefront-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--storefront-primary)] sm:text-sm bg-[var(--storefront-background)] text-[var(--storefront-foreground)] focus:bg-[var(--storefront-card)] transition-colors"
                  placeholder="Mínimo 8 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--storefront-muted-foreground)] hover:text-[var(--storefront-foreground)] transition-colors focus:outline-none"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--storefront-foreground)]">Confirmar Senha</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-[var(--storefront-muted-foreground)]" />
                </div>
                <input
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="appearance-none block w-full pl-10 pr-10 px-3 py-3 border border-[var(--storefront-border)] rounded-xl shadow-sm placeholder-[var(--storefront-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--storefront-primary)] sm:text-sm bg-[var(--storefront-background)] text-[var(--storefront-foreground)] focus:bg-[var(--storefront-card)] transition-colors"
                  placeholder="Mínimo 8 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--storefront-muted-foreground)] hover:text-[var(--storefront-foreground)] transition-colors focus:outline-none"
                  aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-[var(--storefront-primary)] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--storefront-primary)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? 'Criando Loja...' : 'Finalizar Cadastro'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

