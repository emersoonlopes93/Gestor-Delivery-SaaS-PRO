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

type TabId = 'prompt' | 'memory' | 'session' | 'tools' | 'preview';

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

const tabs: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: 'prompt', label: 'Prompt Mestre', icon: FileText },
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
        <Loader2 className="h-8 w-8 animate-spin text-slate-700" />
      </div>
    );
  }

  if (!config) {
    return <div className="p-6 text-sm text-slate-600">Configuração global não encontrada.</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <Bot className="h-4 w-4" />
            Sistema / Agente IA
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Prompt Mestre Global</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md px-3 py-2 text-sm font-medium ${trimmedPrompt ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
            {promptSourceLabel}
          </span>
          <button onClick={refreshPreview} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <RefreshCcw className="h-4 w-4" />
            Pré-visualizar prompt efetivo
          </button>
          <button onClick={() => handleSave()} disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      </header>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {msg && <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</div>}

      <nav className="flex flex-wrap gap-2 border-b border-slate-200">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium ${active ? 'border-slate-950 text-slate-950' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
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
              <div className="text-sm text-slate-600">
                {promptText.length.toLocaleString('pt-BR')} caracteres
                {config.updatedAt ? ` · Última atualização: ${new Date(config.updatedAt).toLocaleString('pt-BR')}` : ''}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={insertRecommendedPromptInEditor} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Carregar recomendado no editor
                </button>
                <button onClick={restoreRecommendedPrompt} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <RefreshCcw className="h-4 w-4" />
                  Restaurar padrão recomendado
                </button>
              </div>
            </div>
            <textarea
              value={promptText}
              onChange={(e) => updateConfig('baseAiPrompt', e.target.value)}
              className="min-h-[620px] w-full rounded-md border border-slate-300 bg-white p-4 font-mono text-sm leading-6 text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              spellCheck={false}
            />
          </div>
          <aside className="space-y-3">
            <SafetyNotice icon={ShieldAlert} title="Escopo global" text="O Prompt Mestre define regras globais que afetam todos os tenants." />
            <SafetyNotice icon={AlertTriangle} title="Regras críticas" text="Evite remover regras de segurança, uso de tools e confirmação explícita." />
            <SafetyNotice icon={Wrench} title="Dados reais" text="Tools só devem ser usadas conforme dados reais. Nunca instrua o agente a inventar preços ou confirmar pedidos sem tool." />
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Origem efetiva atual</div>
              <div className="mt-2 text-sm text-slate-600">{preview?.source === 'database_global' ? 'Banco de dados' : 'Fallback do código'}</div>
              <div className="mt-3 text-xs text-slate-500">Atualizado por: audit log indisponível nesta configuração.</div>
            </div>
          </aside>
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
            <select value={config.aiMemoryRetentionDays} onChange={(e) => updateConfig('aiMemoryRetentionDays', Number(e.target.value))} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {[30, 60, 90, 180, 365].map((days) => <option key={days} value={days}>{days} dias</option>)}
            </select>
          </Field>
        </section>
      )}

      {activeTab === 'session' && (
        <section className="grid gap-3 lg:grid-cols-2">
          <Field label="Nome padrão do agente">
            <input value={config.aiDefaultAgentName} onChange={(e) => updateConfig('aiDefaultAgentName', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Tom padrão">
            <input value={config.aiDefaultTone} onChange={(e) => updateConfig('aiDefaultTone', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Debounce de mensagens">
            <input type="number" min={1000} max={30000} value={config.aiDebounceMs} onChange={(e) => updateConfig('aiDebounceMs', Number(e.target.value))} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
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
              <h2 className="text-lg font-semibold text-slate-950">Tools do Agente</h2>
              <p className="text-sm text-slate-600">Lista registrada no backend, com módulos exigidos e riscos operacionais.</p>
            </div>
            <label className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input value={toolSearch} onChange={(e) => setToolSearch(e.target.value)} placeholder="Buscar tool" className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" />
            </label>
          </div>
          <div className="grid gap-3">
            {filteredTools.map((tool) => (
              <article key={tool.name} className="rounded-md border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-950">{tool.label}</h3>
                      <code className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{tool.name}</code>
                      <span className={`rounded-md px-2 py-1 text-xs font-medium ${tool.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                        {statusLabels[tool.status]}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">{tool.description}</p>
                    <p className="mt-2 text-sm text-slate-600"><strong>Quando usar:</strong> {tool.whenToUse}</p>
                    <p className="mt-1 text-sm text-slate-600"><strong>Risco:</strong> {tool.risk}</p>
                    <p className="mt-1 text-sm text-slate-600"><strong>Módulos:</strong> {tool.requiredModules.length ? tool.requiredModules.join(', ') : 'Nenhum módulo adicional'}</p>
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
              <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="tenantId opcional" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </Field>
            <button onClick={refreshPreview} disabled={previewLoading} className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
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
                  <div key={`${block.source}-${block.title}`} className="rounded-md border border-slate-200 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
                      <h3 className="text-sm font-semibold text-slate-900">{block.title}</h3>
                      <span className="text-xs text-slate-500">{block.source}</span>
                    </div>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap p-4 text-xs leading-5 text-slate-700">{block.content}</pre>
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
    <label className="block rounded-md border border-slate-200 bg-white p-4">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-white p-4">
      <span className="text-sm font-medium text-slate-800">{label}</span>
      <button
        type="button"
        onClick={onChange}
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-slate-900' : 'bg-slate-300'}`}
        aria-pressed={checked}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

function SafetyNotice({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <p className="mt-2 text-sm text-amber-800">{text}</p>
    </div>
  );
}

function JsonPanel({ title, value }: { title: string; value: Record<string, unknown> }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50">
      <div className="border-b border-slate-200 px-3 py-2 font-medium text-slate-700">{title}</div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap p-3 text-slate-600">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

function InfoMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-950">{value}</div>
    </div>
  );
}
