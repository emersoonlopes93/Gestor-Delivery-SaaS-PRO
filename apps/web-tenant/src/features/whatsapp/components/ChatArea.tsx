import { useState, useRef, useEffect } from 'react';

import { MessageSquare, Send, Paperclip, Smile, Clock, CheckCircle, Check } from 'lucide-react';
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
      if (!session) return;
      const res = await api.post(`/chat/sessions/${session.id}/messages`, {
        direction: 'outbound',
        content,
        messageType: 'text'
      });
      return res.data;
    },
    onSuccess: () => {
      setMessage('');
      refetchMessages();
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
    setMessages(sessionMessages);
  }, [sessionMessages]);

  useEffect(() => {
    if (session?.id) {
      try {
        window.__CHAT_SOCKET?.emit('joinSession', { sessionId: session.id });
      } catch (e) {}
      setIsAtBottom(true);
    }
  }, [session?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (message.trim() && session) {
      sendMessageMutation.mutate(message.trim());
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
        return <Check className="w-4 h-4 text-gray-400" />;
      case 'delivered':
        return <CheckCircle className="w-4 h-4 text-blue-500" />;
      case 'read':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
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
        return 'text-gray-600 dark:text-gray-400';
      case 'ai':
        return 'text-purple-600 dark:text-purple-400';
      case 'human':
        return 'text-blue-600 dark:text-blue-400';
      case 'system':
        return 'text-orange-600 dark:text-orange-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const handleQuickReply = (reply: string) => {
    setMessage(reply);
  };

  if (!session) {
    return (
      <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-950 items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-gray-200 dark:bg-gray-800/50 rounded-2xl flex items-center justify-center mb-4 text-gray-400 dark:text-gray-500">
          <MessageSquare className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Selecione uma conversa</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
          Acompanhe o atendimento do bot em tempo real ou assuma o controle quando o cliente solicitar ajuda humana.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {session.displayName || `Cliente ${session.customerPhone}`}
            </h3>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                session.state === 'closed' 
                  ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                  : session.handoffActive
                  ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
                  : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
              }`}>
                {session.state === 'closed' ? 'Encerrado' : session.handoffActive ? 'Atendimento Humano' : 'Bot Ativo'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleActivateHandoff}
            disabled={handoffMutation.isPending || session.handoffActive}
            className="px-3 py-1.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 text-sm font-medium rounded-lg hover:bg-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {session.handoffActive ? 'Já em atendimento' : 'Transferir'}
          </button>
          {!session.handoffActive && (
            <input
              value={handoffReason}
              onChange={(e) => setHandoffReason(e.target.value)}
              placeholder="Motivo da transferência (opcional)"
              className="ml-3 flex-1 min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm outline-none transition-colors focus:border-orange-400 focus:ring-2 focus:ring-orange-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-orange-400 dark:focus:ring-orange-500/20"
            />
          )}
          <button
            onClick={() => closeSessionMutation.mutate()}
            disabled={closeSessionMutation.isPending}
            className="px-3 py-1.5 bg-red-500/10 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Encerrar
          </button>
        </div>
      </div>

      {session.handoffActive && (
        <div className="bg-red-50 dark:bg-red-950/20 border-b border-red-100 dark:border-red-900/30 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-in slide-in-from-top">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            <p className="text-xs font-medium text-red-800 dark:text-red-300">
              Atendimento humano ativo. O Agente IA está silenciado para esta conversa.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => deactivateHandoffMutation.mutate()}
              disabled={deactivateHandoffMutation.isPending}
              className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {deactivateHandoffMutation.isPending ? 'Reativando...' : 'Reativar IA'}
            </button>
            <button
              onClick={() => closeSessionMutation.mutate()}
              disabled={closeSessionMutation.isPending}
              className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded-lg transition-colors"
            >
              Encerrar atendimento humano
            </button>
          </div>
        </div>
      )}

      {session.handoffActive && (session.handoffReason || session.handoffOperator || session.handoffAt) && (
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-sm text-gray-700 dark:text-gray-300 space-y-1">
          {session.handoffReason && (
            <p>
              <span className="font-semibold">Motivo:</span> {session.handoffReason}
            </p>
          )}
          {session.handoffOperator && (
            <p>
              <span className="font-semibold">Operador:</span> {session.handoffOperator}
            </p>
          )}
          {session.handoffAt && (
            <p>
              <span className="font-semibold">Iniciado em:</span>{' '}
              {new Date(session.handoffAt).toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </p>
          )}
        </div>
      )}

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                msg.direction === 'outbound'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
              }`}
            >
              {msg.senderType && msg.senderType !== 'customer' && (
                <p className={`text-[10px] uppercase font-semibold mb-1 ${getSenderColor(msg.senderType)}`}>
                  {getSenderLabel(msg.senderType)}
                </p>
              )}
              <p className="text-sm">{msg.content}</p>
              <div className={`flex items-center gap-2 mt-1 text-xs ${
                msg.direction === 'outbound' ? 'text-primary-200' : 'text-gray-500'
              }`}>
                {getStatusIcon(msg.externalStatus || 'sent')}
                <span>{formatTime(msg.timestamp || msg.createdAt)}</span>
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies */}
      <QuickReplies onReplySelect={handleQuickReply} />

      {/* Input */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-end gap-2">
          <button
            onClick={handleFileUpload}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
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
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <Smile className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={session?.state === 'closed' || sendMessageMutation.isPending}
              placeholder={session?.state === 'closed' ? 'Conversa encerrada' : 'Digite uma mensagem...'}
              rows={1}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ minHeight: '40px', maxHeight: '120px' }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!message.trim() || session?.state === 'closed' || sendMessageMutation.isPending}
            className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sendMessageMutation.isPending ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
