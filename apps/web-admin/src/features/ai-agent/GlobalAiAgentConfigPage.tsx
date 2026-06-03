import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Bot,
  Clock,
  Database,
  FileText,
  ListChecks,
  Loader2,
  RefreshCcw,
  Save,
  Search,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api, ApiError } from '../../lib/api-client';

type TabId = 'prompt' | 'providers' | 'memory' | 'session' | 'tools' | 'preview';

type ToolStatus = 'active' | 'filtered_by_module' | 'unavailable';

type BooleanConfigKey =
  | 'aiMemoryEnabled'
  | 'aiRememberCustomerName'
  | 'aiRememberAddresses'
  | 'aiRememberLastOrder'
  | 'aiRememberPreferences'
  | 'aiAllowRepeatLastOrder'
  | 'aiSimulateTyping'
  | 'aiRequireCustomerName'
  | 'aiRequireConfirmation'
  | 'aiEnableUpsell'
  | 'aiEnableHumanHandoff';

interface GlobalAiConfig {
  id: string;
  baseAiPrompt?: string | null;
  aiDefaultAgentName: string;
  aiDefaultTone: string;
  aiMemoryEnabled: boolean;
  aiRememberCustomerName: boolean;
  aiRememberAddresses: boolean;
  aiRememberLastOrder: boolean;
  aiRememberPreferences: boolean;
  aiAllowRepeatLastOrder: boolean;
  aiMemoryRetentionDays: number;
  aiDebounceMs: number;
  aiSimulateTyping: boolean;
  aiRequireCustomerName: boolean;
  aiRequireConfirmation: boolean;
  aiEnableUpsell: boolean;
  aiEnableHumanHandoff: boolean;
  updatedAt?: string;
  defaultAiProvider?: string;
  googleAiModel?: string;
  openaiModel?: string;
  anthropicModel?: string;
  fallbackAiProvider?: string | null;
  fallbackAiModel?: string | null;
}

interface AiToolGuideItem {
  name: string;
  label: string;
  description: string;
  whenToUse: string;
  parameters: Record<string, unknown>;
  exampleCall: Record<string, unknown>;
  exampleReturn: Record<string, unknown>;
  requiredModules: string[];
  enabledByDefault: boolean;
  category: string;
  status: ToolStatus;
  risk: string;
}

interface PromptPreviewBlock {
  source: string;
  title: string;
  content: string;
}

interface EffectivePromptPreview {
  source: 'database_global' | 'fallback_code';
  tenantPromptAppended: boolean;
  globalPrompt: {
    source: string;
    characterCount: number;
    content: string;
  };
  tenantPrompt: {
    source: string;
    appended: boolean;
    characterCount: number;
    content: string;
  };
  automaticContext: PromptPreviewBlock[];
  tools: Array<{ name: string; description: string }>;
  blocks: PromptPreviewBlock[];
  effectivePrompt: string;
}

interface RecommendedPromptResponse {
  prompt: string;
  characterCount: number;
}

interface TestProviderResponse {
  success: boolean;
  statusCode: number;
  response?: string | null;
  error?: string;
  friendlyError?: string;
  errorType?: string;
  keySource: string;
  apiKeySource: string;
  apiKeyFingerprint: string | null;
  model: string;
  modelSource: string;
}

interface TestProviderResult {
  success: boolean;
  message: string;
  details: string;
}

const tabs: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: 'prompt', label: 'Prompt Mestre', icon: FileText },
  { id: 'providers', label: 'Provedores de IA', icon: Bot },
  { id: 'memory', label: 'Memória', icon: Database },
  { id: 'session', label: 'Sessão', icon: Clock },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'preview', label: 'Debug/Preview', icon: ListChecks },
];

const statusLabels: Record<ToolStatus, string> = {
  active: 'Ativa',
  filtered_by_module: 'Filtrada por módulo',
  unavailable: 'Indisponível',
};

const GOOGLE_AI_MODELS = [
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (gratuito)' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (gratuito)' },
  { id: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash 8B (gratuito)' },
];

