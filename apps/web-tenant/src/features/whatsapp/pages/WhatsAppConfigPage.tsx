import { useState, useEffect } from 'react';
import { Bot, Smartphone, Settings, RefreshCw, QrCode as QrIcon } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { toast } from 'react-hot-toast';

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
  simulateTyping: boolean;
  debounceMs: number;
}

interface WhatsAppStatusResponse {
  status: string;
  qrCode?: string;
  pairingCode?: string;
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
      const res = await api.get<WhatsAppStatusResponse>('/whatsapp/instance/status');
      console.log('[Frontend] Status response:', res.data);
      
      // Se conectou ou desconectou, limpar QR code
      if (res.data.status === 'connected' || res.data.status === 'disconnected') {
        setQrCode(null);
      } else if (res.data.qrCode) {
        setQrCode(res.data.qrCode);
      }
      
      return res.data;
    } catch (e) {
      // Importante: não retornar `null`, senão o polling pode parar (status vira undefined).
      // Deixar falhar preserva o último `data` conhecido do React Query.
      throw e;
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
      // Mesmo conectado, manter um polling mais lento para refletir quedas sem exigir F5.
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
      // Garantir que o status também seja revalidado
      refetchStatus();
    }
  };

  // Mutations
  const updateAiMutation = useMutation({
    mutationFn: async (data: Partial<AiAgentConfig>) => {
      // Filtrar apenas os campos que o backend aceita no DTO
      const cleanData = {
        isEnabled: data.isEnabled,
        agentName: data.agentName,
        greetingMessage: data.greetingMessage,
        tone: data.tone,
        customInstructions: data.customInstructions,
        simulateTyping: data.simulateTyping,
        debounceMs: data.debounceMs,
      };
      await api.patch('/ai-agent/config', cleanData);
    },
    onSuccess: () => {
      toast.success('Configurações salvas!');
      queryClient.invalidateQueries({ queryKey: ['ai-agent-config'] });
    },
    onError: () => {
      toast.error('Erro ao salvar configurações.');
    }
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<WhatsAppStatusResponse>('/whatsapp/instance/connect', {});
      return res.data;
    },
    onSuccess: (data) => {
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
  const [activeTab, setActiveTab] = useState<'qr' | 'pairing'>('qr');

  const generatePairingCodeMutation = useMutation({
    mutationFn: async (phone?: string) => {
      const res = await api.post<WhatsAppStatusResponse>('/whatsapp/instance/pair', phone ? { phone } : {});
      return res.data;
    },
    onSuccess: (data) => {
      console.log('[Frontend] Pairing code response:', data);
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
      // Reverter estado local em caso de erro
      setFormAi(prev => prev ? { ...prev, isEnabled: !enabled } : null);
    }
  };

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
                      <div className="flex gap-2">
                        <button 
                          onClick={() => connectMutation.mutate()}
                          disabled={connectMutation.isPending}
                          className="px-4 py-2 bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20 rounded-lg text-sm font-medium transition-colors"
                        >
                          {connectMutation.isPending ? 'Conectando...' : 'Conectar'}
                        </button>
                        <button 
                          onClick={() => devResetMutation.mutate()}
                          disabled={devResetMutation.isPending}
                          className="px-4 py-2 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/20 rounded-lg text-sm font-medium transition-colors"
                        >
                          {devResetMutation.isPending ? 'Resetando...' : 'Dev Reset'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {status?.status !== 'connected' && (
                  <div className="mt-4 space-y-4">
                    {/* Tabs para escolher entre QR Code e Código de Pareamento */}
                    <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                      <button
                        onClick={() => setActiveTab('qr')}
                        className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                          activeTab === 'qr'
                            ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        QR Code
                      </button>
                      <button
                        onClick={() => setActiveTab('pairing')}
                        className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                          activeTab === 'pairing'
                            ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        Código 8 Dígitos
                      </button>
                    </div>

                    {/* QR Code */}
                    {activeTab === 'qr' && (
                      <div className="p-4 bg-white dark:bg-gray-900 rounded-xl flex flex-col items-center border border-gray-100 dark:border-gray-800">
                        {qrCode ? (
                          <>
                            <p className="text-xs text-gray-500 mb-4 font-bold uppercase tracking-widest">Escaneie o QR Code</p>
                            <img src={qrCode} alt="WhatsApp QR Code" className="w-48 h-48" />
                            <button 
                              onClick={refreshQrCode}
                              className="mt-4 flex items-center gap-2 text-xs text-primary-600 hover:text-primary-700 font-bold"
                            >
                              <RefreshCw className="w-3 h-3" /> Atualizar QR
                            </button>
                          </>
                        ) : (
                          <div className="text-center py-8">
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
                    
                    {/* Código de Pareamento */}
                    {activeTab === 'pairing' && (
                      <div className="p-4 bg-white dark:bg-gray-900 rounded-xl flex flex-col items-center border border-gray-100 dark:border-gray-800">
                        <p className="text-xs text-gray-500 mb-4 font-bold uppercase tracking-widest">Use o Código de Pareamento</p>
                        
                        <div className="space-y-4 w-full max-w-sm">
                          {!pairingCode && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Seu número (ex: 5511999999999)
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
                          
                          {!pairingCode && (
                            <button
                              onClick={() => generatePairingCodeMutation.mutate(phoneNumber || undefined)}
                              disabled={generatePairingCodeMutation.isPending}
                              className="w-full btn-primary"
                            >
                              {generatePairingCodeMutation.isPending ? 'Gerando...' : 'Gerar Código de 8 Dígitos'}
                            </button>
                          )}

                          {pairingCode && (
                            <div className="text-center space-y-4">
                              <div className="p-4 bg-gray-50 dark:bg-black/40 rounded-2xl border border-primary-500/20">
                                <div className="text-3xl font-mono font-black text-primary-600 dark:text-primary-400 tracking-[0.2em]">
                                  {pairingCode}
                                </div>
                              </div>
                              <div className="space-y-1 text-left bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/50">
                                <p className="text-xs text-blue-700 dark:text-blue-300 font-bold uppercase mb-2">Instruções:</p>
                                <p className="text-[11px] text-gray-600 dark:text-gray-400">1. Abra o WhatsApp no celular</p>
                                <p className="text-[11px] text-gray-600 dark:text-gray-400">2. Vá em <b>Aparelhos Conectados</b></p>
                                <p className="text-[11px] text-gray-600 dark:text-gray-400">3. Clique em <b>Conectar um aparelho</b></p>
                                <p className="text-[11px] text-gray-600 dark:text-gray-400">4. Selecione <b>Link com código</b> na parte inferior</p>
                                <p className="text-[11px] text-gray-600 dark:text-gray-400">5. Digite o código acima</p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    setPairingCode(null);
                                    setPhoneNumber('');
                                  }}
                                  className="flex-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium py-2 transition-colors"
                                >
                                  🔄 Gerar outro
                                </button>
                                <button
                                  onClick={() => navigator.clipboard.writeText(pairingCode)}
                                  className="flex-1 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-bold py-2 transition-colors"
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
                onChange={(e) => toggleAiEnabled(e.target.checked)}
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

             <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-4">
               <div className="flex items-center justify-between">
                 <div className="space-y-0.5">
                   <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Simular Digitação</label>
                   <p className="text-xs text-gray-500">Mostra "digitando..." antes de responder</p>
                 </div>
                 <label className="relative inline-flex items-center cursor-pointer">
                   <input 
                     type="checkbox" 
                     className="sr-only peer" 
                     checked={formAi?.simulateTyping || false} 
                     onChange={(e) => setFormAi(prev => prev ? {...prev, simulateTyping: e.target.checked} : null)}
                   />
                   <div className="w-9 h-5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                 </label>
               </div>

               <div className="space-y-2">
                 <div className="flex justify-between items-center">
                   <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Atraso de Resposta (Debounce)</label>
                   <span className="text-xs font-mono text-blue-600 dark:text-blue-400">{formAi?.debounceMs || 1000}ms</span>
                 </div>
                 <input 
                   type="range"
                   min="500"
                   max="5000"
                   step="500"
                   className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                   value={formAi?.debounceMs || 1000}
                   onChange={(e) => setFormAi(prev => prev ? {...prev, debounceMs: parseInt(e.target.value)} : null)}
                 />
                 <p className="text-[10px] text-gray-500 italic">Tempo de espera após a última mensagem do cliente antes da IA começar a processar.</p>
               </div>
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
