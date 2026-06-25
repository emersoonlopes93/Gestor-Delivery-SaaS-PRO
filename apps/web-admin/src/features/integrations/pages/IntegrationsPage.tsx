import React, { useState, useEffect } from 'react';
import { api } from '../../../lib/api-client';
import { useToast } from '../../../contexts/ToastContext';
import { 
  Puzzle, 
  MessageSquare, 
  Bot, 
  Save, 
  RefreshCcw,
  AlertCircle,
  Zap,
  Badge
} from 'lucide-react';
import { APP_NAME_STORAGE_KEY, DEFAULT_APP_NAME, normalizeAppName } from '../../../lib/branding';

const GOOGLE_AI_FREE_MODELS = [
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (gratuito)' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (gratuito)' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (gratuito)' },
] as const;


const GOOGLE_AI_FREE_MODELS = [
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (gratuito)' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (gratuito)' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (gratuito)' },
] as const;

interface SystemConfig {
  appName: string;
  defaultWhatsAppProvider: 'evolution_go' | 'meta_cloud';
  defaultAiProvider: 'openai' | 'anthropic' | 'google_ai' | 'openrouter';
  evolutionUrl: string;
  evolutionGlobalToken: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  googleAiApiKey: string;
  openrouterApiKey: string;
  googleAiModel: string;
  openrouterModel: string;
  baseAiPrompt: string;
}

export default function IntegrationsPage() {
  const { showToast } = useToast();
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const response = await api.get<SystemConfig>('/admin/integrations/config');
      if (response.success) {
        setConfig(response.data);
      } else {
        throw new Error('Falha ao carregar configurações');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
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

      const updatePayload = {
        appName: normalizeAppName(config.appName),
        defaultWhatsAppProvider: config.defaultWhatsAppProvider,
        defaultAiProvider: config.defaultAiProvider,
        evolutionUrl: config.evolutionUrl,
        evolutionGlobalToken: config.evolutionGlobalToken,
        openaiApiKey: config.openaiApiKey,
        anthropicApiKey: config.anthropicApiKey,
        googleAiApiKey: config.googleAiApiKey,
        openrouterApiKey: config.openrouterApiKey,
        googleAiModel: config.googleAiModel,
        openrouterModel: config.openrouterModel,
      };

      const response = await api.patch('/admin/integrations/config', updatePayload);

      if (!response.success) throw new Error('Falha ao salvar configurações');
      const nextAppName = normalizeAppName(config.appName);
      localStorage.setItem(APP_NAME_STORAGE_KEY, nextAppName);
      document.title = `${nextAppName} - SaaS Admin`;
      
      showToast('success', 'Configurações salvas com sucesso!');

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
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
          <div className="p-2 bg-primary/10 rounded-lg">
            <Puzzle className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">
            Integrações Globais
          </h1>
        </div>
        <p className="text-muted-foreground text-lg">
          Configure os provedores padrão e credenciais para todo o ecossistema do SaaS.
        </p>
      </header>

      <form onSubmit={handleSave} className="space-y-8">
        <section className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="p-6 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Badge className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold text-foreground">Marca do SaaS</h2>
            </div>
          </div>

          <div className="p-8 space-y-2">
            <label className="text-sm font-semibold text-foreground">Nome do sistema</label>
            <input
              placeholder={DEFAULT_APP_NAME}
              className="w-full h-12 px-4 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary transition-all outline-none"
              value={config?.appName || DEFAULT_APP_NAME}
              onChange={(e) => setConfig(prev => prev ? { ...prev, appName: e.target.value } : null)}
            />
            <p className="text-xs text-muted-foreground">Este nome aparece no SaaS Admin e pode ser trocado futuramente sem alterar o codigo.</p>
          </div>
        </section>

        {/* WhatsApp Providers */}
                    <p className="text-sm text-muted-foreground">O Prompt Mestre Global do Agente IA agora é gerenciado na tela Agente IA Global. Essa configuração define as regras centrais do agente para todos os tenants.</p>
                    <div className="mt-4">
                      <a href="/ai-agent/global" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground">
                        Ir para Agente IA Global
                      </a>
                    </div>
                  </div>
                </div>
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className="flex items-center justify-between">
          {error && (
            <div className="flex items-center gap-2 text-destructive bg-destructive/10 border border-destructive/20 px-4 py-2 rounded-lg">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="btn-primary ml-auto flex items-center gap-2 px-6 py-3 rounded-xl"
          >
            {saving ? (
              <>
                <RefreshCcw className="h-5 w-5 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-5 w-5" />
                Salvar Configurações
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
