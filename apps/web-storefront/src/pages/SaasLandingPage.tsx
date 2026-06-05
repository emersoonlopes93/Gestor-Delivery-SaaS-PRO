import { Link } from 'react-router-dom';
import { ArrowRight, Bot, Clock, LayoutDashboard, ShoppingBag, Smartphone } from 'lucide-react';

export function SaasLandingPage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="bg-white pt-24 pb-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-7xl font-extrabold text-slate-900 tracking-tight mb-8">
              O Delivery inteligente que trabalha por <span className="text-indigo-600">você</span>
            </h1>
            <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
              Atenda centenas de clientes no WhatsApp com IA nativa, gerencie pedidos em um Kanban profissional e escale seu negócio de delivery sem estresse.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/cadastro"
                className="w-full sm:w-auto px-8 py-4 bg-indigo-600 text-white text-lg font-medium rounded-xl hover:bg-indigo-700 transition-all shadow-lg hover:shadow-indigo-500/30 flex items-center justify-center gap-2"
              >
                Criar Minha Loja Grátis <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                to="/precos"
                className="w-full sm:w-auto px-8 py-4 bg-white text-slate-700 text-lg font-medium rounded-xl border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center"
              >
                Ver Preços
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 bg-slate-50 border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Tudo o que você precisa em um só lugar</h2>
            <p className="text-lg text-slate-600">Esqueça as dezenas de sistemas que não conversam entre si.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Bot className="w-8 h-8 text-indigo-500" />}
              title="IA Nativa no WhatsApp"
              description="Atendente virtual que anota pedidos, responde dúvidas e direciona para o humano quando necessário (Human Handoff)."
            />
            <FeatureCard 
              icon={<ShoppingBag className="w-8 h-8 text-indigo-500" />}
              title="Cardápio Digital PWA"
              description="Sua loja online super rápida. O cliente acessa pelo link, adiciona os itens e finaliza sem precisar baixar nada."
            />
            <FeatureCard 
              icon={<LayoutDashboard className="w-8 h-8 text-indigo-500" />}
              title="Gestão em Kanban (KDS)"
              description="Acompanhe o status de cada pedido em tempo real. Produção, embalagem, pronto para entrega e concluído."
            />
            <FeatureCard 
              icon={<Clock className="w-8 h-8 text-indigo-500" />}
              title="Agendamento Inteligente"
              description="Permita que o cliente escolha janelas de horários e evite overbooking na sua cozinha nos dias de pico."
            />
            <FeatureCard 
              icon={<Smartphone className="w-8 h-8 text-indigo-500" />}
              title="Smart Inbox"
              description="Caixa de entrada única para o WhatsApp. Atenda múltiplos clientes sem perder o histórico, com sessões organizadas."
            />
          </div>
        </div>
      </section>
      
      {/* CTA Bottom */}
      <section className="py-20 bg-indigo-600">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-6">Pronto para transformar seu delivery?</h2>
          <p className="text-indigo-100 text-lg mb-8">Junte-se às lojas que estão economizando horas de atendimento e faturando mais.</p>
          <Link
            to="/cadastro"
            className="inline-block px-8 py-4 bg-white text-indigo-600 text-lg font-bold rounded-xl hover:bg-slate-50 transition-all shadow-lg"
          >
            Começar Agora
          </Link>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="w-14 h-14 bg-indigo-50 rounded-xl flex items-center justify-center mb-6">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-slate-900 mb-3">{title}</h3>
      <p className="text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}
