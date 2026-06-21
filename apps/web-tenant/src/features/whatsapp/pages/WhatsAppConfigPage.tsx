import { useState, useEffect } from 'react';
import { Bot, Smartphone, Settings, RefreshCw, QrCode as QrIcon, Bell, Info } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '@/lib/api-client';
import { toast } from 'react-hot-toast';
import type { TenantSettings } from '@gestor/types';

interface WhatsAppInstance {
  id: string;
  status: string;
  instanceName: string;
  phoneNumber?: string;
  apiUrl?: string;
  apiKey?: string;
}

interface HandoffSessionListItem {
  id: string;
  handoffActive: boolean;
}

interface AiAgentConfig {
  isEnabled: boolean;
  agentName: string;
  greetingMessage: string;
  tone: string;
  customInstructions: string;
  simulateTyping: boolean;
  debounceMs: number;
  humanInterventionEnabled: boolean;
  humanInterventionMinutes: number;
  resumeAutomatically: boolean;
}

interface WhatsAppStatusResponse {
  status: string;
  qrCode?: string;
  pairingCode?: string;
  phoneNumber?: string | null;
}

function formatWhatsAppPhoneNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const beforeAt = raw.includes('@') ? raw.split('@')[0] : raw;
  const digits = beforeAt.replace(/\D/g, '');
  return digits || null;
}

function formatConnectedLabel(value: string | null | undefined): string | null {
  const normalized = formatWhatsAppPhoneNumber(value);
  if (!normalized) return null;
  if (normalized.length <= 5) return normalized;
  return `${normalized.slice(0, 5)}...`;
}



