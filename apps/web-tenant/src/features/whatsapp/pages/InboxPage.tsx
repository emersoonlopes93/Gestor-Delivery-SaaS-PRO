import { useState, useEffect, useRef, useCallback } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api-client';
import type { ChatSessionListItem, ChatSession, ChatInboxStats, PaginatedChatSessions } from '@gestor/types';
import { ChatArea } from '../components/ChatArea';
import { useChatSocket } from '../hooks/useChatSocket';
import { useTenantAuth } from '../../../hooks/use-tenant-auth';
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
      try {
        const res = await api.get<ChatInboxStats>('/chat/stats');
        return res.success ? res.data : null;
      } catch (error) {
        return null; // Fallback se a rota não existir no backend ainda (404)
      }
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

      const res = await api.get<PaginatedChatSessions | ChatSessionListItem[]>(`/chat/sessions?${params.toString()}`);
      if (!res.success) throw new Error('Failed to fetch');
      
      // Fallback para caso o backend retorne o formato antigo (array)
      if (Array.isArray(res.data)) {
        return { data: res.data, meta: { page: 1, limit: 50, total: res.data.length, totalPages: 1 } };
      }
      
      return res.data;
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage || !lastPage.meta) return undefined;
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
      <div className={`w-full md:w-80 lg:w-96 border-r border-border bg-card/50 flex flex-col ${selectedSession ? 'hidden md:flex' : 'flex'}`}>
        {/* Header e Filtros */}
        <div className="p-4 border-b border-border bg-card flex flex-col gap-3 z-10 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold text-foreground tracking-tight">Inbox</h2>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${socketConnected ? 'bg-status-success animate-pulse' : 'bg-muted'}`} title={socketConnected ? 'Online' : 'Offline'} />
            </div>
          </div>

          {/* Stats Bar */}
          <div className="flex gap-2 text-center text-xs overflow-x-auto pb-1 scrollbar-none">
            <div className="flex-1 bg-muted/50 rounded-md py-1.5 px-2 border border-border flex flex-col items-center justify-center min-w-[60px]">
              <span className="font-bold text-foreground leading-none mb-0.5">{stats?.unread || 0}</span>
              <span className="text-muted-foreground text-[9px] uppercase tracking-wider">Ñ Lidas</span>
            </div>
            <div className="flex-1 bg-destructive/5 rounded-md py-1.5 px-2 border border-destructive/10 flex flex-col items-center justify-center min-w-[60px]">
              <span className="font-bold text-destructive leading-none mb-0.5">{stats?.human || 0}</span>
              <span className="text-muted-foreground text-[9px] uppercase tracking-wider">Espera</span>
            </div>
            <div className="flex-1 bg-primary/5 rounded-md py-1.5 px-2 border border-primary/10 flex flex-col items-center justify-center min-w-[60px]">
              <span className="font-bold text-primary leading-none mb-0.5">{stats?.ai || 0}</span>
              <span className="text-muted-foreground text-[9px] uppercase tracking-wider">Bot</span>
            </div>
            <div className="flex-1 bg-muted/50 rounded-md py-1.5 px-2 border border-border flex flex-col items-center justify-center min-w-[60px]">
              <span className="font-bold text-foreground leading-none mb-0.5">{stats?.closedToday || 0}</span>
              <span className="text-muted-foreground text-[9px] uppercase tracking-wider">Fechados</span>
            </div>
          </div>

          {/* Barra de Busca */}
          <div className="relative mt-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Buscar contato..." 
              className="w-full pl-8 pr-3 py-1.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Filtros Operacionais */}
          <div className="flex gap-2">
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "closed" | "human" | "waiting" | "all" | "ai_active")}
              className="flex-1 bg-background border border-input rounded-md text-[11px] py-1 px-1.5 focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground cursor-pointer"
            >
              <option value="all">Status: Todos</option>
              <option value="waiting">Aguardando Humano</option>
              <option value="ai_active">IA Ativa</option>
              <option value="closed">Encerrados</option>
            </select>
            
            <select 
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as "all" | "today" | "yesterday" | "7days")}
              className="flex-1 bg-background border border-input rounded-md text-[11px] py-1 px-1.5 focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground cursor-pointer"
            >
              <option value="all">Tempo: Todos</option>
              <option value="today">Hoje</option>
              <option value="yesterday">Ontem</option>
              <option value="7days">Últ. 7 dias</option>
            </select>
          </div>
        </div>
        
        {/* Lista de Sessões */}
        <div className="flex-1 overflow-y-auto bg-muted/10">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="animate-spin text-muted-foreground h-5 w-5" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground">
              <div className="bg-muted p-3 rounded-full mb-3">
                <UserCircle size={32} className="opacity-50" />
              </div>
              <p className="text-sm font-medium">Nenhuma conversa encontrada</p>
              <p className="text-xs mt-1 opacity-70">Tente ajustar seus filtros.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {sessions.map((s, i) => {
                const isActive = selectedSession?.customerPhone === s.customerPhone; // Usando phone como âncora agora
                const isLast = i === sessions.length - 1;
                const displayName = s.displayName || s.name || `Cliente ${s.customerPhone}`;
                const initial = displayName.charAt(0).toUpperCase();
                
                return (
                  <div 
                    key={s.id} 
                    ref={isLast ? lastSessionElementRef : null}
                    onClick={() => handleSessionSelect(s)}
                    className={`p-3.5 cursor-pointer transition-all relative group ${
                      isActive
                        ? 'bg-primary/[0.08] border-l-2 border-l-primary'
                        : 'bg-card hover:bg-muted/50 border-l-2 border-l-transparent'
                    }`}
                  >
                    {s.handoffActive && !isActive && (
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-status-warning" />
                    )}
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className={`relative shrink-0 w-10 h-10 rounded-full overflow-hidden flex items-center justify-center font-bold text-sm ${
                        isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}>
                        {s.profilePictureUrl && (
                          <img 
                            src={s.profilePictureUrl} 
                            alt={displayName} 
                            className="absolute inset-0 w-full h-full object-cover"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        )}
                        <span>{initial}</span>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-1 gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <h3 className={`text-[13px] truncate ${isActive ? 'font-bold text-foreground' : 'font-semibold text-foreground/90'}`}>
                              {displayName}
                            </h3>
                            {s.unreadCount && s.unreadCount > 0 ? (
                              <span className="bg-destructive text-destructive-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm shrink-0 leading-none">
                                {s.unreadCount}
                              </span>
                            ) : null}
                          </div>
                          <span className={`text-[10px] whitespace-nowrap shrink-0 ${isActive ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                            {s.time || new Date(s.lastMessageAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className={`text-[12px] truncate mb-2 ${s.unreadCount && s.unreadCount > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                          {s.lastMessage || 'Sem mensagens'}
                        </p>
                        <div className="flex items-center gap-1.5">
                          {renderBadge(s)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {isFetchingNextPage && (
                <div className="p-4 flex justify-center">
                  <Loader2 className="animate-spin text-muted-foreground h-4 w-4" />
                </div>
              )}
            </div>
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
