import { useState, useEffect, useRef, useCallback } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api-client';
import type { ChatSessionListItem, ChatSession, ChatInboxStats, PaginatedChatSessions } from '@gestor/types';
import { ChatArea } from '../components/ChatArea';
import { useChatSocket } from '../hooks/useChatSocket';
import { useTenantAuth } from '../../../hooks/use-tenant-auth';
import { useHandoffNotification } from '../hooks/useHandoffNotification';
import { Search, Loader2, Bot, UserCircle, AlertCircle, CheckCircle } from 'lucide-react';

export function InboxPage() {
  const queryClient = useQueryClient();
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'waiting' | 'ai_active' | 'human' | 'closed'>('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | 'yesterday' | '7days'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
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

  // Fetch Stats
  const { data: stats } = useQuery({
    queryKey: ['chat-stats'],
    queryFn: async () => {
      const res = await api.get<ChatInboxStats>('/chat/stats');
      return res.success ? res.data : null;
    },
    refetchInterval: socketConnected ? false : 15000,
  });

  // Fetch Paginated Sessions
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['chat-sessions', statusFilter, periodFilter, searchQuery],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams({
        page: pageParam.toString(),
        limit: '20',
      });
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (periodFilter !== 'all') params.append('period', periodFilter);
      if (searchQuery) params.append('search', searchQuery);

      const res = await api.get<PaginatedChatSessions>(`/chat/sessions?${params.toString()}`);
      if (!res.success) throw new Error('Failed to fetch');
      return res.data;
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.page < lastPage.meta.totalPages) {
        return lastPage.meta.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    refetchInterval: socketConnected ? false : 10000,
  });

  const sessions = data?.pages.flatMap(page => page.data) || [];

  // Intersection Observer for Infinite Scroll
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastSessionElementRef = useCallback((node: HTMLDivElement | null) => {
    if (isFetchingNextPage) return;
    if (observerRef.current) observerRef.current.disconnect();
    
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasNextPage) {
        fetchNextPage();
      }
    });
    
    if (node) observerRef.current.observe(node);
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);

  const handleSessionSelect = async (session: ChatSessionListItem) => {
    try {
      const res = await api.get<ChatSession>(`/chat/sessions/${session.id}`);
      if (res.success) {
        setSelectedSession(res.data);
        // Mark as read immediately if there's unread
        if (session.unreadCount && session.unreadCount > 0) {
          try {
            await api.post(`/chat/sessions/${session.id}/read`);
          } catch (err) {
            console.warn('Failed to mark session as read', err);
          }
          // Decrement local stats
          queryClient.setQueryData(['chat-stats'], (old: ChatInboxStats | undefined) => {
            if (!old) return old;
            return { ...old, unread: Math.max(0, old.unread - 1) };
          });
        }
      }
    } catch (err) {
      console.error('Erro ao buscar detalhes da sessão:', err);
    }
  };

  const handleSessionUpdate = (updatedSession: ChatSession) => {
    setSelectedSession(updatedSession);
    // As the session was updated, the WebSocket will trigger an invalidation,
    // which will refetch the current pages via React Query automatically.
  };

  const handleBack = () => {
    setSelectedSession(null);
  };

  const renderBadge = (session: ChatSessionListItem) => {
    if (session.state === 'closed' || session.state === 'expired') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
          <CheckCircle size={10} /> ENCERRADO
        </span>
      );
    }
    if (session.handoffActive) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]">
          <AlertCircle size={10} /> HANDOFF
        </span>
      );
    }
    if (session.aiAttentionRequired) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20">
          <AlertCircle size={10} /> IA PAUSADA
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
        <Bot size={10} /> BOT ATIVO
      </span>
    );
  };

  return (
    <div className="h-[calc(100vh-theme(spacing.16))] flex flex-col md:flex-row bg-background dark:bg-background overflow-hidden">
      {/* Sidebar de conversas */}
      <div className={`w-full md:w-96 border-r border-border bg-card dark:bg-card flex flex-col ${selectedSession ? 'hidden md:flex' : 'flex'}`}>
        {/* Header e Filtros */}
        <div className="p-4 border-b border-border flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground">Inbox</h2>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${socketConnected ? 'bg-status-success animate-pulse' : 'bg-muted'}`} title={socketConnected ? 'Online' : 'Offline'} />
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="bg-muted/50 rounded-lg p-2 border border-border">
              <span className="block font-bold text-foreground text-sm">{stats?.unread || 0}</span>
              <span className="text-muted-foreground">Ñ Lidas</span>
            </div>
            <div className="bg-destructive/5 rounded-lg p-2 border border-destructive/10">
              <span className="block font-bold text-destructive text-sm">{stats?.human || 0}</span>
              <span className="text-muted-foreground text-[10px]">Espera</span>
            </div>
            <div className="bg-primary/5 rounded-lg p-2 border border-primary/10">
              <span className="block font-bold text-primary text-sm">{stats?.ai || 0}</span>
              <span className="text-muted-foreground">Bot</span>
            </div>
            <div className="bg-muted/50 rounded-lg p-2 border border-border">
              <span className="block font-bold text-foreground text-sm">{stats?.closedToday || 0}</span>
              <span className="text-muted-foreground text-[10px]">Fechados</span>
            </div>
          </div>

          {/* Barra de Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Buscar por nome ou número..." 
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Filtros Operacionais */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-background border border-border rounded-lg text-xs py-1.5 px-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="all">Todos Status</option>
              <option value="waiting">Aguardando Humano</option>
              <option value="ai_active">IA Ativa</option>
              <option value="closed">Encerrados</option>
            </select>
            
            <select 
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as any)}
              className="bg-background border border-border rounded-lg text-xs py-1.5 px-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="all">Todo Período</option>
              <option value="today">Hoje</option>
              <option value="yesterday">Ontem</option>
              <option value="7days">Últimos 7 dias</option>
            </select>
          </div>
        </div>
        
        {/* Lista de Sessões */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="animate-spin text-muted-foreground h-6 w-6" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground">
              <UserCircle size={48} className="mb-4 opacity-20" />
              <p>Nenhuma conversa encontrada</p>
              <p className="text-xs mt-1">Tente ajustar seus filtros.</p>
            </div>
          ) : (
            <>
              {sessions.map((s, i) => {
                const isActive = selectedSession?.customerPhone === s.customerPhone; // Usando phone como âncora agora
                const isLast = i === sessions.length - 1;
                
                return (
                  <div 
                    key={s.id} 
                    ref={isLast ? lastSessionElementRef : null}
                    onClick={() => handleSessionSelect(s)}
                    className={`p-4 border-b cursor-pointer transition-colors relative group ${
                      isActive
                        ? 'bg-primary/5 text-foreground border-primary/20'
                        : 'bg-card text-card-foreground hover:bg-muted/40 border-border'
                    }`}
                  >
                    {s.handoffActive && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-destructive" />
                    )}
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1">
                          {s.displayName || s.name || `Cliente ${s.customerPhone}`}
                        </h3>
                        {s.unreadCount && s.unreadCount > 0 ? (
                          <span className="bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                            {s.unreadCount}
                          </span>
                        ) : null}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {s.time || new Date(s.lastMessageAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mb-3">{s.lastMessage || 'Sem mensagens'}</p>
                    <div className="flex items-center gap-2">
                      {renderBadge(s)}
                    </div>
                  </div>
                );
              })}
              
              {isFetchingNextPage && (
                <div className="p-4 flex justify-center">
                  <Loader2 className="animate-spin text-muted-foreground h-5 w-5" />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Área de chat funcional */}
      <div className={`flex-1 ${!selectedSession ? 'hidden md:flex' : 'flex'}`}>
        <ChatArea
          session={selectedSession}
          onBack={handleBack}
          onSessionUpdate={handleSessionUpdate}
        />
      </div>
    </div>
  );
}
