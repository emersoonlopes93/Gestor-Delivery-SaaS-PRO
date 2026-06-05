import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export function SaasRedirectLogin() {
  useEffect(() => {
    // Em um ambiente de produção real, redirecionamos para o subdomínio 'app.seudominio.com'
    // Como estamos local/homologação, redirecionamos para a porta ou path do web-tenant
    const tenantUrl = import.meta.env.VITE_TENANT_URL || 'http://localhost:5173';
    
    const timeout = setTimeout(() => {
      window.location.href = `${tenantUrl}/login`;
    }, 1500);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center max-w-sm w-full">
        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-6" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">Redirecionando...</h2>
        <p className="text-slate-500">
          Você está sendo levado para o painel de gerenciamento do seu delivery.
        </p>
      </div>
    </div>
  );
}
