import React from 'react';
import { MessageSquare, User, Clock, CheckCircle } from 'lucide-react';

export function InboxPage() {
  // Dados mockados para o MVP
  const sessions = [
    { id: 1, name: 'João Silva', phone: '+55 11 99999-9999', lastMessage: 'Queria falar com atendente', status: 'handoff', time: 'Agora' },
    { id: 2, name: 'Maria Souza', phone: '+55 11 88888-8888', lastMessage: 'Pedido confirmado pelo bot', status: 'bot', time: '5 min' },
  ];

  return (
    <div className="h-[calc(100vh-theme(spacing.16))] flex flex-col md:flex-row bg-[#0D0F12] overflow-hidden">
      {/* Sidebar de conversas */}
      <div className="w-full md:w-80 border-r border-gray-800 bg-[#14171C] flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white mb-4">Caixa de Entrada</h2>
          <div className="flex gap-2">
            <button className="flex-1 py-1.5 px-3 bg-blue-500/10 text-blue-400 text-sm font-medium rounded-lg border border-blue-500/20">
              Aguardando (1)
            </button>
            <button className="flex-1 py-1.5 px-3 bg-gray-800 text-gray-400 text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors">
              Todos
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {sessions.map(s => (
            <div key={s.id} className="p-4 border-b border-gray-800/50 hover:bg-white/[0.02] cursor-pointer transition-colors relative">
              {s.status === 'handoff' && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded-r-full" />
              )}
              <div className="flex items-start justify-between mb-1">
                <h3 className="text-sm font-semibold text-gray-200">{s.name}</h3>
                <span className="text-xs text-gray-500">{s.time}</span>
              </div>
              <p className="text-xs text-gray-400 truncate mb-2">{s.lastMessage}</p>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${s.status === 'handoff' ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'}`}>
                  {s.status === 'handoff' ? 'Atendimento Humano' : 'Bot Ativo'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Área de chat (vazia/placeholder para o MVP) */}
      <div className="flex-1 flex flex-col bg-[#0A0C0F] items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-gray-800/50 rounded-2xl flex items-center justify-center mb-4 text-gray-500">
          <MessageSquare className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Selecione uma conversa</h3>
        <p className="text-sm text-gray-400 max-w-sm">
          Acompanhe o atendimento do bot em tempo real ou assuma o controle quando o cliente solicitar ajuda humana.
        </p>
      </div>
    </div>
  );
}
