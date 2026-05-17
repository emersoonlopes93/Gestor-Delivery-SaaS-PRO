import { Outlet } from 'react-router-dom';

/**
 * Layout for public pages (login, register, etc.) with premium aesthetics.
 */
export function AuthLayout() {
  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-gray-50 dark:bg-gray-950 transition-colors duration-500">
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary-500/10 blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/10 blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
      
      {/* Mesh Gradient Overlay */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none" />

      <div className="relative z-10 w-full max-w-[440px] mx-4">
        {/* Logo / Brand Header */}
        <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-white dark:bg-gray-900 shadow-2xl mb-4 border border-gray-100 dark:border-gray-800 transition-transform hover:scale-105 duration-300">
            <div className="w-10 h-10 rounded-2xl bg-primary-600 text-white flex items-center justify-center font-black text-2xl shadow-lg shadow-primary-600/20">
              G
            </div>
          </div>
          <h2 className="text-3xl font-black text-gray-900 dark:text-gray-100 tracking-tight">
            Gestor<span className="text-primary-600">PRO</span>
          </h2>
          <p className="text-gray-500 dark:text-gray-400 font-medium mt-2">
            A inteligência que seu delivery merece.
          </p>
        </div>

        {/* Content Container */}
        <div className="animate-in fade-in zoom-in-95 duration-500 delay-150 fill-mode-both">
          <Outlet />
        </div>

        {/* Footer info */}
        <p className="text-center mt-8 text-xs text-gray-400 dark:text-gray-600 font-bold uppercase tracking-widest animate-in fade-in duration-1000 delay-500 fill-mode-both">
          &copy; {new Date().getFullYear()} Gestor Delivery SaaS PRO
        </p>
      </div>
    </div>
  );
}

