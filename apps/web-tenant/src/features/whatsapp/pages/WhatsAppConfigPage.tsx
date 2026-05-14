import { useState, useEffect } from 'react';
import { Bot, Smartphone, Settings, RefreshCw, QrCode as QrIcon } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api-client';

interface WhatsAppInstance {
  id: string;
  status: string;
  instanceName: string;
  phoneNumber?: string;
  apiUrl?: string;
  apiKey?: string;
}

interface AiAgentConfig {
  isEnabled: boolean;
  agentName: string;
  greetingMessage: string;
  tone: string;
  customInstructions: string;
}

export function WhatsAppConfigPage() {
  const queryClient = useQueryClient();
  const [qrCode, setQrCode] = useState<string | null>(null);

  // Fetch Instance Data
  const { data: instance, isLoading: loadingInstance } = useQuery({
    queryKey: ['whatsapp-instance'],
    queryFn: async () => {
      const res = await api.get<WhatsAppInstance>('/whatsapp/instance');
      return res.data;
    },
  });

  // Fetch AI Config
  const { data: aiConfig, isLoading: loadingAi } = useQuery({
    queryKey: ['ai-agent-config'],
    queryFn: async () => {
      const res = await api.get<AiAgentConfig>('/ai-agent/config');
      return res.data;
    },
  });

  // Fetch Status/QR
  const fetchStatus = async () => {
    try {
      const res = await api.get<any>('/whatsapp/instance/status');
      console.log('[Frontend] Status response:', res.data);
      
      // Se conectou, limpar QR code
      if (res.data.status === 'connected') {
        setQrCode(null);
      } else if (res.data.qrCode) {
        setQrCode(res.data.qrCode);
      }
      
      return res.data;
    } catch (e) {
      return null;
    }
  };

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: fetchStatus,
    enabled: !!instance,
    refetchInterval: (query) => {
      const currentStatus = query.state.data?.status;
      // Continuar polling enquanto não estiver conectado (ainda mais rápido)
      if (currentStatus === 'qr_pending') return 1500; // QR code muda rápido
      if (currentStatus === 'connecting' || currentStatus === 'disconnected') return 2000;
      return false; // Parar quando conectado
    },
  });

  // Mutations
  const updateAiMutation = useMutation({
    mutationFn: async (data: Partial<AiAgentConfig>) => {
      await api.patch('/ai-agent/config', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agent-config'] });
      alert('Configurações salvas!');
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      // No evolution-go, o webhookUrl pode vir da config global, mas enviamos o relativo ao tenant
      const res = await api.post('/whatsapp/instance/connect', { 
        webhookUrl: `${window.location.origin}/api/webhooks/whatsapp/` 
      });
      return res.data;
    },
    onSuccess: (data: any) => {
      console.log('[Frontend] Connect response:', data);
      if (data.qrCode) {
        console.log('[Frontend] QR Code found in connect response');
        setQrCode(data.qrCode);
      }
      // Se já conectou, limpar QR code
      if (data.status === 'connected') {
        setQrCode(null);
      }
      refetchStatus();
    },
  });

  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string>('');

  const generatePairingCodeMutation = useMutation({
    mutationFn: async (phone?: string) => {
      const res = await api.post('/whatsapp/instance/pair', phone ? { phone } : {});
      return res.data;
    },
    onSuccess: (data: any) => {
      console.log('[Frontend] Pairing code response:', data);
      setPairingCode(data.pairingCode);
    },
  });

  const generateInstanceMutation = useMutation({
    mutationFn: async () => {
      await api.post('/whatsapp/instance', {
        webhookUrl: `${window.location.origin}/api/webhooks/whatsapp/`
      });
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
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
      setQrCode(null);
    },
  });

  const [formAi, setFormAi] = useState<AiAgentConfig | null>(null);

  useEffect(() => {
    if (aiConfig) setFormAi(aiConfig);
  }, [aiConfig]);

  if (loadingInstance || loadingAi) {
    return <div className="p-8 text-center text-gray-400">Carregando configurações...</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white mb-2">WhatsApp & Agente IA</h1>
          <p className="text-gray-500 dark:text-gray-400">Personalize o atendimento automatizado da sua loja.</p>
        </div>
        {instance && (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${
            status?.status === 'connected' 
              ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20' 
              : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20'
          }`}>
            <span className="relative flex h-3 w-3">
              {status?.status === 'connected' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-3 w-3 ${status?.status === 'connected' ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
            </span>
            <span className="text-sm font-medium">
              {status?.status === 'connected' ? 'Conectado' : 'Aguardando Conexão'}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card Instância WhatsApp */}
        <div className="card-premium p-6 relative overflow-hidden group flex flex-col">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-green-500/10" />
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 bg-gray-100 dark:bg-gray-800/50 rounded-xl">
              <Smartphone className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Conexão WhatsApp</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Canal de mensageria da loja</p>
            </div>
          </div>
          
          <div className="flex-1 space-y-4">
            {!instance ? (
              <div className="p-8 text-center space-y-4 bg-gray-50 dark:bg-black/20 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">
                <div className="p-4 bg-gray-100 dark:bg-gray-800/50 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                  <QrIcon className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                </div>
                <div>
                  <p className="text-gray-900 dark:text-white font-medium">Nenhuma conexão ativa</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gere uma nova instância para começar a atender via WhatsApp.</p>
                </div>
                <button 
                  onClick={() => generateInstanceMutation.mutate()}
                  disabled={generateInstanceMutation.isPending}
                  className="btn-primary w-full py-3"
                >
                  {generateInstanceMutation.isPending ? 'Gerando...' : 'Gerar Nova Conexão'}
                </button>
              </div>
            ) : (
              <>
                <div className="p-4 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-gray-800/50 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Status atual</p>
                    <p className={`${status?.status === 'connected' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'} font-medium`}>
                      {status?.status === 'connected' ? 'Online' : 'Desconectado'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {status?.status === 'connected' ? (
                      <button 
                        onClick={() => disconnectMutation.mutate()}
                        className="px-4 py-2 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 rounded-lg text-sm font-medium transition-colors"
                      >
                        Desconectar
                      </button>
                    ) : (
                      <button 
                        onClick={() => connectMutation.mutate()}
                        className="px-4 py-2 bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20 rounded-lg text-sm font-medium transition-colors"
                      >
                        Conectar
                      </button>
                    )}
                  </div>
                </div>

                {status?.status !== 'connected' && (
                  <div className="mt-4 space-y-4">
                    {/* Tabs para escolher entre QR Code e Código de Pareamento */}
                    <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                      <button
                        onClick={() => setPairingCode(null)}
                        className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                          !pairingCode
                            ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        QR Code
                      </button>
                      <button
                        onClick={() => setQrCode(null)}
                        className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                          pairingCode
                            ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        Código 8 Dígitos
                      </button>
                    </div>

                    {/* QR Code */}
                    {qrCode && !pairingCode && (
                      <div className="p-4 bg-white rounded-xl flex flex-col items-center border border-gray-100 dark:border-transparent">
                        <p className="text-xs text-gray-500 mb-4 font-bold uppercase tracking-widest">Escaneie o QR Code</p>
                        <img src={qrCode} alt="WhatsApp QR Code" className="w-48 h-48" />
                        <button 
                          onClick={() => refetchStatus()}
                          className="mt-4 flex items-center gap-2 text-xs text-primary-600 hover:text-primary-700 font-bold"
                        >
                          <RefreshCw className="w-3 h-3" /> Atualizar QR
                        </button>
                      </div>
                    )}

                    {/* Código de Pareamento */}
                    {pairingCode && (
                      <div className="p-4 bg-white rounded-xl flex flex-col items-center border border-gray-100 dark:border-transparent">
                        <p className="text-xs text-gray-500 mb-4 font-bold uppercase tracking-widest">Use o Código de Pareamento</p>
                        
                        <div className="space-y-4 w-full max-w-sm">
                          {!qrCode && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Seu número (opcional)
                              </label>
                              <input
                                type="tel"
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                placeholder="5511999999999"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
                              />
                            </div>
                          )}

                          <button
                            onClick={() => generatePairingCodeMutation.mutate(phoneNumber || undefined)}
                            disabled={generatePairingCodeMutation.isPending}
                            className="w-full btn-primary"
                          >
                            {generatePairingCodeMutation.isPending ? 'Gerando...' : 'Gerar Código'}
                          </button>

                          {pairingCode && (
                            <div className="text-center space-y-2">
                              <div className="text-3xl font-mono font-bold text-primary-600 dark:text-primary-400 tracking-wider">
                                {pairingCode}
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                1. Abra WhatsApp → Aparelhos Conectados
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                2. Conectar um aparelho → Link com código
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                3. Digite o código acima
                              </p>
                              <button
                                onClick={() => navigator.clipboard.writeText(pairingCode)}
                                className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                              >
                                📋 Copiar Código
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Botão para gerar QR Code se não tiver */}
                    {!qrCode && !pairingCode && (
                      <div className="text-center">
                        <button
                          onClick={() => connectMutation.mutate()}
                          disabled={connectMutation.isPending}
                          className="btn-primary"
                        >
                          {connectMutation.isPending ? 'Gerando...' : 'Gerar QR Code'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          {instance && (
            <p className="mt-4 text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest">ID: {instance.instanceName}</p>
          )}
        </div>

        {/* Card Configuração do Agente IA */}
        <div className="card-premium p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-blue-500/10" />
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-gray-100 dark:bg-gray-800/50 rounded-xl">
                <Bot className="w-6 h-6 text-primary-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Agente Inteligente</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Personalidade e Comportamento</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={formAi?.isEnabled || false} 
                onChange={(e) => setFormAi(prev => prev ? {...prev, isEnabled: e.target.checked} : null)}
              />
              <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>
          
          <div className="space-y-4">
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Nome do Agente</label>
                  <input 
                    placeholder="Ex: Bella"
                    className="input-premium"
                    value={formAi?.agentName || ''}
                    onChange={(e) => setFormAi(prev => prev ? {...prev, agentName: e.target.value} : null)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tom de Voz</label>
                  <select 
                    className="input-premium"
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
               <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Mensagem de Saudação</label>
               <textarea 
                 className="input-premium h-20 resize-none"
                 placeholder="Como o agente deve cumprimentar o cliente?"
                 value={formAi?.greetingMessage || ''}
                 onChange={(e) => setFormAi(prev => prev ? {...prev, greetingMessage: e.target.value} : null)}
               />
             </div>

             <div className="space-y-2">
               <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Sobre o Restaurante (Instruções)</label>
               <textarea 
                 placeholder="Ex: Não trabalhamos com reservas aos domingos. O prato mais pedido é a Pizza de Calabresa."
                 className="input-premium h-24 resize-none"
                 value={formAi?.customInstructions || ''}
                 onChange={(e) => setFormAi(prev => prev ? {...prev, customInstructions: e.target.value} : null)}
               />
               <p className="text-[10px] text-gray-500 italic">Forneça detalhes que a IA deve saber sobre seu negócio.</p>
             </div>

             <button 
               onClick={() => formAi && updateAiMutation.mutate(formAi)}
               disabled={updateAiMutation.isPending}
               className="btn-primary w-full py-3"
             >
               <Settings className="w-4 h-4" />
               {updateAiMutation.isPending ? 'Salvando...' : 'Salvar Personalização'}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}