const OPENAI_MODELS = [
  { id: 'gpt-4o', label: 'GPT-4o (Recomendado)' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini (Mais rápido/econômico)' },
  { id: 'gpt-4', label: 'GPT-4' },
];

const ANTHROPIC_MODELS = [
  { id: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet' },
  { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
  { id: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
];

export function GlobalAiAgentConfigPage() {
  const [activeTab, setActiveTab] = useState<TabId>('prompt');
  const [config, setConfig] = useState<GlobalAiConfig | null>(null);
  const [tools, setTools] = useState<AiToolGuideItem[]>([]);
  const [preview, setPreview] = useState<EffectivePromptPreview | null>(null);
  const [toolSearch, setToolSearch] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Estados de teste do provedor
  const [testingPrimary, setTestingPrimary] = useState(false);
  const [testResultPrimary, setTestResultPrimary] = useState<TestProviderResult | null>(null);
  const [testingFallback, setTestingFallback] = useState(false);
  const [testResultFallback, setTestResultFallback] = useState<TestProviderResult | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  const promptText = config?.baseAiPrompt ?? '';
  const trimmedPrompt = promptText.trim();
  const promptSourceLabel = trimmedPrompt.length > 0
    ? 'Usando prompt do banco'
    : 'Prompt vazio - fallback ativo';

  const filteredTools = useMemo(() => {
    const search = toolSearch.trim().toLowerCase();
    if (!search) return tools;
    return tools.filter((tool) =>
      [tool.name, tool.label, tool.description, tool.category]
        .join(' ')
        .toLowerCase()
        .includes(search),
    );
  }, [tools, toolSearch]);

  async function loadInitialData() {
    setLoading(true);
    setError(null);
    try {
      const [configRes, toolsRes, previewRes] = await Promise.all([
        api.get<GlobalAiConfig>('/admin/ai-agent/global-config'),
        api.get<AiToolGuideItem[]>('/admin/ai-agent/tools'),
        api.get<EffectivePromptPreview>('/admin/ai-agent/effective-prompt-preview'),
      ]);

      if (configRes.success) setConfig(configRes.data);
      if (toolsRes.success) setTools(toolsRes.data);
      if (previewRes.success) setPreview(previewRes.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro inesperado ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }

  function updateConfig<K extends keyof GlobalAiConfig>(field: K, value: GlobalAiConfig[K]) {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  }

  function toggleConfig(field: BooleanConfigKey) {
    if (!config) return;
    setConfig({ ...config, [field]: !config[field] });
  }

  async function handleTestProvider(isFallback: boolean) {
    const provider = isFallback ? config?.fallbackAiProvider : config?.defaultAiProvider;
    const model = isFallback ? config?.fallbackAiModel : (
      config?.defaultAiProvider === 'google_ai' ? config.googleAiModel :
      config?.defaultAiProvider === 'openai' ? config.openaiModel :
      config?.defaultAiProvider === 'anthropic' ? config.anthropicModel : undefined
    );

    if (!provider) return;

    if (isFallback) {
      setTestingFallback(true);
      setTestResultFallback(null);
    } else {
      setTestingPrimary(true);
      setTestResultPrimary(null);
    }

    try {
      const res = await api.post<TestProviderResponse>('/admin/ai-agent/test-provider', {
        provider,
        model,
      });
      const result = res.data;
      const details = [
        `status=${result.statusCode}`,
        `key=${result.apiKeySource}`,
        `fingerprint=${result.apiKeyFingerprint ?? 'none'}`,
        `model=${result.model}`,
        `modelSource=${result.modelSource}`,
      ].join(' | ');

      const outcome = result.success
        ? { success: true, message: `Conexao bem sucedida! Retorno da IA: "${result.response}"`, details }
        : { success: false, message: result.friendlyError || result.error || 'Falha desconhecida no teste.', details };

      if (isFallback) setTestResultFallback(outcome);
      else setTestResultPrimary(outcome);
    } catch (e: unknown) {
      const outcome = {
        success: false,
        message: e instanceof ApiError ? e.message : 'Erro inesperado na chamada de teste.',
        details: 'A chamada nao retornou diagnostico do provider.',
      };
      if (isFallback) setTestResultFallback(outcome);
      else setTestResultPrimary(outcome);
    } finally {
      if (isFallback) setTestingFallback(false);
      else setTestingPrimary(false);
    }
  }
  async function handleSave(confirmEmptyPromptFallback = false) {
    if (!config) return;
    if (trimmedPrompt.length === 0 && !confirmEmptyPromptFallback) {
      const confirmed = window.confirm(
        'O Prompt Mestre está vazio. Em produção isso mantém o fallback do código ativo. Deseja salvar mesmo assim?',
      );
      if (!confirmed) return;
      await handleSave(true);
      return;
    }

    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      const updateData = {
        baseAiPrompt: config.baseAiPrompt ?? '',
        confirmEmptyPromptFallback,
        aiDefaultAgentName: config.aiDefaultAgentName,
        aiDefaultTone: config.aiDefaultTone,
        aiMemoryEnabled: config.aiMemoryEnabled,
        aiRememberCustomerName: config.aiRememberCustomerName,
        aiRememberAddresses: config.aiRememberAddresses,
        aiRememberLastOrder: config.aiRememberLastOrder,
        aiRememberPreferences: config.aiRememberPreferences,
        aiAllowRepeatLastOrder: config.aiAllowRepeatLastOrder,
        aiMemoryRetentionDays: config.aiMemoryRetentionDays,
        aiDebounceMs: config.aiDebounceMs,
        aiSimulateTyping: config.aiSimulateTyping,
        aiRequireCustomerName: config.aiRequireCustomerName,
        aiRequireConfirmation: config.aiRequireConfirmation,
        aiEnableUpsell: config.aiEnableUpsell,
        aiEnableHumanHandoff: config.aiEnableHumanHandoff,
        defaultAiProvider: config.defaultAiProvider,
        googleAiModel: config.googleAiModel,
        openaiModel: config.openaiModel,
        anthropicModel: config.anthropicModel,
        fallbackAiProvider: config.fallbackAiProvider,
        fallbackAiModel: config.fallbackAiModel,
      };
      const res = await api.patch<GlobalAiConfig>('/admin/ai-agent/global-config', updateData);
      if (res.success) {
        setConfig(res.data);
        setMsg('Configuração salva com sucesso');
        await refreshPreview();
      } else {
        setError('Falha ao salvar configuração');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro inesperado ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function restoreRecommendedPrompt() {
    const confirmed = window.confirm(
      'Restaurar o prompt padrão recomendado substituirá o Prompt Mestre Global atual. Continuar?',
    );
    if (!confirmed) return;

    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      const res = await api.post<GlobalAiConfig>('/admin/ai-agent/global-config/restore-recommended-prompt');
      if (res.success) {
        setConfig(res.data);
        setMsg('Prompt padrão recomendado restaurado');
        await refreshPreview();
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao restaurar prompt recomendado');
    } finally {
      setSaving(false);
    }
  }

  async function insertRecommendedPromptInEditor() {
    setSaving(true);
    setError(null);
    try {
      const res = await api.get<RecommendedPromptResponse>('/admin/ai-agent/recommended-prompt');
      if (res.success) updateConfig('baseAiPrompt', res.data.prompt);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao carregar prompt recomendado');
    } finally {
      setSaving(false);
    }
  }

  async function refreshPreview() {
    setPreviewLoading(true);
    setError(null);
    try {
      const query = tenantId.trim() ? `?tenantId=${encodeURIComponent(tenantId.trim())}` : '';
      const res = await api.get<EffectivePromptPreview>(`/admin/ai-agent/effective-prompt-preview${query}`);
      if (res.success) setPreview(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao carregar preview');
    } finally {
      setPreviewLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!config) {
    return <div className="p-6 text-sm text-muted-foreground">Configuração global não encontrada.</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">
      <header className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Bot className="h-4 w-4" />
            Sistema / Agente IA
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Prompt Mestre Global</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md px-3 py-2 text-sm font-medium ${trimmedPrompt ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
            {promptSourceLabel}
          </span>
          <button onClick={refreshPreview} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors">
            <RefreshCcw className="h-4 w-4" />
            Pré-visualizar prompt efetivo
          </button>
          <button onClick={() => handleSave()} disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-all">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      </header>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {msg && <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</div>}

      <nav className="flex flex-wrap gap-2 border-b border-border">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-all ${active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {activeTab === 'prompt' && (
        <section className="grid gap-5 xl:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground">
                {promptText.length.toLocaleString('pt-BR')} caracteres
                {config.updatedAt ? ` · Última atualização: ${new Date(config.updatedAt).toLocaleString('pt-BR')}` : ''}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={insertRecommendedPromptInEditor} className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors">
                  Carregar recomendado no editor
                </button>
                <button onClick={restoreRecommendedPrompt} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors">
                  <RefreshCcw className="h-4 w-4" />
                  Restaurar padrão recomendado
                </button>
              </div>
            </div>
            <textarea
              value={promptText}
              onChange={(e) => updateConfig('baseAiPrompt', e.target.value)}
              className="min-h-[620px] w-full rounded-md border border-border bg-card p-4 font-mono text-sm leading-6 text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              spellCheck={false}
            />
          </div>
          <aside className="space-y-3">
            <SafetyNotice icon={ShieldAlert} title="Escopo global" text="O Prompt Mestre define regras globais que afetam todos os tenants." />
            <SafetyNotice icon={AlertTriangle} title="Regras críticas" text="Evite remover regras de segurança, uso de tools e confirmação explícita." />
            <SafetyNotice icon={Wrench} title="Dados reais" text="Tools só devem ser usadas conforme dados reais. Nunca instrua o agente a inventar preços ou confirmar pedidos sem tool." />
            <div className="rounded-md border border-border bg-card p-4">
              <div className="text-sm font-semibold text-foreground">Origem efetiva atual</div>
              <div className="mt-2 text-sm text-muted-foreground">{preview?.source === 'database_global' ? 'Banco de dados' : 'Fallback do código'}</div>
              <div className="mt-3 text-xs text-muted-foreground/60">Atualizado por: audit log indisponível nesta configuração.</div>
            </div>
          </aside>
        </section>
      )}

      {activeTab === 'providers' && (
        <section className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Provedor Principal */}
            <div className="rounded-md border border-border bg-card p-6 space-y-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                Provedor Principal
              </h3>
              
              <Field label="Provedor Padrão">
                <select 
                  value={config.defaultAiProvider || 'openai'} 
                  onChange={(e) => updateConfig('defaultAiProvider', e.target.value)}
                  className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                >
                  <option value="openai">OpenAI (GPT)</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="google_ai">Google AI (Gemini)</option>
                </select>
              </Field>

              {config.defaultAiProvider === 'google_ai' && (
                <Field label="Modelo Google AI">
                  <select 
                    value={config.googleAiModel || 'gemini-1.5-flash'} 
                    onChange={(e) => {
                      if (!e.target.value) return;
                      updateConfig('googleAiModel', e.target.value);
                    }}
                    className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    {GOOGLE_AI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </Field>
              )}

              {config.defaultAiProvider === 'openai' && (
                <Field label="Modelo OpenAI">
                  <select 
                    value={config.openaiModel || 'gpt-4o'} 
                    onChange={(e) => {
                      if (!e.target.value) return;
                      updateConfig('openaiModel', e.target.value);
                    }}
                    className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    {OPENAI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </Field>
              )}

              {config.defaultAiProvider === 'anthropic' && (
                <Field label="Modelo Anthropic">
                  <select 
                    value={config.anthropicModel || 'claude-3-5-sonnet-20240620'} 
                    onChange={(e) => {
                      if (!e.target.value) return;
                      updateConfig('anthropicModel', e.target.value);
                    }}
                    className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    {ANTHROPIC_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </Field>
              )}

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => handleTestProvider(false)}
                  disabled={testingPrimary}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-2 text-sm font-medium transition-colors"
                >
                  {testingPrimary ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                  Testar Provedor Principal
                </button>
                {testResultPrimary && (
                  <div className={`p-3 rounded-md border text-sm ${testResultPrimary.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                    <div>{testResultPrimary.message}</div>
                    <div className="mt-1 font-mono text-xs opacity-80">{testResultPrimary.details}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Provedor de Fallback */}
            <div className="rounded-md border border-border bg-card p-6 space-y-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Provedor de Fallback (Secundário)
              </h3>
              
              <Field label="Provedor de Fallback">
                <select 
                  value={config.fallbackAiProvider || ''} 
                  onChange={(e) => {
                    const val = e.target.value || null;
                    updateConfig('fallbackAiProvider', val);
                    if (!val) {
                      updateConfig('fallbackAiModel', null);
                    } else {
                      const defaultModel = val === 'google_ai' ? 'gemini-1.5-flash' : val === 'openai' ? 'gpt-4o' : 'claude-3-5-sonnet-20240620';
                      updateConfig('fallbackAiModel', defaultModel);
                    }
                  }}
                  className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                >
                  <option value="">Sem Fallback (Desativado)</option>
                  <option value="openai">OpenAI (GPT)</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="google_ai">Google AI (Gemini)</option>
                </select>
              </Field>

              {config.fallbackAiProvider === 'google_ai' && (
                <Field label="Modelo de Fallback (Gemini)">
                  <select 
                    value={config.fallbackAiModel || 'gemini-1.5-flash'} 
                    onChange={(e) => {
                      if (!e.target.value) return;
                      updateConfig('fallbackAiModel', e.target.value);
                    }}
                    className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    {GOOGLE_AI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </Field>
              )}

              {config.fallbackAiProvider === 'openai' && (
                <Field label="Modelo de Fallback (OpenAI)">
                  <select 
                    value={config.fallbackAiModel || 'gpt-4o'} 
                    onChange={(e) => {
                      if (!e.target.value) return;
                      updateConfig('fallbackAiModel', e.target.value);
                    }}
                    className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    {OPENAI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </Field>
              )}

              {config.fallbackAiProvider === 'anthropic' && (
                <Field label="Modelo de Fallback (Anthropic)">
                  <select 
                    value={config.fallbackAiModel || 'claude-3-5-sonnet-20240620'} 
                    onChange={(e) => {
                      if (!e.target.value) return;
                      updateConfig('fallbackAiModel', e.target.value);
                    }}
                    className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    {ANTHROPIC_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </Field>
              )}

              {config.fallbackAiProvider && (
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => handleTestProvider(true)}
                    disabled={testingFallback}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-2 text-sm font-medium transition-colors"
                  >
                    {testingFallback ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                    Testar Provedor de Fallback
                  </button>
                  {testResultFallback && (
                    <div className={`p-3 rounded-md border text-sm ${testResultFallback.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                      <div>{testResultFallback.message}</div>
                      <div className="mt-1 font-mono text-xs opacity-80">{testResultFallback.details}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'memory' && (
        <section className="grid gap-3 lg:grid-cols-2">
          <ToggleRow label="Ativar memória do agente" checked={config.aiMemoryEnabled} onChange={() => toggleConfig('aiMemoryEnabled')} />
          <ToggleRow label="Lembrar nome do cliente" checked={config.aiRememberCustomerName} onChange={() => toggleConfig('aiRememberCustomerName')} />
          <ToggleRow label="Lembrar endereços" checked={config.aiRememberAddresses} onChange={() => toggleConfig('aiRememberAddresses')} />
          <ToggleRow label="Lembrar último pedido" checked={config.aiRememberLastOrder} onChange={() => toggleConfig('aiRememberLastOrder')} />
          <ToggleRow label="Lembrar preferências" checked={config.aiRememberPreferences} onChange={() => toggleConfig('aiRememberPreferences')} />
          <ToggleRow label="Permitir repetir último pedido" checked={config.aiAllowRepeatLastOrder} onChange={() => toggleConfig('aiAllowRepeatLastOrder')} />
          <Field label="Retenção da memória">
            <select value={config.aiMemoryRetentionDays} onChange={(e) => updateConfig('aiMemoryRetentionDays', Number(e.target.value))} className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm">
              {[30, 60, 90, 180, 365].map((days) => <option key={days} value={days}>{days} dias</option>)}
            </select>
          </Field>
        </section>
      )}

      {activeTab === 'session' && (
        <section className="grid gap-3 lg:grid-cols-2">
          <Field label="Nome padrão do agente">
            <input value={config.aiDefaultAgentName} onChange={(e) => updateConfig('aiDefaultAgentName', e.target.value)} className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm" />
          </Field>
          <Field label="Tom padrão">
            <input value={config.aiDefaultTone} onChange={(e) => updateConfig('aiDefaultTone', e.target.value)} className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm" />
          </Field>
          <Field label="Debounce de mensagens">
            <input type="number" min={1000} max={30000} value={config.aiDebounceMs} onChange={(e) => updateConfig('aiDebounceMs', Number(e.target.value))} className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm" />
          </Field>
          <ToggleRow label="Simular digitação" checked={config.aiSimulateTyping} onChange={() => toggleConfig('aiSimulateTyping')} />
          <ToggleRow label="Exigir nome do cliente" checked={config.aiRequireCustomerName} onChange={() => toggleConfig('aiRequireCustomerName')} />
          <ToggleRow label="Exigir confirmação explícita" checked={config.aiRequireConfirmation} onChange={() => toggleConfig('aiRequireConfirmation')} />
          <ToggleRow label="Habilitar upsell" checked={config.aiEnableUpsell} onChange={() => toggleConfig('aiEnableUpsell')} />
          <ToggleRow label="Habilitar handoff humano" checked={config.aiEnableHumanHandoff} onChange={() => toggleConfig('aiEnableHumanHandoff')} />
        </section>
      )}

      {activeTab === 'tools' && (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Tools do Agente</h2>
              <p className="text-sm text-muted-foreground">Lista registrada no backend, com módulos exigidos e riscos operacionais.</p>
            </div>
            <label className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input value={toolSearch} onChange={(e) => setToolSearch(e.target.value)} placeholder="Buscar tool" className="w-full rounded-md border border-border bg-card text-foreground py-2 pl-9 pr-3 text-sm" />
            </label>
          </div>
          <div className="grid gap-3">
            {filteredTools.map((tool) => (
              <article key={tool.name} className="rounded-md border border-border bg-card p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-foreground">{tool.label}</h3>
                      <code className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">{tool.name}</code>
                      <span className={`rounded-md px-2 py-1 text-xs font-medium ${tool.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                        {statusLabels[tool.status]}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{tool.description}</p>
                    <p className="mt-2 text-sm text-muted-foreground"><strong>Quando usar:</strong> {tool.whenToUse}</p>
                    <p className="mt-1 text-sm text-muted-foreground"><strong>Risco:</strong> {tool.risk}</p>
                    <p className="mt-1 text-sm text-muted-foreground"><strong>Módulos:</strong> {tool.requiredModules.length ? tool.requiredModules.join(', ') : 'Nenhum módulo adicional'}</p>
                  </div>
                  <div className="grid gap-2 text-xs lg:w-[420px]">
                    <JsonPanel title="Parâmetros" value={tool.parameters} />
                    <JsonPanel title="Exemplo de chamada" value={tool.exampleCall} />
                    <JsonPanel title="Exemplo de retorno" value={tool.exampleReturn} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'preview' && (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <Field label="Tenant para simular filtro de tools">
              <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="tenantId opcional" className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm" />
            </Field>
            <button onClick={refreshPreview} disabled={previewLoading} className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-all">
              {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Atualizar preview
            </button>
          </div>
          {preview && (
            <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
              <div className="space-y-3">
                <InfoMetric label="Fonte do prompt" value={preview.source === 'database_global' ? 'Banco de dados' : 'Fallback do código'} />
                <InfoMetric label="Prompt tenant anexado" value={preview.tenantPromptAppended ? 'Sim' : 'Não'} />
                <InfoMetric label="Tools disponíveis" value={String(preview.tools.length)} />
                <InfoMetric label="Caracteres do global" value={preview.globalPrompt.characterCount.toLocaleString('pt-BR')} />
              </div>
              <div className="space-y-3">
                {preview.blocks.map((block) => (
                  <div key={`${block.source}-${block.title}`} className="rounded-md border border-border bg-card">
                    <div className="flex items-center justify-between border-b border-border px-4 py-2">
                      <h3 className="text-sm font-semibold text-foreground">{block.title}</h3>
                      <span className="text-xs text-muted-foreground/60">{block.source}</span>
                    </div>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap p-4 text-xs leading-5 text-muted-foreground">{block.content}</pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block rounded-md border border-border bg-card p-4">
      <span className="mb-2 block text-sm font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-card p-4">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <button
        type="button"
        onClick={onChange}
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted'}`}
        aria-pressed={checked}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

function SafetyNotice({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="rounded-md border border-amber-200/50 bg-amber-500/10 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-600">
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <p className="mt-2 text-sm text-amber-600/80">{text}</p>
    </div>
  );
}

function JsonPanel({ title, value }: { title: string; value: Record<string, unknown> }) {
  return (
    <div className="rounded-md border border-border bg-muted/30">
      <div className="border-b border-border px-3 py-2 font-medium text-muted-foreground">{title}</div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap p-3 text-muted-foreground/80">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

function InfoMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="text-xs font-medium uppercase text-muted-foreground/60">{label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}
