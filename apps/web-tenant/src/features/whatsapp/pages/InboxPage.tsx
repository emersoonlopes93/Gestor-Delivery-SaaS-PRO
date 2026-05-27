import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api-client';
import type { ChatSessionListItem, ChatSession } from '@gestor/types';
import { ChatArea } from '../components/ChatArea';
import { useChatSocket } from '../hooks/useChatSocket';
import { useTenantAuth } from '../../../hooks/use-tenant-auth';
import { useHandoffNotification } from '../hooks/useHandoffNotification';

export function InboxPage() {
  const queryClient = useQueryClient();
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [filter, setFilter] = useState<'all' | 'waiting'>('all');
  const { user } = useTenantAuth();

  // Enable WebSocket for real-time updates
  useChatSocket(user?.tenantId);

  // Handoff notifications (sound + toast)
  useHandoffNotification(true);

  const [socketConnected, setSocketConnected] = useState<boolean>(
    typeof window !== 'undefined' ? !!window.__CHAT_SOCKET_CONNECTED : false,
  );

  useEffect(() => {
    const id = setInterval(() => {
      try { setSocketConnected(!!window.__CHAT_SOCKET_CONNECTED); } catch (e) { setSocketConnected(false); }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const { data: sessions = [] } = useQuery({
    queryKey: ['chat-sessions'],
    queryFn: async () => {
      const res = await api.get<ChatSessionListItem[]>('/chat/sessions');
      return res.success ? res.data : [];
    },
    refetchInterval: socketConnected ? false : 10000,
  });

  const filteredSessions = sessions.filter(s => {
    if (filter === 'waiting') {
      return s.handoffActive;
    }
    return true;
  });

  const waitingCount = sessions.filter(s => s.handoffActive).length;

  const handleSessionSelect = async (session: ChatSessionListItem) => {
    try {
      const res = await api.get<ChatSession>(`/chat/sessions/${session.id}`);
      if (res.success) {
        setSelectedSession(res.data);
        // Mark as read immediately
        try {
          await api.post(`/chat/sessions/${session.id}/read`);
        } catch (err) {
          console.warn('Failed to mark session as read', err);
        }
        // Update local cache so badge disappears
        queryClient.setQueryData(['chat-sessions'], (old: ChatSessionListItem[] | undefined) => {
          if (!old) return old;
          return old.map(s => s.id === session.id ? { ...s, unreadCount: 0 } : s);
        });
      }
    } catch (err) {
      console.error('Erro ao buscar detalhes da sessão:', err);
    }
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
            <button
              onClick={() => setFilter('waiting')}
              className={`flex-1 py-1.5 px-3 text-sm font-medium rounded-lg transition-colors ${
                filter === 'waiting'
                  ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              Aguardando ({waitingCount})
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`flex-1 py-1.5 px-3 text-sm font-medium rounded-lg transition-colors ${
                filter === 'all'
                  ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              Todos
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {filteredSessions.map(s => (
            <div 
              key={s.id} 
              onClick={() => handleSessionSelect(s)}
              className="p-4 border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-white/[0.02] cursor-pointer transition-colors relative"
            >
              {s.handoffActive && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded-r-full" />
              )}
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {s.displayName || s.name || `Cliente ${s.customerPhone}`}
                  </h3>
                  {s.unreadCount && s.unreadCount > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {s.unreadCount}
                    </span>
                  )}
                </div>
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
