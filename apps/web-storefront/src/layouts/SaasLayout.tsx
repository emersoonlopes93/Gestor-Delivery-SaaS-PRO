import { Outlet, Link } from 'react-router-dom';

export function SaasLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <Link to="/" className="text-2xl font-bold text-indigo-600 tracking-tight">
                PedeHub
              </Link>
              <nav className="hidden md:ml-10 md:flex space-x-8">
                <Link to="/precos" className="text-slate-600 hover:text-indigo-600 font-medium transition-colors">
                  Preços
                </Link>
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              <Link to="/login" className="text-slate-600 hover:text-indigo-600 font-medium transition-colors">
                Entrar
              </Link>
              <Link to="/cadastro" className="bg-indigo-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-sm">
                Criar Conta
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-grow">
        <Outlet />
      </main>

      <footer className="bg-slate-900 text-slate-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <span className="text-xl font-bold text-white tracking-tight">PedeHub</span>
            <p className="mt-4 max-w-sm">
              O sistema definitivo para alavancar seu delivery. Peça via WhatsApp com IA, controle cardápios e fidelize seus clientes.
            </p>
          </div>
          <div>
            <h3 className="text-white font-medium mb-4">Produto</h3>
            <ul className="space-y-3">
              <li><Link to="/precos" className="hover:text-white transition-colors">Planos e Preços</Link></li>
              <li><Link to="/cadastro" className="hover:text-white transition-colors">Criar Conta</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-medium mb-4">Suporte</h3>
            <ul className="space-y-3">
              <li><a href="#" className="hover:text-white transition-colors">Central de Ajuda</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Termos de Uso</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-slate-800 text-center text-sm">
          &copy; {new Date().getFullYear()} PedeHub. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
}
