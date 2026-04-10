import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';

/**
 * Main app layout with sidebar navigation for authenticated pages.
 */
export function AppLayout() {
  const { user, clearUser } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    clearUser();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-lg font-bold text-primary-700">
            Gestor Delivery
          </h1>
          <p className="text-xs text-gray-500 mt-1 truncate">
            {user?.name || 'Carregando...'}
          </p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <Link
            to="/dashboard"
            className="flex items-center px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-primary-50 hover:text-primary-700 transition-colors"
          >
            📊 Dashboard
          </Link>
          
          <div className="pt-4 pb-1">
            <p className="px-3 text-xs font-black text-gray-400 uppercase tracking-wider">Pedidos</p>
          </div>
          <Link
            to="/orders"
            className="flex items-center px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-primary-50 hover:text-primary-700 transition-colors"
          >
            📦 Lista de Pedidos
          </Link>
          <Link
            to="/orders/board"
            className="flex items-center px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-primary-50 hover:text-primary-700 transition-colors"
          >
            📋 Kanban Operacional
          </Link>
          <Link
            to="/orders/kds"
            className="flex items-center px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-primary-50 hover:text-primary-700 transition-colors"
          >
            👨‍🍳 KDS (Cozinha)
          </Link>

          <div className="pt-4 pb-1">
            <p className="px-3 text-xs font-black text-gray-400 uppercase tracking-wider">Logística</p>
          </div>
          <Link
            to="/delivery/dispatch"
            className="flex items-center px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-primary-50 hover:text-primary-700 transition-colors"
          >
            🚚 Despacho Em Tempo Real
          </Link>
          <Link
            to="/delivery/drivers"
            className="flex items-center px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-primary-50 hover:text-primary-700 transition-colors"
          >
            🛵 Entregadores
          </Link>

          <div className="pt-4 pb-1">
            <p className="px-3 text-xs font-black text-gray-400 uppercase tracking-wider">Sistema</p>
          </div>
          <Link
            to="/settings"
            className="flex items-center px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-primary-50 hover:text-primary-700 transition-colors"
          >
            ⚙️ Configurações
          </Link>
        </nav>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            🚪 Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
