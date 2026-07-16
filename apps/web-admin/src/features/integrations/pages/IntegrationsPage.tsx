import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Badge,
  UploadCloud,
  X
} from 'lucide-react';
import { APP_NAME_STORAGE_KEY, DEFAULT_APP_NAME, normalizeAppName } from '../../../lib/branding';

const GOOGLE_AI_FREE_MODELS = [
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (gratuito)' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (gratuito)' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (gratuito)' },
] as const;

interface SystemConfig {
  appName: string;
  platformLogoMediaId?: string | null;
  platformLogoMedia?: { id: string; publicUrl: string } | null;
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

const ACCEPTED_LOGO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_LOGO_SIZE_BYTES = 10 * 1024 * 1024;

export default function IntegrationsPage() {
  const { showToast } = useToast();
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [initialConfig, setInitialConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [openRouterModels, setOpenRouterModels] = useState<Array<{id: string, displayName: string}>>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [pendingLogoPreviewUrl, setPendingLogoPreviewUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  const currentLogoUrl = useMemo(() => {
    if (pendingLogoPreviewUrl) return pendingLogoPreviewUrl;
    const url = config?.platformLogoMedia?.publicUrl;
    return typeof url === 'string' && url.length > 0 ? url : null;
  }, [config?.platformLogoMedia?.publicUrl, pendingLogoPreviewUrl]);

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    return () => {
      if (pendingLogoPreviewUrl) {
        URL.revokeObjectURL(pendingLogoPreviewUrl);
      }
    };
  }, [pendingLogoPreviewUrl]);

  const cloneConfig = (source: SystemConfig): SystemConfig => ({
    ...source,
    platformLogoMedia: source.platformLogoMedia ? { ...source.platformLogoMedia } : null,
  });

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const response = await api.get<SystemConfig>('/admin/integrations/config');
      if (response.success) {
        setInitialConfig(cloneConfig(response.data));
        setConfig(cloneConfig(response.data));
        setPendingLogoFile(null);
        setPendingLogoPreviewUrl(null);
        setLogoError(null);
      } else {
        throw new Error('Falha ao carregar configurações');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const fetchOpenRouterModels = async () => {
    try {
      setLoadingModels(true);
      const res = await api.get<{success: boolean, models: Array<{id: string, displayName: string}>}>('/admin/ai-agent/providers/openrouter/models');
      const data = 'data' in res ? res.data : res;
      if (data && data.success && data.models) {
        setOpenRouterModels(data.models);
        showToast('success', `${data.models.length} modelos carregados`);
      }
    } catch (err) {
      showToast('error', 'Erro ao carregar modelos do OpenRouter');
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    try {
      setSaving(true);
      setError(null);
      setLogoError(null);

      let nextConfig: SystemConfig = config;
      if (pendingLogoFile) {
        setLogoUploading(true);
        try {
          const formData = new FormData();
          formData.set('file', pendingLogoFile);
          formData.set('title', 'platform_logo');
          formData.set('altText', normalizeAppName(config.appName) || DEFAULT_APP_NAME);
          formData.set('publicationStatus', 'draft');
          formData.set('tags', 'platform_logo');
          const uploadResponse = await api.upload<{ id: string; publicUrl: string }>(
            '/admin/media/gallery/upload',
            formData,
          );
          if (!uploadResponse.success) {
            throw new Error('Falha ao enviar a logo');
          }
          nextConfig = {
            ...config,
            platformLogoMediaId: uploadResponse.data.id,
            platformLogoMedia: {
              id: uploadResponse.data.id,
              publicUrl: uploadResponse.data.publicUrl,
            },
          };
          setConfig(nextConfig);
          setPendingLogoFile(null);
          setPendingLogoPreviewUrl(null);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Erro desconhecido';
          setLogoError(message);
          throw err;
        } finally {
          setLogoUploading(false);
        }
      }

      const updatePayload = {
        appName: normalizeAppName(nextConfig.appName),
        platformLogoMediaId: nextConfig.platformLogoMediaId ?? null,
        defaultWhatsAppProvider: nextConfig.defaultWhatsAppProvider,
        defaultAiProvider: nextConfig.defaultAiProvider,
        evolutionUrl: nextConfig.evolutionUrl,
        evolutionGlobalToken: nextConfig.evolutionGlobalToken,
        openaiApiKey: nextConfig.openaiApiKey,
        anthropicApiKey: nextConfig.anthropicApiKey,
        googleAiApiKey: nextConfig.googleAiApiKey,
        openrouterApiKey: nextConfig.openrouterApiKey,
        googleAiModel: nextConfig.googleAiModel,
        openrouterModel: nextConfig.openrouterModel,
      };

      const response = await api.patch('/admin/integrations/config', updatePayload);

      if (!response.success) throw new Error('Falha ao salvar configurações');
      const nextAppName = normalizeAppName(nextConfig.appName);
      localStorage.setItem(APP_NAME_STORAGE_KEY, nextAppName);
      document.title = `${nextAppName} - SaaS Admin`;
      
      showToast('success', 'Configurações salvas com sucesso!');
      setInitialConfig(cloneConfig(nextConfig));

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoSelectClick = () => {
    logoInputRef.current?.click();
  };

  const handleLogoFileChange = (file: File | null) => {
    if (!file) return;
    setLogoError(null);

    if (!ACCEPTED_LOGO_MIME.has(file.type)) {
      setLogoError('Formato inválido. Use JPG, PNG ou WEBP.');
      return;
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setLogoError('A imagem deve ter no máximo 10 MB.');
      return;
    }

    if (pendingLogoPreviewUrl) {
      URL.revokeObjectURL(pendingLogoPreviewUrl);
    }

    setPendingLogoFile(file);
    setPendingLogoPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveLogo = () => {
    if (!config) return;
    if (pendingLogoPreviewUrl) {
      URL.revokeObjectURL(pendingLogoPreviewUrl);
    }
    setPendingLogoFile(null);
    setPendingLogoPreviewUrl(null);
    setConfig({
      ...config,
      platformLogoMediaId: null,
      platformLogoMedia: null,
    });
  };

  const handleCancelChanges = () => {
    if (!initialConfig) return;
    if (pendingLogoPreviewUrl) {
      URL.revokeObjectURL(pendingLogoPreviewUrl);
    }
    setPendingLogoFile(null);
    setPendingLogoPreviewUrl(null);
    setLogoError(null);
    setConfig(cloneConfig(initialConfig));
    setError(null);
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

          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Nome do sistema</label>
              <input
                placeholder={DEFAULT_APP_NAME}
                className="w-full h-12 px-4 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary transition-all outline-none"
                value={config?.appName || DEFAULT_APP_NAME}
                onChange={(e) => setConfig(prev => prev ? { ...prev, appName: e.target.value } : null)}
              />
              <p className="text-xs text-muted-foreground">Este nome aparece no SaaS Admin e pode ser trocado futuramente sem alterar o codigo.</p>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-foreground">Logo do sistema (opcional)</label>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="h-14 w-full sm:w-[220px] rounded-xl border border-border bg-muted/30 flex items-center justify-center overflow-hidden">
                  {currentLogoUrl ? (
                    <img
                      src={currentLogoUrl}
                      alt={normalizeAppName(config?.appName || DEFAULT_APP_NAME)}
                      className="block max-h-[42px] max-w-[200px] object-contain"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-muted-foreground">Sem logo</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => handleLogoFileChange(e.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    onClick={handleLogoSelectClick}
                    disabled={saving || logoUploading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card hover:bg-muted transition-colors text-sm font-bold"
                  >
                    <UploadCloud className="h-4 w-4" />
                    {currentLogoUrl ? 'Substituir' : 'Selecionar'}
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    disabled={saving || logoUploading || (!currentLogoUrl && !config?.platformLogoMediaId)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card hover:bg-muted transition-colors text-sm font-bold"
                  >
                    <X className="h-4 w-4" />
                    Remover
                  </button>
                </div>
              </div>

              {logoError ? (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-4 py-2 rounded-lg">
                  {logoError}
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">Formatos aceitos: JPG, PNG, WEBP. Limite: 10 MB.</p>
            </div>
          </div>
        </section>

        {/* WhatsApp Providers */}
        <section className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="p-6 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-green-600" />
              <h2 className="text-xl font-bold text-foreground">Canal WhatsApp</h2>
            </div>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Provedor Padrão</label>
                <select 
                  className="w-full h-12 px-4 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary transition-all outline-none"
                  value={config?.defaultWhatsAppProvider}
                  onChange={(e) => setConfig(prev => prev ? {...prev, defaultWhatsAppProvider: e.target.value as SystemConfig['defaultWhatsAppProvider']} : null)}
                >
                  <option value="evolution_go">Evolution Go (Recomendado)</option>
                  <option value="meta_cloud">WhatsApp Business API (Meta)</option>
                </select>
                <p className="text-xs text-muted-foreground">Define qual provedor será sugerido para novos tenants.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">URL Global Evolution Go</label>
                <input 
                  placeholder="https://api.meuserver.com"
                  className="w-full h-12 px-4 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary transition-all outline-none"
                  value={config?.evolutionUrl || ''}
                  onChange={(e) => setConfig(prev => prev ? {...prev, evolutionUrl: e.target.value} : null)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Global Token Evolution Go</label>
                <input 
                  type="password"
                  placeholder="Token Global do Servidor"
                  className="w-full h-12 px-4 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary transition-all outline-none"
                  value={config?.evolutionGlobalToken || ''}
                  onChange={(e) => setConfig(prev => prev ? {...prev, evolutionGlobalToken: e.target.value} : null)}
                />
              </div>
            </div>

            <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/20 flex gap-3">
              <Zap className="h-5 w-5 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-600/90">
                <strong>Dica:</strong> O Evolution Go permite conexões via QR Code e tem menor custo operacional para pequenas e médias empresas.
              </p>
            </div>
          </div>
        </section>

        {/* AI Providers */}
        <section className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="p-6 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-indigo-600" />
              <h2 className="text-xl font-bold text-foreground">Inteligência Artificial (LLM)</h2>
            </div>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Provedor de IA Padrão</label>
                <select 
                  className="w-full h-12 px-4 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary transition-all outline-none"
                  value={config?.defaultAiProvider || 'openai'}
                  onChange={(e) => setConfig(prev => prev ? {...prev, defaultAiProvider: e.target.value as SystemConfig['defaultAiProvider']} : null)}
                >
                  <option value="openai">OpenAI (GPT-4/o)</option>
                  <option value="anthropic">Anthropic (Claude 3.5)</option>
                  <option value="google_ai">Google AI (Gemini)</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
              </div>

              {config?.defaultAiProvider === 'google_ai' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Modelo Google AI</label>
                  <select
                    className="w-full h-12 px-4 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary transition-all outline-none"
                    value={config?.googleAiModel || ''}
                    onChange={(e) => setConfig(prev => prev ? {...prev, googleAiModel: e.target.value} : null)}
                  >
                    {GOOGLE_AI_FREE_MODELS.map(model => (
                      <option key={model.id} value={model.id}>{model.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {config?.defaultAiProvider === 'openrouter' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Modelo OpenRouter</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        list="openrouter-models-list"
                        placeholder="ex: anthropic/claude-3.5-sonnet"
                        className="w-full h-12 px-4 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary transition-all outline-none"
                        value={config?.openrouterModel || ''}
                        onChange={(e) => setConfig(prev => prev ? {...prev, openrouterModel: e.target.value} : null)}
                      />
                      <datalist id="openrouter-models-list">
                        {openRouterModels.map(m => (
                          <option key={m.id} value={m.id}>{m.displayName}</option>
                        ))}
                      </datalist>
                    </div>
                    <button
                      type="button"
                      onClick={fetchOpenRouterModels}
                      disabled={loadingModels}
                      className="px-4 bg-muted hover:bg-muted/80 text-foreground border border-border rounded-xl whitespace-nowrap transition-colors flex items-center justify-center min-w-[140px]"
                    >
                      {loadingModels ? <RefreshCcw className="h-4 w-4 animate-spin" /> : 'Carregar Modelos'}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Informe o nome completo ou carregue a lista para buscar por modelo.</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">API Key OpenAI</label>
                  <input
                    type="password"
                    placeholder="sk-..."
                    className="w-full h-12 px-4 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary transition-all outline-none"
                    value={config?.openaiApiKey || ''}
                    onChange={(e) => setConfig(prev => prev ? {...prev, openaiApiKey: e.target.value} : null)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">API Key Anthropic</label>
                  <input
                    type="password"
                    placeholder="sk-ant-..."
                    className="w-full h-12 px-4 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary transition-all outline-none"
                    value={config?.anthropicApiKey || ''}
                    onChange={(e) => setConfig(prev => prev ? {...prev, anthropicApiKey: e.target.value} : null)}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-foreground">API Key Google AI</label>
                  <input
                    type="password"
                    placeholder="AIza..."
                    className="w-full h-12 px-4 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary transition-all outline-none"
                    value={config?.googleAiApiKey || ''}
                    onChange={(e) => setConfig(prev => prev ? {...prev, googleAiApiKey: e.target.value} : null)}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-foreground">API Key OpenRouter</label>
                  <input
                    type="password"
                    placeholder="sk-or-v1-..."
                    className="w-full h-12 px-4 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary transition-all outline-none"
                    value={config?.openrouterApiKey || ''}
                    onChange={(e) => setConfig(prev => prev ? {...prev, openrouterApiKey: e.target.value} : null)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Prompt Mestre Global</label>
                <div className="p-4 rounded-xl border border-border bg-card">
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

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancelChanges}
              disabled={saving || logoUploading || !initialConfig}
              className="px-6 py-3 rounded-xl border border-border bg-card text-foreground hover:bg-muted transition-colors font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || logoUploading}
              className="btn-primary flex items-center gap-2 px-6 py-3 rounded-xl"
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
        </div>
      </form>
    </div>
  );
}
