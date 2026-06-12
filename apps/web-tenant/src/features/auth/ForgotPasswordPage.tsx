import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api-client';
import { Mail, Loader2, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';

/**
 * Forgot password page for tenant users.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/auth/tenant/forgot-password', {
        email,
      });

      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Erro ao solicitar recuperação de senha.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="card-premium p-8 shadow-2xl border-none bg-card/80 backdrop-blur-xl">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
              <CheckCircle size={32} className="text-green-500" />
            </div>
          </div>
          
          <div>
            <h2 className="text-2xl font-bold mb-2">E-mail enviado!</h2>
            <p className="text-muted-foreground text-sm">
              Enviamos instruções para recuperação de senha para o e-mail <strong>{email}</strong>.
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              Verifique sua caixa de entrada e spam.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 text-sm uppercase tracking-[0.2em] font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft size={18} />
            Voltar para o login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card-premium p-8 shadow-2xl border-none bg-card/80 backdrop-blur-xl">
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors text-sm"
        >
          <ArrowLeft size={16} />
          Voltar
        </button>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Esqueci minha senha</h2>
        <p className="text-muted-foreground text-sm">
          Digite seu e-mail e enviaremos instruções para recuperar sua senha.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="alert-danger p-4 rounded-2xl flex items-center gap-3 animate-in shake duration-500">
            <AlertCircle size={20} className="shrink-0" />
            <p className="text-xs font-bold uppercase tracking-wide">{error}</p>
          </div>
        )}

        <div>
          <label
            htmlFor="email"
            className="block text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-2 ml-1"
          >
            E-mail de Acesso
          </label>
          <div className="relative group">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
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

        <button
          type="submit"
          disabled={loading}
          className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed text-sm uppercase tracking-[0.2em] font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 group relative overflow-hidden disabled:pointer-events-none"
        >
          <span className={`flex items-center justify-center gap-2 transition-all ${loading ? 'opacity-0 scale-90' : 'opacity-100 scale-100'}`}>
            Enviar instruções
          </span>
          
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary-foreground" />
            </div>
          )}
        </button>
      </form>
    </div>
  );
}
