import { useState, useRef, useEffect } from 'react';

import { MessageSquare, Send, Paperclip, Smile, Clock, CheckCircle, Check, Zap } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api-client';
import type { ChatMessage, ChatSession } from '@gestor/types';
import { QuickReplies } from './QuickReplies';



interface ChatAreaProps {
  session: ChatSession | null;
  onBack: () => void;
  onSessionUpdate: (session: ChatSession) => void;
}

export function ChatArea({ session, onBack, onSessionUpdate }: ChatAreaProps) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [socketConnected, setSocketConnected] = useState<boolean>(
    typeof window !== 'undefined' ? !!window.__CHAT_SOCKET_CONNECTED : false,
  );

  useEffect(() => {
    const id = setInterval(() => {
      try {
        setSocketConnected(!!window.__CHAT_SOCKET_CONNECTED);
      } catch (e) {
        setSocketConnected(false);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const { data: sessionMessages = [], refetch: refetchMessages } = useQuery({
    queryKey: ['chat-messages', session?.id],
    queryFn: async () => {
      if (!session) return [];
      const res = await api.get<ChatMessage[]>(`/chat/sessions/${session.id}/messages`);
      return res.success ? res.data : [];
    },
    enabled: !!session,
    refetchInterval: socketConnected ? false : 3000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!session) return null;
      const res = await api.post(`/chat/sessions/${session.id}/messages`, {
        direction: 'outbound',
        content,
        messageType: 'text'
      });
      return res.data;
    },
    onMutate: (content) => {
      console.log(`[CHAT_UI] send_clicked contentPreview=${content.substring(0, 20)}`);
      // Salva o texto para restaurar se falhar
      const previousMessage = message;
      // Limpa o input imediatamente (optimistic UX)
      setMessage('');
      console.log(`[CHAT_UI] input_cleared`);
      // Adiciona mensagem otimista na lista
      const optimisticMsg: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        sessionId: session?.id ?? '',
        direction: 'outbound',
        senderType: 'human',
        content,
        messageType: 'text',
        externalStatus: 'sent',
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMsg]);
      console.log(`[CHAT_UI] optimistic_added id=${optimisticMsg.id}`);
      return { previousMessage };
    },
    onSuccess: (data: any) => {
      console.log(`[CHAT_UI] mutation_success_payload hasId=${!!data?.id} id=${data?.id || ''} sessionId=${data?.sessionId || ''} externalId=${data?.externalId || ''} direction=${data?.direction || ''} senderType=${data?.senderType || ''} fromMe=${data?.direction === 'outbound'} contentPreview=${typeof data?.content === 'string' ? data.content.substring(0, 20) : ''} shape=${data?.id ? 'raw_message' : 'wrapped_object'}`);
      if (!data) return;
      // Substitui a mensagem otimista pela mensagem real do servidor
      setMessages((prev) =>
        prev.map((m) =>
          m.id.startsWith('optimistic-') ? (data as ChatMessage) : m
        ),
      );
      console.log(`[CHAT_UI] optimistic_replaced`);
      // Revalida do servidor para garantir sincronia
      refetchMessages();
    },
    onError: (error: unknown, _content, context) => {
      console.error(`[CHAT_UI] mutation_error message=${error instanceof Error ? error.message : 'unknown'}`);
      // Em caso de erro, restaura o texto no input e remove a mensagem otimista
      if (context?.previousMessage) {
        setMessage(context.previousMessage);
        console.log(`[CHAT_UI] input_restored contentPreview=${context.previousMessage.substring(0, 20)}`);
      }
      setMessages((prev) => prev.filter((m) => !m.id.startsWith('optimistic-')));
    },
  });

  const handoffMutation = useMutation({
    mutationFn: async (reason?: string) => {
      if (!session) return;
      const res = await api.post(`/chat/sessions/${session.id}/handoff`, { reason });
      return res.data;
    },
    onSuccess: (_data, reason) => {
      if (!session) return;
      onSessionUpdate({
        ...session,
        handoffActive: true,
        handoffReason: reason,
        handoffAt: new Date().toISOString(),
      });
      setHandoffReason('');
    },
  });

  const [handoffReason, setHandoffReason] = useState('');

  const handleActivateHandoff = () => {
    if (!session || session.handoffActive) return;
    const reason = handoffReason.trim() || undefined;
    handoffMutation.mutate(reason);
  };

  const closeSessionMutation = useMutation({
    mutationFn: async () => {
      if (!session) return;
      const res = await api.post(`/chat/sessions/${session.id}/close`);
      return res.data;
    },
    onSuccess: () => {
      onBack();
    },
  });

  const deactivateHandoffMutation = useMutation({
    mutationFn: async () => {
      if (!session) return;
      const res = await api.post(`/chat/sessions/${session.id}/handoff/deactivate`);
      return res.data;
    },
    onSuccess: () => {
      if (!session) return;
      onSessionUpdate({
        ...session,
        handoffActive: false,
        handoffOperator: undefined,
      });
    },
  });

  useEffect(() => {
    const marker = sessionMessages.find(m => typeof m.content === 'string' && m.content.includes('TESTE-HISTORICO-OPERADOR-2406-001'));
    const directionsSummary = Array.from(new Set(sessionMessages.map(m => m.direction))).join(',');
    const senderTypesSummary = Array.from(new Set(sessionMessages.map(m => m.senderType))).join(',');
    console.log(`[CHAT_HISTORY_UI] sessionId=${session?.id} count=${sessionMessages.length} containsMarker=${!!marker} markerMessageId=${marker?.id || ''} directionsSummary=${directionsSummary} senderTypesSummary=${senderTypesSummary}`);
    
    setMessages(sessionMessages);
  }, [sessionMessages]);

  useEffect(() => {
    if (session?.id) {
      try {
        window.__CHAT_SOCKET?.emit('joinSession', { sessionId: session.id });
      } catch (e) {
        // Ignora erros se a instância global do socket não estiver disponível
      }
      setIsAtBottom(true);
    }
  }, [session?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const trimmed = message.trim();
    if (trimmed && session) {
      sendMessageMutation.mutate(trimmed);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && session) {
      // TODO: Implementar upload de mídia
      console.log('Arquivo selecionado:', file);
    }
  };

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const distanceToBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    setIsAtBottom(distanceToBottom <= 80);
  };

  useEffect(() => {
    setMessages(sessionMessages);
  }, [sessionMessages]);

  useEffect(() => {
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAtBottom]);

  useEffect(() => {
    setIsAtBottom(true);
  }, [session?.id]);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <Check className="w-4 h-4 text-muted-foreground" />;
      case 'delivered':
        return <CheckCircle className="w-4 h-4 text-status-info" />;
      case 'read':
        return <CheckCircle className="w-4 h-4 text-status-success" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getSenderLabel = (senderType: string) => {
    switch (senderType) {
      case 'customer':
        return 'Cliente';
      case 'ai':
        return 'IA';
      case 'human':
        return 'Humano';
      case 'system':
        return 'Sistema';
      default:
        return '';
    }
  };

  const getSenderColor = (senderType: string) => {
    switch (senderType) {
      case 'customer':
        return 'text-muted-foreground';
      case 'ai':
        return 'text-primary';
      case 'human':
        return 'text-status-info';
      case 'system':
        return 'text-status-warning';
      default:
        return 'text-muted-foreground';
    }
  };

  const handleQuickReply = (reply: string) => {
    setMessage(reply);
  };

  if (!session) {
    return (
      <div className="flex-1 flex flex-col bg-background dark:bg-background items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-muted dark:bg-muted/50 rounded-2xl flex items-center justify-center mb-4 text-muted-foreground dark:text-muted-foreground">
          <MessageSquare className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Selecione uma conversa</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Acompanhe o atendimento do bot em tempo real ou assuma o controle quando o cliente solicitar ajuda humana.
        </p>
      </div>
    );
  }

  const visibleMessages = messages.filter((msg) => {
    const meta = msg.metadata as Record<string, unknown> | undefined;
    if (meta?.hiddenFromInbox === true) return false;
    if (meta?.type === 'tool_call' || meta?.type === 'tool_result') return false;
    return true;
  });
  return (
    <div className="flex-1 flex flex-col bg-card dark:bg-card relative">
      {/* Header */}
      <div className="flex flex-col border-b border-border bg-card z-10 shadow-sm relative">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-1.5 -ml-1.5 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground md:hidden"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            {/* Avatar */}
            <div className="relative shrink-0 w-10 h-10 rounded-full overflow-hidden flex items-center justify-center font-bold text-sm bg-primary text-primary-foreground">
              {(() => {
                const avatarUrl = (session as ChatSession & { customer?: { profilePictureUrl?: string | null } }).customer?.profilePictureUrl || session.profilePictureUrl;
                return avatarUrl ? (
                  <img 
                    src={avatarUrl} 
                    alt={session.displayName || `Cliente ${session.customerPhone}`} 
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : null;
              })()}
              <span>{(session.displayName || `Cliente ${session.customerPhone}`).charAt(0).toUpperCase()}</span>
            </div>

            <div>
              <h3 className="font-semibold text-foreground text-base">
                {session.displayName || `Cliente ${session.customerPhone}`}
              </h3>
              {/* Badge simples de status SE NÃO FOR HANDOFF (pois handoff ganha bloco consolidado abaixo) */}
              {!session.handoffActive && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${
                    session.state === 'closed' || session.state === 'expired'
                      ? 'bg-muted text-muted-foreground border-border'
                      : 'bg-status-success/10 text-status-success border-status-success/20'
                  }`}>
                    {session.state === 'closed'
                      ? 'Encerrado'
                      : session.state === 'expired'
                      ? 'Expirada'
                      : 'Bot Ativo'}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!session.handoffActive && session.state !== 'closed' && session.state !== 'expired' && (
              <>
                <input
                  value={handoffReason}
                  onChange={(e) => setHandoffReason(e.target.value)}
                  placeholder="Motivo (opcional)..."
                  className="hidden sm:block w-40 rounded-md bg-muted/50 text-foreground placeholder:text-muted-foreground border border-input focus:outline-none focus:ring-1 focus:ring-ring px-2.5 py-1.5 text-xs transition-colors focus:bg-card"
                />
                <button
                  onClick={handleActivateHandoff}
                  disabled={handoffMutation.isPending}
                  className="px-3 py-1.5 bg-status-warning/10 text-status-warning border border-status-warning/20 hover:bg-status-warning/20 disabled:opacity-50 disabled:hidden text-xs font-semibold rounded-md transition-colors"
                >
                  Transferir
                </button>
              </>
            )}
            {session.state !== 'closed' && session.state !== 'expired' && (
              <button
                onClick={() => closeSessionMutation.mutate()}
                disabled={closeSessionMutation.isPending}
                className="px-3 py-1.5 bg-muted text-muted-foreground border border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 disabled:opacity-50 text-xs font-semibold rounded-md transition-colors"
              >
                Encerrar
              </button>
            )}
          </div>
        </div>

        {/* Bloco exclusivo de Handoff Consolidado */}
        {session.handoffActive && (
          <div className="bg-status-warning/5 border-t border-status-warning/20 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-inner">
            <div className="flex items-start gap-2">
              <span className="flex h-2 w-2 relative mt-1.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-warning opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-status-warning"></span>
              </span>
              <div className="flex flex-col">
                <p className="text-[13px] font-semibold text-status-warning flex items-center gap-2">
                  Atendimento humano ativo
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  O bot está silenciado e não responderá mensagens automaticamente.
                </p>
                
                {/* Metadados da transferência consolidados */}
                {(session.handoffReason || session.handoffOperator || session.handoffAt) && (
                  <div className="mt-1.5 text-[11px] text-muted-foreground/80 flex flex-wrap gap-x-3 gap-y-1">
                    {session.handoffReason && (
                      <span><strong className="font-medium text-muted-foreground">Motivo:</strong> {session.handoffReason}</span>
                    )}
                    {session.handoffOperator && (
                      <span><strong className="font-medium text-muted-foreground">Operador:</strong> {session.handoffOperator}</span>
                    )}
                    {session.handoffAt && (
                      <span><strong className="font-medium text-muted-foreground">Início:</strong> {new Date(session.handoffAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex gap-2 shrink-0 self-start sm:self-center">
              <button
                onClick={() => deactivateHandoffMutation.mutate()}
                disabled={deactivateHandoffMutation.isPending}
                className="px-3 py-1.5 bg-status-warning text-status-warning-foreground hover:bg-status-warning/90 text-xs font-semibold rounded-md transition-colors shadow-sm"
              >
                {deactivateHandoffMutation.isPending ? 'Reativando...' : 'Reativar IA'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/10"
      >
        {visibleMessages.map((msg) => {
          const isSystem = msg.senderType === 'system';
          const isOutbound = msg.direction === 'outbound';
          
          let bubbleClasses = '';
          if (isSystem) {
            bubbleClasses = 'bg-card text-muted-foreground border border-border shadow-sm mx-auto max-w-[80%]';
          } else if (isOutbound) {
            bubbleClasses = 'bg-primary text-primary-foreground shadow-sm';
          } else {
            bubbleClasses = 'bg-card text-card-foreground border border-border shadow-sm';
          }

          return (
            <div
              key={msg.id}
              className={`flex ${isSystem ? 'justify-center' : isOutbound ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] sm:max-w-md px-3.5 py-2 rounded-2xl ${
                  isSystem ? 'rounded-lg' : isOutbound ? 'rounded-br-sm' : 'rounded-bl-sm'
                } ${bubbleClasses}`}
              >
                {msg.senderType && msg.senderType !== 'customer' && !isSystem && (
                  <p className={`text-[10px] uppercase font-bold mb-0.5 ${
                    isOutbound ? 'text-primary-foreground/90' : getSenderColor(msg.senderType)
                  }`}>
                    {getSenderLabel(msg.senderType)}
                  </p>
                )}
                <p className={`text-[13px] leading-relaxed break-words whitespace-pre-wrap ${isSystem ? 'text-center text-xs' : ''}`}>
                  {msg.content}
                </p>
                {!isSystem && (
                  <div className={`flex items-center gap-1 mt-1 text-[9px] font-medium justify-end ${
                    isOutbound ? 'text-primary-foreground/70' : 'text-muted-foreground/70'
                  }`}>
                    <span>{formatTime(msg.timestamp || msg.createdAt)}</span>
                    {isOutbound && getStatusIcon(msg.externalStatus || 'sent')}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area relative container */}
      <div className="relative">
        {/* Quick Replies Drawer */}
        {showQuickReplies && (
          <div className="absolute bottom-full left-0 w-full px-2 pb-2 z-20">
            <QuickReplies 
              onReplySelect={handleQuickReply} 
              onClose={() => setShowQuickReplies(false)}
              className="rounded-xl border border-border shadow-lg bg-card/95 backdrop-blur-sm"
            />
          </div>
        )}

        {/* Input */}
        <div className="p-3 border-t border-border bg-card">
          <div className="flex items-end gap-1.5 max-w-4xl mx-auto">
            <button
              onClick={handleFileUpload}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
              title="Anexar arquivo"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              accept="image/*,video/*,audio/*,.pdf"
              className="hidden"
            />
            
            <button
              onClick={() => setShowQuickReplies(!showQuickReplies)}
              className={`p-2 rounded-full transition-colors ${
                showQuickReplies 
                  ? 'text-primary bg-primary/10' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              title="Respostas Rápidas"
            >
              <Zap className="w-5 h-5" />
            </button>

            <button
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors hidden sm:block"
              title="Emoji"
            >
              <Smile className="w-5 h-5" />
            </button>

            <div className="flex-1 bg-muted/30 border border-input focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 rounded-2xl transition-all">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={
                  session?.state === 'closed' || session?.state === 'expired' || sendMessageMutation.isPending
                }
                placeholder={
                  session?.state === 'closed' || session?.state === 'expired'
                    ? 'Conversa encerrada'
                    : 'Digite uma mensagem...'
                }
                rows={1}
                className="w-full px-4 py-2.5 bg-transparent resize-none focus:outline-none text-sm text-foreground placeholder:text-muted-foreground disabled:text-muted-foreground disabled:cursor-not-allowed"
                style={{ minHeight: '44px', maxHeight: '120px' }}
              />
            </div>

            <button
              onClick={handleSend}
              disabled={!message.trim() || session?.state === 'closed' || session?.state === 'expired' || sendMessageMutation.isPending}
              className="p-2.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 shadow-sm"
            >
              {sendMessageMutation.isPending ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
