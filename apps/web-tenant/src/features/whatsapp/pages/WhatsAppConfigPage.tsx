import React, { useState, useEffect } from 'react';
import { Bot, Smartphone, Settings, Zap, RefreshCw, AlertCircle, CheckCircle2, QrCode as QrIcon } from 'lucide-react';
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
  greetingMessage: string;
  systemPrompt: string;
  tone: string;
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
      if (res.data.qrCode) setQrCode(res.data.qrCode);
      return res.data;
    } catch (e) {
      return null;
    }
  };

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: fetchStatus,
    enabled: !!instance,
    refetchInterval: (query) => (query.state.data?.status === 'qr_pending' ? 5000 : false),
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
      // No evolution-go, o webhookUrl pode ser opcional ou vir da config
      await api.post('/whatsapp/instance/connect', { 
        webhookUrl: `${window.location.origin}/api/webhooks/whatsapp/` 
      });
    },
    onSuccess: () => {
      refetchStatus();
    },
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
  const [showApiForm, setShowApiForm] = useState(false);
  const [apiForm, setApiForm] = useState({ apiUrl: '', apiKey: '', instanceName: '' });

  // Mutations
  const createInstanceMutation = useMutation({
    mutationFn: async (data: any) => {
      await api.post('/whatsapp/instance', {
        ...data,
        providerType: 'evolution_go',
        webhookUrl: `${window.location.origin}/api/webhooks/whatsapp/`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instance'] });
      setShowApiForm(false);
    }
  });

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
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">WhatsApp & Agente IA</h1>
          <p className="text-gray-400">Configure sua conexão WhatsApp e o comportamento do assistente virtual.</p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${
          status?.status === 'connected' 
            ? 'bg-green-500/10 text-green-400 border-green-500/20' 
            : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
        }`}>
          <span className="relative flex h-3 w-3">
            {status?.status === 'connected' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${status?.status === 'connected' ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
          </span>
          <span className="text-sm font-medium">
            {status?.status === 'connected' ? 'Evolution Go Online' : 'Aguardando Conexão'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card Instância WhatsApp */}
        <div className="bg-[#1A1D24] border border-gray-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group flex flex-col">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-green-500/10" />
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 bg-gray-800/50 rounded-xl">
              <Smartphone className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Conexão WhatsApp</h2>
              <p className="text-sm text-gray-400">Gerencie a instância conectada</p>
            </div>
          </div>
          
          <div className="flex-1 space-y-4">
            {!instance || showApiForm ? (
              <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-800 space-y-3">
                <p className="text-sm text-gray-400 font-medium">Configuração da API Evolution Go</p>
                <input 
                  placeholder="URL da API (ex: https://go.kigula.dpdns.org)"
                  className="w-full bg-black/20 border border-gray-800 rounded-lg p-2 text-sm text-white"
                  value={apiForm.apiUrl}
                  onChange={e => setApiForm({...apiForm, apiUrl: e.target.value})}
                />
                <input 
                  placeholder="API Key / Token"
                  className="w-full bg-black/20 border border-gray-800 rounded-lg p-2 text-sm text-white"
                  value={apiForm.apiKey}
                  onChange={e => setApiForm({...apiForm, apiKey: e.target.value})}
                />
                <input 
                  placeholder="Nome da Instância (ex: Loja01)"
                  className="w-full bg-black/20 border border-gray-800 rounded-lg p-2 text-sm text-white"
                  value={apiForm.instanceName}
                  onChange={e => setApiForm({...apiForm, instanceName: e.target.value})}
                />
                <div className="flex gap-2">
                  <button 
                    onClick={() => createInstanceMutation.mutate(apiForm)}
                    disabled={createInstanceMutation.isPending}
                    className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold uppercase transition-all"
                  >
                    {createInstanceMutation.isPending ? 'Salvando...' : 'Salvar API'}
                  </button>
                  {instance && (
                    <button 
                      onClick={() => setShowApiForm(false)}
                      className="px-3 py-2 bg-gray-700 text-white rounded-lg text-xs font-bold"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="p-4 bg-black/20 rounded-xl border border-gray-800/50 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-400 mb-1">Status atual</p>
                    <p className={`${status?.status === 'connected' ? 'text-green-400' : 'text-yellow-400'} font-medium`}>
                      {status?.status === 'connected' ? `Conectado (${status.phoneNumber})` : 'Desconectado'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {status?.status === 'connected' ? (
                      <button 
                        onClick={() => disconnectMutation.mutate()}
                        className="px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-sm font-medium transition-colors"
                      >
                        Desconectar
                      </button>
                    ) : (
                      <button 
                        onClick={() => connectMutation.mutate()}
                        className="px-4 py-2 bg-green-500/10 text-green-400 hover:bg-green-500/20 rounded-lg text-sm font-medium transition-colors"
                      >
                        Conectar
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        setApiForm({ apiUrl: instance.apiUrl || '', apiKey: instance.apiKey || '', instanceName: instance.instanceName });
                        setShowApiForm(true);
                      }}
                      className="p-2 bg-gray-800 text-gray-400 hover:text-white rounded-lg"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {qrCode && status?.status !== 'connected' && (
                  <div className="mt-4 p-4 bg-white rounded-xl flex flex-col items-center">
                    <p className="text-xs text-gray-500 mb-4 font-bold uppercase tracking-widest">Escaneie o QR Code</p>
                    <img src={qrCode} alt="WhatsApp QR Code" className="w-48 h-48" />
                    <button 
                      onClick={() => refetchStatus()}
                      className="mt-4 flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700 font-bold"
                    >
                      <RefreshCw className="w-3 h-3" /> Atualizar
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <p className="mt-4 text-[10px] text-gray-500 uppercase tracking-widest">Provider: Evolution Go ({instance?.instanceName})</p>
        </div>

        {/* Card Configuração do Agente IA */}
        <div className="bg-[#1A1D24] border border-gray-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-blue-500/10" />
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-gray-800/50 rounded-xl">
                <Bot className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Agente Inteligente</h2>
                <p className="text-sm text-gray-400">Configure o comportamento do robô</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={formAi?.isEnabled || false} 
                onChange={(e) => setFormAi(prev => prev ? {...prev, isEnabled: e.target.checked} : null)}
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>
          
          <div className="space-y-4">
             <div className="space-y-2">
               <label className="text-sm font-medium text-gray-300">Mensagem de Saudação</label>
               <textarea 
                 className="w-full bg-black/20 border border-gray-800 rounded-xl p-3 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all resize-none"
                 rows={2}
                 value={formAi?.greetingMessage || ''}
                 onChange={(e) => setFormAi(prev => prev ? {...prev, greetingMessage: e.target.value} : null)}
               />
             </div>
             <div className="space-y-2">
               <label className="text-sm font-medium text-gray-300">Prompt do Sistema (Comportamento)</label>
               <textarea 
                 className="w-full bg-black/20 border border-gray-800 rounded-xl p-3 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all resize-none"
                 rows={4}
                 value={formAi?.systemPrompt || ''}
                 onChange={(e) => setFormAi(prev => prev ? {...prev, systemPrompt: e.target.value} : null)}
               />
             </div>
             <button 
               onClick={() => formAi && updateAiMutation.mutate(formAi)}
               disabled={updateAiMutation.isPending}
               className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-50"
             >
               <Settings className="w-4 h-4" />
               {updateAiMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}
