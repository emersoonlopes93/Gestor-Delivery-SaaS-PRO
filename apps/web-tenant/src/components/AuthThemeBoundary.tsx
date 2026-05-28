import { useEffect } from 'react';

/**
 * AuthThemeBoundary - Isola o tema das rotas de autenticação
 * 
 * Este componente garante que as rotas de auth (login, forgot-password, etc.)
 * usem sempre o tema light, independentemente das preferências do usuário
 * ou do tema configurado no tenant panel.
 * 
 * Remove qualquer influência do tema tenant e força o tema light especificamente
 * para rotas públicas de autenticação.
 */
export function AuthThemeBoundary({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Remover qualquer influência de tema do tenant
    const root = document.documentElement;
    
    // Remover atributo data-theme se existir (definido pelo tenant)
    root.removeAttribute('data-theme');
    
    // Remover classe .dark se existir (compatibilidade)
    root.classList.remove('dark');
    
    // Forçar tema light explicitamente para auth
    root.setAttribute('data-auth-theme', 'light');
    
    // Cleanup: restaurar estado original ao sair das rotas auth
    return () => {
      root.removeAttribute('data-auth-theme');
    };
  }, []);

  return <>{children}</>;
}
