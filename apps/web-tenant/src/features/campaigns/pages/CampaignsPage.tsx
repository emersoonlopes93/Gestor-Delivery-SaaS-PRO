import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Plus, Users, Send, PauseCircle, Play, Square } from 'lucide-react';
import { api } from '../../../lib/api-client';
import type { Campaign } from '@gestor/types';
import { CreateCampaignModal } from '../components/CreateCampaignModal';
import { 
  PageHeader, 
  Button, 
  Card, 
  StatusBadge, 
  EmptyState,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell
} from '@gestor/ui';


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
      <PageHeader
        title="Campanhas Ativas"
        description="Envie mensagens em massa segmentadas para sua base de clientes."
        icon={Megaphone}
        action={
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="w-4 h-4" />
            Nova Campanha
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
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
        </Card>
        <Card>
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
        </Card>
        <Card>
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
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progresso</TableHead>
                <TableHead>Data Criação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
          <TableBody>
            {campaigns.map(c => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-foreground">{c.name}</span>
                    {c.type === 'whatsapp_status' && (
                      <span className="text-xs text-primary-600 bg-primary-50 dark:bg-primary-900/20 px-2 py-0.5 rounded w-max">Status do WhatsApp</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge
                    status={
                      c.status === 'running' ? 'success' : 
                      c.status === 'paused' ? 'warning' :
                      c.status === 'completed' ? 'info' :
                      c.status === 'cancelled' ? 'error' :
                      'neutral'
                    }
                  >
                    {c.status === 'running' ? 'Em execução' : 
                     c.status === 'paused' ? 'Pausada' :
                     c.status === 'completed' ? 'Concluída' :
                     c.status === 'cancelled' ? 'Cancelada' :
                     'Rascunho'}
                  </StatusBadge>
                </TableCell>
                <TableCell>
                  {c.type === 'whatsapp_status' ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-foreground">
                        {c.status === 'completed' ? 'Publicado' : c.status === 'cancelled' ? 'Falhou' : 'Aguardando'}
                      </span>
                      <span className="text-xs text-muted-foreground mt-1">Disparo único de status</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-full" 
                            style={{ width: `${c.totalAudience > 0 ? (c.totalSent / c.totalAudience) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-foreground">{c.totalSent}/{c.totalAudience}</span>
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                        <span title="Entregues" className="text-status-success">{c.totalDelivered} entregues</span>
                        <span title="Falhas" className="text-status-error">{(c as any)._count?.dispatches || 0} falhas</span>
                        <span title="Opt-outs" className="text-status-warning">{c.totalOptOut} saíram</span>
                      </div>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(c.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                <TableCell className="text-right">
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {campaigns.length === 0 && !isLoading && (
          <EmptyState
            icon={Megaphone}
            title="Nenhuma campanha encontrada"
            description="Crie sua primeira campanha para começar a enviar mensagens em massa."
          />
        )}
        </Card>
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
