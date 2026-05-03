import React, { useState, useEffect } from 'react';
import { 
  Puzzle, 
  MessageSquare, 
  Bot, 
  Save, 
  RefreshCcw,
  AlertCircle,
  CheckCircle2,
  Zap
} from 'lucide-react';

interface SystemConfig {
  defaultWhatsAppProvider: 'evolution_go' | 'meta_cloud';
  defaultAiProvider: 'openai' | 'anthropic';
  evolutionUrl: string;
  evolutionGlobalToken: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  baseAiPrompt: string;
}

export default function IntegrationsPage() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/v1/admin/integrations/config', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_accessToken')}`
        }
      });
      if (!response.ok) throw new Error('Falha ao carregar configurações');
      const responseData = await response.json();
      setConfig(responseData.data || responseData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const { id: _id, updatedAt: _updatedAt, createdAt: _createdAt, ...updatePayload } = config as any;

      const response = await fetch('/api/v1/admin/integrations/config', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_accessToken')}`
        },
        body: JSON.stringify(updatePayload)
      });

      if (!response.ok) throw new Error('Falha ao salvar configurações');
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCcw className="h-8 w-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-100 rounded-lg">
            <Puzzle className="h-6 w-6 text-primary-600" />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            Integrações Globais
          </h1>
        </div>
        <p className="text-gray-500 text-lg">
          Configure os provedores padrão e credenciais para todo o ecossistema do SaaS.
        </p>
      </header>

      <form onSubmit={handleSave} className="space-y-8">
        {/* WhatsApp Providers */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-50 bg-gray-50/30">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-green-600" />
              <h2 className="text-xl font-bold text-gray-800">Canal WhatsApp</h2>
            </div>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Provedor Padrão</label>
                <select 
                  className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none"
                  value={config?.defaultWhatsAppProvider}
                  onChange={(e) => setConfig(prev => prev ? {...prev, defaultWhatsAppProvider: e.target.value as any} : null)}
                >
                  <option value="evolution_go">Evolution Go (Recomendado)</option>
                  <option value="meta_cloud">WhatsApp Business API (Meta)</option>
                </select>
                <p className="text-xs text-gray-400">Define qual provedor será sugerido para novos tenants.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">URL Global Evolution Go</label>
                <input 
                  placeholder="https://api.meuserver.com"
                  className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none"
                  value={config?.evolutionUrl || ''}
                  onChange={(e) => setConfig(prev => prev ? {...prev, evolutionUrl: e.target.value} : null)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Global Token Evolution Go</label>
                <input 
                  type="password"
                  placeholder="Token Global do Servidor"
                  className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none"
                  value={config?.evolutionGlobalToken || ''}
                  onChange={(e) => setConfig(prev => prev ? {...prev, evolutionGlobalToken: e.target.value} : null)}
                />
              </div>
            </div>

            <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-100 flex gap-3">
              <Zap className="h-5 w-5 text-yellow-600 shrink-0" />
              <p className="text-sm text-yellow-800">
                <strong>Dica:</strong> O Evolution Go permite conexões via QR Code e tem menor custo operacional para pequenas e médias empresas.
              </p>
            </div>
          </div>
        </section>

        {/* AI Providers */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-50 bg-gray-50/30">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-indigo-600" />
              <h2 className="text-xl font-bold text-gray-800">Inteligência Artificial (LLM)</h2>
            </div>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Provedor de IA Padrão</label>
                <select 
                  className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none"
                  value={config?.defaultAiProvider || 'openai'}
                  onChange={(e) => setConfig(prev => prev ? {...prev, defaultAiProvider: e.target.value as any} : null)}
                >
                  <option value="openai">OpenAI (GPT-4/o)</option>
                  <option value="anthropic">Anthropic (Claude 3.5)</option>
                </select>
              </div>

              {config?.defaultAiProvider === 'openai' ? (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                  <label className="text-sm font-medium text-gray-700">OpenAI API Key</label>
                  <input 
                    type="password"
                    placeholder="sk-..."
                    className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none font-mono text-sm"
                    value={config?.openaiApiKey || ''}
                    onChange={(e) => setConfig(prev => prev ? {...prev, openaiApiKey: e.target.value} : null)}
                  />
                </div>
              ) : (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                  <label className="text-sm font-medium text-gray-700">Anthropic API Key</label>
                  <input 
                    type="password"
                    placeholder="sk-ant-..."
                    className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none font-mono text-sm"
                    value={config?.anthropicApiKey || ''}
                    onChange={(e) => setConfig(prev => prev ? {...prev, anthropicApiKey: e.target.value} : null)}
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center justify-between">
                  Prompt Base Global do Sistema
                  <span className="text-[10px] text-primary-600 font-bold uppercase tracking-wider">Injetado em todos os agentes</span>
                </label>
                <textarea 
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none text-sm font-mono leading-relaxed"
                  rows={6}
                  placeholder="Diretrizes mestre para todos os atendentes..."
                  value={config?.baseAiPrompt || ''}
                  onChange={(e) => setConfig(prev => prev ? {...prev, baseAiPrompt: e.target.value} : null)}
                />
                <p className="text-[10px] text-gray-500 italic">Este prompt define o comportamento core que nenhum tenant pode alterar.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer / Actions */}
        <div className="flex items-center justify-between p-6 bg-gray-50 rounded-2xl border border-gray-100">
          <div className="flex items-center gap-2">
            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm font-medium">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4" />
                Configurações salvas com sucesso!
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-8 py-3 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 active:scale-95 transition-all shadow-lg shadow-primary-200 disabled:opacity-50 disabled:active:scale-100"
          >
            {saving ? (
              <RefreshCcw className="h-5 w-5 animate-spin" />
            ) : (
              <Save className="h-5 w-5" />
            )}
            Salvar Alterações
          </button>
        </div>
      </form>
    </div>
  );
}
