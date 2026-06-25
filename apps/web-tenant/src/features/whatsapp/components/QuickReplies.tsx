import { useState } from 'react';
import { Zap, Plus, Edit, Trash2, Save, X } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api-client';

interface QuickReply {
  id: string;
  text: string;
  category?: string;
  isActive: boolean;
  usageCount: number;
}

interface QuickRepliesProps {
  onReplySelect: (reply: string) => void;
  onClose?: () => void;
  className?: string;
}

export function QuickReplies({ onReplySelect, onClose, className = '' }: QuickRepliesProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newReply, setNewReply] = useState('');
  const [editingReply, setEditingReply] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const { data: quickReplies = [], refetch } = useQuery({
    queryKey: ['quick-replies'],
    queryFn: async () => {
      const res = await api.get<QuickReply[]>('/chat/quick-replies');
      return res.success ? res.data : [];
    },
  });

  const createReplyMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await api.post('/chat/quick-replies', { text });
      return res.data;
    },
    onSuccess: () => {
      setNewReply('');
      refetch();
    },
  });

  const updateReplyMutation = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const res = await api.put(`/chat/quick-replies/${id}`, { text });
      return res.data;
    },
    onSuccess: () => {
      setEditingReply(null);
      setEditText('');
      refetch();
    },
  });

  const deleteReplyMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/chat/quick-replies/${id}`);
      return res.data;
    },
    onSuccess: () => {
      refetch();
    },
  });

  const handleCreateReply = () => {
    if (newReply.trim()) {
      createReplyMutation.mutate(newReply.trim());
    }
  };

  const handleEditReply = (reply: QuickReply) => {
    setEditingReply(reply.id);
    setEditText(reply.text);
  };

  const handleUpdateReply = () => {
    if (editingReply && editText.trim()) {
      updateReplyMutation.mutate({ id: editingReply, text: editText.trim() });
    }
  };

  const handleDeleteReply = (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta resposta rápida?')) {
      deleteReplyMutation.mutate(id);
    }
  };

  const groupedReplies = quickReplies.reduce((acc, reply) => {
    const category = reply.category || 'Geral';
    if (!acc[category]) acc[category] = [];
    acc[category].push(reply);
    return acc;
  }, {} as Record<string, QuickReply[]>);

  if (isEditing) {
    return (
      <div className={`bg-card p-4 ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm text-foreground">Gerenciar Respostas Rápidas</h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsEditing(false)}
              className="p-1.5 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground"
              title="Voltar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Nova resposta */}
        <div className="mb-3 flex gap-2">
          <input
            type="text"
            value={newReply}
            onChange={(e) => setNewReply(e.target.value)}
            placeholder="Nova resposta rápida..."
            className="flex-1 px-3 py-1.5 border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-card text-foreground"
            onKeyDown={(e) => e.key === 'Enter' && handleCreateReply()}
          />
          <button
            onClick={handleCreateReply}
            disabled={!newReply.trim() || createReplyMutation.isPending}
            className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Lista de respostas */}
        <div className="space-y-3 max-h-40 overflow-y-auto pr-1">
          {Object.entries(groupedReplies).map(([category, replies]) => (
            <div key={category}>
              <h4 className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1.5">{category}</h4>
              <div className="space-y-1.5">
                {replies.map((reply) => (
                  <div key={reply.id} className="flex items-center gap-2 p-1.5 bg-muted/50 hover:bg-muted rounded-md border border-border/50 group">
                    {editingReply === reply.id ? (
                      <>
                        <input
                          type="text"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="flex-1 px-2 py-1 border border-input rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-card text-foreground"
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdateReply()}
                        />
                        <button
                          onClick={handleUpdateReply}
                          disabled={!editText.trim() || updateReplyMutation.isPending}
                          className="p-1 text-status-success hover:text-status-success/80 transition-colors"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingReply(null)}
                          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm text-foreground pl-1">{reply.text}</span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleEditReply(reply)}
                            className="p-1 text-muted-foreground hover:text-primary transition-colors rounded hover:bg-card"
                            title="Editar"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteReply(reply.id)}
                            disabled={deleteReplyMutation.isPending}
                            className="p-1 text-muted-foreground hover:text-destructive transition-colors rounded hover:bg-card"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-card p-3 ${className}`}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="font-medium text-xs text-foreground uppercase tracking-wider">Respostas Rápidas</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsEditing(true)}
            className="p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
            title="Editar respostas"
          >
            <Edit className="w-3.5 h-3.5" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              title="Fechar painel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
        {quickReplies.map((reply) => (
          <button
            key={reply.id}
            onClick={() => {
              onReplySelect(reply.text);
              if (onClose) onClose();
            }}
            className="px-2.5 py-1.5 bg-muted border border-transparent text-foreground text-xs rounded hover:bg-primary/10 hover:border-primary/20 hover:text-primary transition-colors text-left"
          >
            {reply.text}
          </button>
        ))}
      </div>

      {quickReplies.length === 0 && (
        <div className="flex flex-col items-center justify-center py-3">
          <Zap className="w-6 h-6 text-muted-foreground/50 mb-1" />
          <p className="text-xs text-muted-foreground mb-1">
            Nenhuma configurada.
          </p>
          <button
            onClick={() => setIsEditing(true)}
            className="text-primary hover:text-primary/80 text-xs font-medium"
          >
            Adicionar respostas
          </button>
        </div>
      )}
    </div>
  );
}
