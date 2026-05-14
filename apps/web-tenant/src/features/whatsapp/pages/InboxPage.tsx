import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api-client';
import type { ChatSessionListItem, ChatSession } from '@gestor/types';
import { ChatArea } from '../components/ChatArea';

export function InboxPage() {
  const queryClient = useQueryClient();
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);

  const { data: sessions = [] } = useQuery({
    queryKey: ['chat-sessions'],
    queryFn: async () => {
      const res = await api.get<ChatSessionListItem[]>('/chat/sessions');
      return res.success ? res.data : [];
    },
  });

  const handleSessionSelect = (session: ChatSessionListItem) => {
    // Buscar sessão completa
    setSelectedSession(session as unknown as ChatSession);
  };

  const handleSessionUpdate = (updatedSession: ChatSession) => {
    setSelectedSession(updatedSession);
    // Atualizar lista de sessões
    queryClient.setQueryData(['chat-sessions'], (old: ChatSessionListItem[] | undefined) => {
      if (!old) return old;
      return old.map(s => s.id === updatedSession.id ? { ...s, ...updatedSession } : s);
    });
  };

  const handleBack = () => {
    setSelectedSession(null);
  };

  return (
    <div className="h-[calc(100vh-theme(spacing.16))] flex flex-col md:flex-row bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {/* Sidebar de conversas */}
      <div className="w-full md:w-80 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Caixa de Entrada</h2>
          <div className="flex gap-2">
            <button className="flex-1 py-1.5 px-3 bg-primary-500/10 text-primary-600 dark:text-primary-400 text-sm font-medium rounded-lg border border-primary-500/20">
              Aguardando (1)
            </button>
            <button className="flex-1 py-1.5 px-3 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              Todos
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {sessions.map(s => (
            <div 
              key={s.id} 
              onClick={() => handleSessionSelect(s)}
              className="p-4 border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-white/[0.02] cursor-pointer transition-colors relative"
            >
              {s.handoffActive && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded-r-full" />
              )}
              <div className="flex items-start justify-between mb-1">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {s.name || `Cliente ${s.customerPhone}`}
                </h3>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {s.time || new Date(s.lastMessageAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-2">{s.lastMessage || 'Sem mensagens'}</p>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                  s.handoffActive ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-primary-500/10 text-primary-600 dark:text-primary-400'
                }`}>
                  {s.handoffActive ? 'Atendimento Humano' : 'Bot Ativo'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Área de chat funcional */}
      <ChatArea
        session={selectedSession}
        onBack={handleBack}
        onSessionUpdate={handleSessionUpdate}
      />
    </div>
  );
}