export function WhatsAppConfigPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [qrCode, setQrCode] = useState<string | null>(null);
  
  // Feature Flags de variáveis de ambiente
  const featureWhatsappConnect = import.meta.env.VITE_FEATURE_WHATSAPP_CONNECT !== 'false';
  const featureOrderNotifications = import.meta.env.VITE_FEATURE_ORDER_NOTIFICATIONS !== 'false';

  // Fetch Instance Data
  const { data: instance, isLoading: loadingInstance } = useQuery({
    queryKey: ['whatsapp-instance'],
    queryFn: async () => {
      const res = await api.get<WhatsAppInstance>('/whatsapp/instance');
      return res.data;
    },
    enabled: featureWhatsappConnect,
  });

  // Fetch Tenant Settings (for WhatsApp notification triggers)
  const { data: tenantSettings, isLoading: loadingSettings } = useQuery<TenantSettings | null>({
    queryKey: ['tenant-settings'],
    queryFn: async () => {
      const res = await api.get<{ settings?: TenantSettings }>('/tenant/me');
      return res.success && res.data?.settings ? res.data.settings : null;
    },
    enabled: featureOrderNotifications,
  });

  // Fetch AI Config: o backend valida o entitlement e retorna 403 quando a loja não tem acesso.
  const { data: aiConfig, isLoading: loadingAi, error: aiError } = useQuery({
    queryKey: ['ai-agent-config'],
    queryFn: async () => {
      const res = await api.get<AiAgentConfig>('/ai-agent/config');
      return res.data;
    },
    retry: false,
  });

  // Fetch Chat Sessions to check for active handoffs
  const { data: chatSessions = [] } = useQuery<HandoffSessionListItem[]>({
    queryKey: ['chat-sessions'],
    queryFn: async () => {
      try {
        const res = await api.get<HandoffSessionListItem[]>('/chat/sessions');
        return res.success ? res.data : [];
      } catch {
        return [];
      }
    },
  });

  const hasHandoffActive = Array.isArray(chatSessions) && chatSessions.some((s) => s.handoffActive);

  // States for Notifications
  const [whatsappNotificationsEnabled, setWhatsappNotificationsEnabled] = useState(false);

  useEffect(() => {
    if (tenantSettings) {
      setWhatsappNotificationsEnabled(tenantSettings.whatsappNotificationsEnabled || false);
    }
  }, [tenantSettings]);

  // Fetch Status/QR
  const fetchStatus = async () => {
    const res = await api.get<WhatsAppStatusResponse>('/whatsapp/instance/status');
    console.log('[Frontend] Status response:', res.data);
    
    // Se conectou ou desconectou, limpar QR code
    if (res.data.status === 'connected' || res.data.status === 'disconnected') {
      setQrCode(null);
    } else if (res.data.qrCode) {
      setQrCode(res.data.qrCode);
    }
    
    return res.data;
  };

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: fetchStatus,
    enabled: !!instance && featureWhatsappConnect,
    refetchInterval: (query) => {
      const currentStatus = query.state.data?.status;
      if (currentStatus === 'qr_pending') return 1500;
      if (currentStatus === 'connecting' || currentStatus === 'disconnected') return 2000;
      return 8000;
    },
  });

  const refreshQrCode = async () => {
    try {
      const res = await api.get<{ qrCode: string | null }>('/whatsapp/instance/qr-code');
      if (res.data?.qrCode) {
        setQrCode(res.data.qrCode);
      } else {
        toast.error('QR Code ainda não está disponível. Tente novamente em alguns segundos.');
      }
    } catch {
      toast.error('Erro ao atualizar QR Code.');
    } finally {
      refetchStatus();
    }
  };

  // Mutations
  const updateAiMutation = useMutation({
    mutationFn: async (data: Partial<AiAgentConfig>) => {
      const cleanData = {
        isEnabled: data.isEnabled,
        agentName: data.agentName,
        greetingMessage: data.greetingMessage,
        tone: data.tone,
        customInstructions: data.customInstructions,
        simulateTyping: data.simulateTyping,
        debounceMs: data.debounceMs,
        humanInterventionEnabled: data.humanInterventionEnabled,
        humanInterventionMinutes: data.humanInterventionMinutes,
        resumeAutomatically: data.resumeAutomatically,
      };
      await api.patch('/ai-agent/config', cleanData);
    },
    onSuccess: () => {
      toast.success('Configurações do Agente IA salvas!');
      queryClient.invalidateQueries({ queryKey: ['ai-agent-config'] });
    },
    onError: () => {
      toast.error('Erro ao salvar configurações do Agente IA.');
    }
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      await api.patch('/tenant/settings', data);
    },
    onSuccess: () => {
      toast.success('Configurações de notificações salvas!');
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
    },
    onError: () => {
      toast.error('Erro ao salvar configurações de notificações.');
    }
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<WhatsAppStatusResponse>('/whatsapp/instance/connect', {});
      return res.data;
    },
    onSuccess: async (data) => {
      console.log('[Frontend] Connect response:', data);
      if (data.qrCode) {
        setQrCode(data.qrCode);
      }
      if (data.status === 'connected') {
        setQrCode(null);
      }
      await Promise.all([
        refetchStatus(),
        queryClient.invalidateQueries({ queryKey: ['whatsapp-instance'] }),
      ]);
    },
  });

  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'qr' | 'pairing'>('qr');

  const generatePairingCodeMutation = useMutation({
    mutationFn: async (phone?: string) => {
      const res = await api.post<WhatsAppStatusResponse>('/whatsapp/instance/pair', phone ? { phone } : {});
      return res.data;
    },
    onSuccess: (data) => {
      if (data.pairingCode) {
        setPairingCode(data.pairingCode);
      }
    },
  });

  const generateInstanceMutation = useMutation({
    mutationFn: async () => {
      await api.post('/whatsapp/instance', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instance'] });
    }
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await api.post('/whatsapp/instance/disconnect');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instance'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
      setQrCode(null);
      toast.success('WhatsApp desconectado com sucesso.');
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao desconectar WhatsApp.';
      toast.error(errorMessage);
    },
  });

  const devResetMutation = useMutation({
    mutationFn: async () => {
      await api.post('/whatsapp/instance/dev-reset');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instance'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
      setQrCode(null);
      toast.success('Instância resetada com sucesso.');
    },
    onError: () => {
      toast.error('Erro ao resetar instância.');
    }
  });

  const [formAi, setFormAi] = useState<AiAgentConfig | null>(null);

  useEffect(() => {
    if (aiConfig) setFormAi(aiConfig);
  }, [aiConfig]);

  const toggleAiEnabled = async (enabled: boolean) => {
    if (!formAi) return;
    setFormAi(prev => prev ? { ...prev, isEnabled: enabled } : null);
    try {
      await updateAiMutation.mutateAsync({ isEnabled: enabled });
    } catch (err) {
      setFormAi(prev => prev ? { ...prev, isEnabled: !enabled } : null);
    }
  };

  const toggleNotifications = (checked: boolean) => {
    setWhatsappNotificationsEnabled(checked);
    updateSettingsMutation.mutate({
      whatsappNotificationsEnabled: checked
    });
  };

  const isLoading = 
    (featureWhatsappConnect && loadingInstance) || 
    (featureOrderNotifications && loadingSettings) || 
    loadingAi;
  const connectedPhoneLabel = formatConnectedLabel(status?.phoneNumber || instance?.phoneNumber || null);

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Carregando configurações...</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 bg-background text-foreground">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground mb-2">WhatsApp e Notificações</h1>
          <p className="text-muted-foreground font-medium">Configure a conexão com seu WhatsApp e as notificações automáticas de pedidos.</p>
        </div>
        {featureWhatsappConnect && instance && (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${
            status?.status === 'connected' 
              ? 'bg-status-success/10 text-status-success border-status-success/20' 
              : 'bg-status-warning/10 text-status-warning border-status-warning/20'
          }`}>
            <span className="relative flex h-3 w-3">
              {status?.status === 'connected' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-3 w-3 ${status?.status === 'connected' ? 'bg-status-success' : 'bg-status-warning'}`}></span>
            </span>
            <span className="text-sm font-medium">
              {status?.status === 'connected' ? 'Conectado' : 'Aguardando Conexão'}
            </span>
          </div>
        )}
      </div>

      {hasHandoffActive && Boolean(aiConfig) && (
        <div className="bg-status-warning/10 dark:bg-status-warning/5 border border-status-warning/20 dark:border-status-warning/30 rounded-xl p-4 flex items-start gap-3 animate-in fade-in duration-300">
          <div className="flex-shrink-0 text-status-warning">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-status-warning mb-1">
              Atendimento Humano em Andamento
            </h4>
            <p className="text-xs text-status-warning">
              Existem conversas em atendimento humano. A IA não responderá essas conversas até serem reativadas na Caixa de Entrada.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* CARD 1: CONEXÃO WHATSAPP */}
        {featureWhatsappConnect ? (
          <div className="bg-card text-card-foreground border border-border rounded-3xl shadow-sm p-6 relative overflow-hidden group flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-status-success/5 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-status-success/10" />
            <div className="flex items-start gap-4 mb-6">
              <div className="p-3 bg-muted rounded-xl">
                <Smartphone className="w-6 h-6 text-status-success" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">Conexão WhatsApp</h2>
                <p className="text-sm text-muted-foreground">Canal de mensageria da sua loja</p>
              </div>
            </div>
            
            <div className="flex-1 space-y-4">
              {!instance ? (
                <div className="p-8 text-center space-y-4 bg-muted/50 rounded-2xl border border-dashed border-border">
                  <div className="p-4 bg-muted rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                    <QrIcon className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-foreground font-medium">Nenhuma conexão ativa</p>
                    <p className="text-sm text-muted-foreground mt-1">Gere uma nova instância para começar a disparar notificações e mensagens.</p>
                  </div>
                  <button 
                    onClick={() => generateInstanceMutation.mutate()}
                    disabled={generateInstanceMutation.isPending}
                    className="w-full py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {generateInstanceMutation.isPending ? 'Gerando...' : 'Gerar Nova Conexão'}
                  </button>
                </div>
              ) : (
                <>
                  <div className="p-4 bg-muted/50 rounded-xl border border-border/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Status atual</p>
                      <p className={`${status?.status === 'connected' ? 'text-status-success' : 'text-status-warning'} font-medium`}>
                        {status?.status === 'connected' ? 'Online' : 'Desconectado'}
                      </p>
                      {connectedPhoneLabel ? (
                        <p className="mt-1 text-xs font-mono text-muted-foreground">
                          Conectado: {connectedPhoneLabel}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {status?.status === 'connected' ? (
                        <button 
                          onClick={() => disconnectMutation.mutate()}
                          disabled={disconnectMutation.isPending}
                          className="px-4 py-2 bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                          {disconnectMutation.isPending ? 'Desconectando...' : 'Desconectar'}
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button 
                            onClick={() => connectMutation.mutate()}
                            disabled={connectMutation.isPending}
                            className="px-4 py-2 bg-status-success/10 text-status-success border border-status-success/20 hover:bg-status-success/20 rounded-lg text-sm font-medium transition-colors"
                          >
                            {connectMutation.isPending ? 'Conectando...' : 'Conectar'}
                          </button>
                          <button 
                            onClick={() => devResetMutation.mutate()}
                            disabled={devResetMutation.isPending}
                            className="px-4 py-2 bg-status-warning/10 text-status-warning border border-status-warning/20 hover:bg-status-warning/20 rounded-lg text-sm font-medium transition-colors"
                          >
                            {devResetMutation.isPending ? 'Resetando...' : 'Reset Sessão'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {status?.status !== 'connected' && (
                    <div className="mt-4 space-y-4">
                      <div className="flex bg-muted rounded-lg p-1">
                        <button
                          onClick={() => setActiveTab('qr')}
                          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                            activeTab === 'qr'
                              ? 'bg-card text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          QR Code
                        </button>
                        <button
                          onClick={() => setActiveTab('pairing')}
                          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                            activeTab === 'pairing'
                              ? 'bg-card text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Código 8 Dígitos
                        </button>
                      </div>

                      {activeTab === 'qr' && (
                        <div className="p-4 bg-card rounded-xl flex flex-col items-center border border-border">
                          {qrCode ? (
                            <>
                              <p className="text-xs text-muted-foreground mb-4 font-bold uppercase tracking-widest">Escaneie o QR Code</p>
                              <img src={qrCode} alt="WhatsApp QR Code" className="w-48 h-48" />
                              <button 
                                onClick={refreshQrCode}
                                className="mt-4 flex items-center gap-2 text-xs text-primary hover:text-primary/80 font-bold"
                              >
                                <RefreshCw className="w-3 h-3" /> Atualizar QR
                              </button>
                            </>
                          ) : (
                            <div className="text-center py-8">
                              <button
                                onClick={() => connectMutation.mutate()}
                                disabled={connectMutation.isPending}
                                className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 font-medium rounded-lg text-sm transition-colors"
                              >
                                {connectMutation.isPending ? 'Gerando...' : 'Gerar QR Code'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {activeTab === 'pairing' && (
                        <div className="p-4 bg-card rounded-xl flex flex-col items-center border border-border">
                          <p className="text-xs text-muted-foreground mb-4 font-bold uppercase tracking-widest">Use o Código de Pareamento</p>
                          
                          <div className="space-y-4 w-full max-w-sm">
                            {!pairingCode && (
                              <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                  Seu número (ex: 5511999999999)
                                </label>
                                <input
                                  type="tel"
                                  value={phoneNumber}
                                  onChange={(e) => setPhoneNumber(e.target.value)}
                                  placeholder="5511999999999"
                                  className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring bg-card text-foreground"
                                />
                              </div>
                            )}
                            
                            {!pairingCode && (
                              <button
                                onClick={() => generatePairingCodeMutation.mutate(phoneNumber || undefined)}
                                disabled={generatePairingCodeMutation.isPending}
                                className="w-full py-2 bg-primary text-primary-foreground hover:bg-primary/90 font-medium rounded-lg transition-colors"
                              >
                                {generatePairingCodeMutation.isPending ? 'Gerando...' : 'Gerar Código de 8 Dígitos'}
                              </button>
                            )}

                            {pairingCode && (
                              <div className="text-center space-y-4">
                                <div className="p-4 bg-muted/50 rounded-2xl border border-primary/20">
                                  <div className="text-3xl font-mono font-black text-primary tracking-[0.2em]">
                                    {pairingCode}
                                  </div>
                                </div>
                                <div className="space-y-1 text-left bg-muted p-4 rounded-xl border border-border">
                                  <p className="text-xs text-foreground font-bold uppercase mb-2">Instruções:</p>
                                  <p className="text-[11px] text-muted-foreground">1. Abra o WhatsApp no celular</p>
                                  <p className="text-[11px] text-muted-foreground">2. Vá em <b>Aparelhos Conectados</b></p>
                                  <p className="text-[11px] text-muted-foreground">3. Clique em <b>Conectar um aparelho</b></p>
                                  <p className="text-[11px] text-muted-foreground">4. Selecione <b>Link com código</b> na parte inferior</p>
                                  <p className="text-[11px] text-muted-foreground">5. Digite o código acima</p>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => {
                                      setPairingCode(null);
                                      setPhoneNumber('');
                                    }}
                                    className="flex-1 text-xs text-muted-foreground hover:text-foreground font-medium py-2 transition-colors"
                                  >
                                    🔄 Gerar outro
                                  </button>
                                  <button
                                    onClick={() => navigator.clipboard.writeText(pairingCode)}
                                    className="flex-1 text-xs text-primary hover:text-primary/80 font-bold py-2 transition-colors"
                                  >
                                    📋 Copiar Código
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            {instance && (
              <p className="mt-4 text-[10px] text-muted-foreground uppercase tracking-widest">Instância: {instance.instanceName}</p>
            )}
          </div>
        ) : null}

        {/* CARD 2: NOTIFICAÇÕES DE PEDIDOS */}
        {featureOrderNotifications ? (
          <div className="bg-card text-card-foreground border border-border rounded-3xl shadow-sm p-6 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 transition-all" />
            <div>
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-muted rounded-xl">
                    <Bell className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">Notificações de Pedidos</h2>
                    <p className="text-sm text-muted-foreground">Disparos de status via WhatsApp</p>
                  </div>
                </div>
                
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={whatsappNotificationsEnabled} 
                    disabled={updateSettingsMutation.isPending}
                    onChange={(e) => toggleNotifications(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Envie mensagens de atualização do status do pedido automaticamente para os clientes pelo WhatsApp.
                </p>

                <div className="space-y-2 border-t border-border pt-4 mt-2">
                  <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">Eventos de envio ativo:</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-semibold text-foreground">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>Confirmação de Novo Pedido</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>Atualização de Status (Preparo/Pronto)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>Saída para Entrega</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>Cancelamento de Pedido</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-border pt-5">
              <button 
                onClick={() => navigate('/settings/notifications')}
                className="w-full py-3 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 font-semibold rounded-xl transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                <Settings className="w-4 h-4" />
                Personalizar Mensagens e Alertas
              </button>
            </div>
          </div>
        ) : null}

        {/* CARD 3: CONFIGURAÇÃO DO AGENTE IA */}
        {aiConfig ? (
          <div className="bg-card text-card-foreground border border-border rounded-3xl shadow-sm p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-primary/10" />
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-muted rounded-xl">
                  <Bot className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">Agente Inteligente</h2>
                  <p className="text-sm text-muted-foreground">Personalidade e Comportamento da IA</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={formAi?.isEnabled || false} 
                  onChange={(e) => toggleAiEnabled(e.target.checked)}
                />
                <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
            
            <div className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Nome do Agente</label>
                    <input 
                      placeholder="Ex: Bella"
                      className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring bg-card text-foreground"
                      value={formAi?.agentName || ''}
                      onChange={(e) => setFormAi(prev => prev ? {...prev, agentName: e.target.value} : null)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Tom de Voz</label>
                    <select 
                      className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring bg-card text-foreground"
                      value={formAi?.tone || 'friendly'}
                      onChange={(e) => setFormAi(prev => prev ? {...prev, tone: e.target.value} : null)}
                    >
                      <option value="friendly">Amigável</option>
                      <option value="professional">Profissional</option>
                      <option value="sales">Vendedor</option>
                      <option value="objective">Rápido e Objetivo</option>
                      <option value="premium">Premium / Elegante</option>
                    </select>
                  </div>
               </div>

               <div className="space-y-2">
                 <label className="text-sm font-medium text-foreground">Mensagem de Saudação</label>
                 <textarea 
                   className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring bg-card text-foreground h-20 resize-none"
                   placeholder="Como o agente deve cumprimentar o cliente?"
                   value={formAi?.greetingMessage || ''}
                   onChange={(e) => setFormAi(prev => prev ? {...prev, greetingMessage: e.target.value} : null)}
                 />
               </div>

               <div className="space-y-2">
                 <label className="text-sm font-medium text-foreground">Sobre o Restaurante (Instruções)</label>
                 <textarea 
                   placeholder="Ex: Não trabalhamos com reservas aos domingos. O prato mais pedido é a Pizza de Calabresa."
                   className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring bg-card text-foreground h-24 resize-none"
                   value={formAi?.customInstructions || ''}
                   onChange={(e) => setFormAi(prev => prev ? {...prev, customInstructions: e.target.value} : null)}
                 />
                 <p className="text-[10px] text-muted-foreground italic">Forneça detalhes que a IA deve saber sobre seu negócio.</p>
                 <p className="text-xs text-muted-foreground">Essas instruções complementam o Prompt Mestre Global do SaaS. Elas não substituem regras ou políticas obrigatórias definidas globalmente pelo administrador.</p>
               </div>

               <div className="pt-4 border-t border-border space-y-4">
                 <div className="flex items-center justify-between">
                   <div className="space-y-0.5">
                     <label className="text-sm font-medium text-foreground">Simular Digitação</label>
                     <p className="text-xs text-muted-foreground">Mostra "digitando..." antes de responder</p>
                   </div>
                   <label className="relative inline-flex items-center cursor-pointer">
                     <input 
                       type="checkbox" 
                       className="sr-only peer" 
                       checked={formAi?.simulateTyping || false} 
                       onChange={(e) => setFormAi(prev => prev ? {...prev, simulateTyping: e.target.checked} : null)}
                     />
                     <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                   </label>
                 </div>

                 <div className="space-y-2">
                   <div className="flex justify-between items-center">
                     <label className="text-sm font-medium text-foreground">Atraso de Resposta (Debounce)</label>
                     <span className="text-xs font-mono text-primary">{formAi?.debounceMs || 5000}ms</span>
                   </div>
                   <input 
                     type="range"
                     min="5000"
                     max="20000"
                     step="5000"
                     className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                     value={formAi?.debounceMs || 5000}
                     onChange={(e) => setFormAi(prev => prev ? {...prev, debounceMs: parseInt(e.target.value)} : null)}
                   />
                   <p className="text-[10px] text-muted-foreground italic">Tempo de espera após a última mensagem do cliente antes da IA começar a processar.</p>
                 </div>
                 
                 <div className="pt-4 border-t border-border space-y-4">
                   <div className="flex items-center justify-between">
                     <div className="space-y-0.5">
                       <label className="text-sm font-medium text-foreground">Pausa por Intervenção Humana</label>
                       <p className="text-xs text-muted-foreground">Pausar IA automaticamente quando um atendente responder</p>
                     </div>
                     <label className="relative inline-flex items-center cursor-pointer">
                       <input 
                         type="checkbox" 
                         className="sr-only peer" 
                         checked={formAi?.humanInterventionEnabled ?? true} 
                         onChange={(e) => setFormAi(prev => prev ? {...prev, humanInterventionEnabled: e.target.checked} : null)}
                       />
                       <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                     </label>
                   </div>

                   {(formAi?.humanInterventionEnabled ?? true) && (
                     <div className="space-y-2">
                       <label className="text-sm font-medium text-foreground">Tempo de Pausa</label>
                       <select 
                         className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring bg-card text-foreground"
                         value={formAi?.humanInterventionMinutes ?? 15}
                         onChange={(e) => setFormAi(prev => prev ? {...prev, humanInterventionMinutes: parseInt(e.target.value)} : null)}
                       >
                         <option value={5}>5 minutos</option>
                         <option value={10}>10 minutos</option>
                         <option value={15}>15 minutos</option>
                         <option value={30}>30 minutos</option>
                         <option value={60}>1 hora</option>
                         <option value={120}>2 horas</option>
                       </select>
                       <p className="text-[10px] text-muted-foreground italic">
                         Se o cliente responder durante este período, a IA não irá interferir.
                       </p>
                     </div>
                   )}
                 </div>
               </div>

               <button 
                 onClick={() => formAi && updateAiMutation.mutate(formAi)}
                 disabled={updateAiMutation.isPending}
                 className="w-full py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed"
               >
                 <Settings className="w-4 h-4" />
                 {updateAiMutation.isPending ? 'Salvando...' : 'Salvar Personalização'}
               </button>
            </div>
          </div>
        ) : aiError instanceof ApiError && aiError.status === 403 ? (
          /* Card Discreto quando a loja ainda não tem entitlement de IA */
          <div className="bg-card text-card-foreground border border-border/70 rounded-3xl p-6 relative overflow-hidden flex flex-col justify-center items-center text-center opacity-75">
            <div className="p-4 bg-muted/50 rounded-full text-muted-foreground mb-4">
              <Bot className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">Agente IA</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              O atendimento automático por Inteligência Artificial ainda não está liberado para este tenant.
            </p>
            <div className="mt-4 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[10px] font-black uppercase text-amber-700 tracking-wider">
              Bloqueado pelo plano
            </div>
          </div>
        ) : (
          <div className="bg-card text-card-foreground border border-border/70 rounded-3xl p-6 relative overflow-hidden flex flex-col justify-center items-center text-center">
            <div className="p-4 bg-muted/50 rounded-full text-muted-foreground mb-4">
              <Bot className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">Agente IA</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Não foi possível carregar a configuração do Agente IA neste momento.
            </p>
            <div className="mt-4 px-3 py-1 bg-destructive/10 border border-destructive/20 rounded-xl text-[10px] font-black uppercase text-destructive tracking-wider">
              Erro de carregamento
            </div>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-primary/5 border border-primary/20 p-6 rounded-3xl flex gap-4 text-foreground">
        <Info className="w-6 h-6 text-primary-600 shrink-0" />
        <div className="text-sm text-primary-800 dark:text-primary-400 leading-relaxed font-medium">
          <strong>Como funciona?</strong> Mantenha seu WhatsApp conectado. As mensagens automáticas de confirmação, preparo, saída para entrega e cancelamento serão disparadas apenas se o switch "Notificações de Pedidos" estiver ativo. O Agente de IA pode rodar de forma simultânea ou paralela se estiver ativo no seu plano.
        </div>
      </div>
    </div>
  );
}
