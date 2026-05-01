import React from 'react';
import { Megaphone, Plus, Users, Send, PauseCircle } from 'lucide-react';

export function CampaignsPage() {
  const campaigns = [
    { id: 1, name: 'Reativação de Clientes', status: 'running', sent: 150, audience: 500, createdAt: '01/05/2026' },
    { id: 2, name: 'Promoção Fim de Semana', status: 'draft', sent: 0, audience: 1200, createdAt: '30/04/2026' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Campanhas Ativas</h1>
          <p className="text-gray-400">Envie mensagens em massa segmentadas para sua base de clientes.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-blue-500/20">
          <Plus className="w-4 h-4" />
          Nova Campanha
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-[#1A1D24] p-6 rounded-2xl border border-gray-800">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-blue-500/10 rounded-xl text-blue-400">
              <Megaphone className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-400">Campanhas Ativas</p>
              <h3 className="text-2xl font-bold text-white">1</h3>
            </div>
          </div>
        </div>
        <div className="bg-[#1A1D24] p-6 rounded-2xl border border-gray-800">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-green-500/10 rounded-xl text-green-400">
              <Send className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-400">Mensagens Enviadas</p>
              <h3 className="text-2xl font-bold text-white">150</h3>
            </div>
          </div>
        </div>
        <div className="bg-[#1A1D24] p-6 rounded-2xl border border-gray-800">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-purple-500/10 rounded-xl text-purple-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-400">Audiência Atingida</p>
              <h3 className="text-2xl font-bold text-white">30%</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#1A1D24] border border-gray-800 rounded-2xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-800/20">
              <th className="py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">Campanha</th>
              <th className="py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
              <th className="py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">Progresso</th>
              <th className="py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">Data Criação</th>
              <th className="py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {campaigns.map(c => (
              <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="py-4 px-6">
                  <span className="font-medium text-gray-200">{c.name}</span>
                </td>
                <td className="py-4 px-6">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    c.status === 'running' ? 'bg-green-500/10 text-green-400' : 'bg-gray-800 text-gray-400'
                  }`}>
                    {c.status === 'running' ? 'Em execução' : 'Rascunho'}
                  </span>
                </td>
                <td className="py-4 px-6">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full" 
                        style={{ width: `${(c.sent / c.audience) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-400">{c.sent}/{c.audience}</span>
                  </div>
                </td>
                <td className="py-4 px-6 text-sm text-gray-400">{c.createdAt}</td>
                <td className="py-4 px-6 text-right">
                  {c.status === 'running' ? (
                    <button className="p-2 text-gray-400 hover:text-orange-400 transition-colors" title="Pausar">
                      <PauseCircle className="w-5 h-5" />
                    </button>
                  ) : (
                    <button className="text-sm text-blue-400 font-medium hover:text-blue-300 transition-colors">
                      Editar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
