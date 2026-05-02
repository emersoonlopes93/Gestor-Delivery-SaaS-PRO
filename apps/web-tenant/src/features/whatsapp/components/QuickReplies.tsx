import React, { useState } from 'react';
import { MessageCircle, Plus, Edit, Trash2, Save } from 'lucide-react';
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
  className?: string;
}

export function QuickReplies({ onReplySelect, className = '' }: QuickRepliesProps) {
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
      <div className={`bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-4 ${className}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">Respostas Rápidas</h3>
          <button
            onClick={() => setIsEditing(false)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nova resposta */}
        <div className="mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newReply}
              onChange={(e) => setNewReply(e.target.value)}
              placeholder="Nova resposta rápida..."
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
            />
            <button
              onClick={handleCreateReply}
              disabled={!newReply.trim() || createReplyMutation.isPending}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Lista de respostas */}
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {Object.entries(groupedReplies).map(([category, replies]) => (
            <div key={category}>
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{category}</h4>
              {replies.map((reply) => (
                <div key={reply.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  {editingReply === reply.id ? (
                    <>
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white text-sm"
                      />
                      <button
                        onClick={handleUpdateReply}
                        disabled={!editText.trim() || updateReplyMutation.isPending}
                        className="p-1 text-green-600 hover:text-green-700 transition-colors"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingReply(null)}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-gray-900 dark:text-white">{reply.text}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditReply(reply)}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                        >
                          <Edit className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteReply(reply.id)}
                          disabled={deleteReplyMutation.isPending}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 dark:text-white">Respostas Rápidas</h3>
        <button
          onClick={() => setIsEditing(true)}
          className="p-1 text-gray-400 hover:text-primary-600 transition-colors"
          title="Editar respostas"
        >
          <Edit className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {quickReplies.slice(0, 8).map((reply) => (
          <button
            key={reply.id}
            onClick={() => onReplySelect(reply.text)}
            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            {reply.text}
          </button>
        ))}
        {quickReplies.length > 8 && (
          <button
            onClick={() => setIsEditing(true)}
            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            +{quickReplies.length - 8} mais
          </button>
        )}
      </div>

      {quickReplies.length === 0 && (
        <div className="text-center py-4">
          <MessageCircle className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nenhuma resposta rápida configurada
          </p>
          <button
            onClick={() => setIsEditing(true)}
            className="mt-2 text-primary-600 hover:text-primary-700 text-sm font-medium"
          >
            Criar respostas rápidas
          </button>
        </div>
      )}
    </div>
  );
}
