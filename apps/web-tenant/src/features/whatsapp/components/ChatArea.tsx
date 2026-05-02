import React, { useState, useRef, useEffect } from 'react';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: sessionMessages = [], refetch: refetchMessages } = useQuery({
    queryKey: ['chat-messages', session?.id],
    queryFn: async () => {
      if (!session) return [];
      const res = await api.get<ChatMessage[]>(`/chat/sessions/${session.id}/messages`);
      return res.success ? res.data : [];
    },
    enabled: !!session,
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
    },
  });

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

  useEffect(() => {
    if (sessionMessages.length > 0) {
      setMessages(sessionMessages);
    }
  }, [sessionMessages]);

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
              {`Cliente ${session.customerPhone}`}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {session.handoffActive ? 'Atendimento Humano' : 'Bot Ativo'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handoffMutation.mutate(undefined)}
            disabled={handoffMutation.isPending || session.handoffActive}
            className="px-3 py-1.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 text-sm font-medium rounded-lg hover:bg-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {session.handoffActive ? 'Já em atendimento' : 'Transferir'}
          </button>
          <button
            onClick={() => closeSessionMutation.mutate()}
            disabled={closeSessionMutation.isPending}
            className="px-3 py-1.5 bg-red-500/10 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Encerrar
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
              <p className="text-sm">{msg.content}</p>
              <div className={`flex items-center gap-2 mt-1 text-xs ${
                msg.direction === 'outbound' ? 'text-primary-200' : 'text-gray-500'
              }`}>
                {getStatusIcon(msg.messageType)}
                <span>{formatTime(msg.createdAt)}</span>
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
              placeholder="Digite uma mensagem..."
              rows={1}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
              style={{ minHeight: '40px', maxHeight: '120px' }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!message.trim() || sendMessageMutation.isPending}
            className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
