import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Plus, Users, Send, PauseCircle, Play, Square } from 'lucide-react';
import { api } from '../../../lib/api-client';
import type { Campaign } from '@gestor/types';
import { CreateCampaignModal } from '../components/CreateCampaignModal';

export function CampaignsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const res = await api.get<Campaign[]>('/campaigns');
      return res.success ? res.data : [];
    },
  });

  const startMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/campaigns/${id}/start`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  const pauseMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/campaigns/${id}/pause`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/campaigns/${id}/cancel`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">Campanhas Ativas</h1>
          <p className="text-muted-foreground">Envie mensagens em massa segmentadas para sua base de clientes.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" />
          Nova Campanha
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card-premium p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-primary/10 rounded-xl text-primary">
              <Megaphone className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Campanhas Ativas</p>
              <h3 className="text-2xl font-bold text-foreground">
                {campaigns.filter(c => c.status === 'running').length}
              </h3>
            </div>
          </div>
        </div>
        <div className="card-premium p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-status-success/10 rounded-xl text-status-success">
              <Send className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Mensagens Enviadas</p>
              <h3 className="text-2xl font-bold text-foreground">
                {campaigns.reduce((sum, c) => sum + c.totalSent, 0)}
              </h3>
            </div>
          </div>
        </div>
        <div className="card-premium p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-accent/10 rounded-xl text-accent-foreground">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Audiência Atingida</p>
              <h3 className="text-2xl font-bold text-foreground">
                {campaigns.length > 0
                  ? Math.round(
                      (campaigns.reduce((sum, c) => sum + c.totalDelivered, 0) /
                        campaigns.reduce((sum, c) => sum + c.totalAudience, 0)) *
                        100
                    )
                  : 0}%
              </h3>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="card-premium overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="py-4 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Campanha</th>
                <th className="py-4 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="py-4 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Progresso</th>
                <th className="py-4 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data Criação</th>
                <th className="py-4 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
          <tbody className="divide-y divide-border">
            {campaigns.map(c => (
              <tr key={c.id} className="hover:bg-muted/50 transition-colors">
                <td className="py-4 px-6">
                  <span className="font-medium text-foreground">{c.name}</span>
                </td>
                <td className="py-4 px-6">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    c.status === 'running' ? 'bg-status-success/10 text-status-success' : 
                    c.status === 'paused' ? 'bg-status-warning/10 text-status-warning' :
                    c.status === 'completed' ? 'bg-primary/10 text-primary' :
                    c.status === 'cancelled' ? 'bg-destructive/10 text-destructive' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {c.status === 'running' ? 'Em execução' :
                     c.status === 'paused' ? 'Pausada' :
                     c.status === 'completed' ? 'Concluída' :
                     c.status === 'cancelled' ? 'Cancelada' :
                     'Rascunho'}
                  </span>
                </td>
                <td className="py-4 px-6">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full" 
                        style={{ width: `${c.totalAudience > 0 ? (c.totalSent / c.totalAudience) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground">{c.totalSent}/{c.totalAudience}</span>
                  </div>
                </td>
                <td className="py-4 px-6 text-sm text-muted-foreground">{new Date(c.createdAt).toLocaleDateString('pt-BR')}</td>
                <td className="py-4 px-6 text-right">
                  <div className="flex justify-end gap-2">
                    {c.status === 'running' && (
                      <button 
                        onClick={() => pauseMutation.mutate(c.id)}
                        disabled={pauseMutation.isPending}
                        className="p-2 text-muted-foreground hover:text-status-warning transition-colors" 
                        title="Pausar"
                      >
                        <PauseCircle className="w-5 h-5" />
                      </button>
                    )}
                    {(c.status === 'draft' || c.status === 'paused') && (
                      <button 
                        onClick={() => startMutation.mutate(c.id)}
                        disabled={startMutation.isPending}
                        className="p-2 text-muted-foreground hover:text-status-success transition-colors" 
                        title="Iniciar"
                      >
                        <Play className="w-5 h-5" />
                      </button>
                    )}
                    {(c.status === 'draft' || c.status === 'paused' || c.status === 'running') && (
                      <button 
                        onClick={() => cancelMutation.mutate(c.id)}
                        disabled={cancelMutation.isPending}
                        className="p-2 text-muted-foreground hover:text-destructive transition-colors" 
                        title="Cancelar"
                      >
                        <Square className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {campaigns.length === 0 && !isLoading && (
          <div className="p-16 text-center text-muted-foreground">
            <Megaphone className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">Nenhuma campanha encontrada</p>
            <p className="text-sm">Crie sua primeira campanha para começar a enviar mensagens em massa.</p>
          </div>
        )}
        </div>
      )}

      {/* Modal de Criação de Campanha */}
      <CreateCampaignModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['campaigns'] })}
      />
    </div>
  );
}
