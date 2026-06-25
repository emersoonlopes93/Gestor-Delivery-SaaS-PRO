import { Outlet } from 'react-router-dom';
import { usePlatformBrand } from '../hooks/use-platform-brand';

export function AuthLayout() {
  const { appName, appInitial } = usePlatformBrand();

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-background transition-colors duration-500">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-secondary/10 blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
      {/* Background desativado para evitar erro 404 no Vercel */}

      <div className="relative z-10 w-full max-w-[440px] mx-4">
        <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-card shadow-2xl mb-4 border border-border transition-transform hover:scale-105 duration-300">
            <div className="w-10 h-10 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-black text-2xl shadow-lg shadow-primary/20">
              {appInitial}
            </div>
          </div>
          <h2 className="text-3xl font-black text-foreground tracking-tight">
            {appName}
          </h2>
          <p className="text-muted-foreground font-medium mt-2">
            Gestao global do ecossistema.
          </p>
        </div>

        <div className="animate-in fade-in zoom-in-95 duration-500 delay-150 fill-mode-both">
          <Outlet />
        </div>

        <p className="text-center mt-8 text-xs text-muted-foreground font-bold uppercase tracking-widest animate-in fade-in duration-1000 delay-500 fill-mode-both">
          &copy; {new Date().getFullYear()} {appName}
        </p>
      </div>
    </div>
  );
}
