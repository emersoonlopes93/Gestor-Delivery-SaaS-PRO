import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api-client';
import { useNavigate } from 'react-router-dom';

interface GlobalAiConfig {
  id: string;
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
}

export function GlobalAiAgentConfigPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<GlobalAiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<GlobalAiConfig>('/admin/ai-agent/global-config')
      .then((res) => {
        if (res.success) setConfig(res.data);
        else setError('Falha ao carregar configuração global');
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Erro inesperado'))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = (field: keyof GlobalAiConfig) => {
    if (!config) return;
    setConfig({ ...config, [field]: !config[field] } as GlobalAiConfig);
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      const res = await api.patch('/admin/ai-agent/global-config', config);
      if (res.success) setMsg('Configuração salva com sucesso');
      else setError('Falha ao salvar configuração');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro inesperado');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
    </div>
  );

  if (!config) return (
    <div className="p-6">
      <button onClick={() => navigate('/')} className="text-indigo-600 hover:underline">
        ← Voltar
      </button>
      <div className="mt-4 text-gray-500">Configuração não encontrada.</div>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Configuração Global do Agente IA</h1>
      {error && <div className="p-3 bg-red-100 text-red-800 rounded">{error}</div>}
      {msg && <div className="p-3 bg-green-100 text-green-800 rounded">{msg}</div>}
      <section className="bg-white shadow rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">Comportamento geral</h2>
        <div className="flex items-center justify-between">
          <span>Ativar memória do agente</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={config.aiMemoryEnabled} onChange={() => handleToggle('aiMemoryEnabled')} className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
          </label>
        </div>
        <div className="flex items-center justify-between">
          <span>Simular digitação</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={config.aiSimulateTyping} onChange={() => handleToggle('aiSimulateTyping')} className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
          </label>
        </div>
        <div className="flex items-center justify-between">
          <span>Retenção da memória (dias)</span>
          <select value={config.aiMemoryRetentionDays} onChange={e => setConfig({ ...config, aiMemoryRetentionDays: Number(e.target.value) })} className="border rounded px-2 py-1">
            {[30, 90, 180, 365].map(d => (
              <option key={d} value={d}>{d} dias</option>
            ))}
          </select>
        </div>
      </section>
      {/* Personalizações avançadas */}
      <section className="bg-white shadow rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">Personalizações</h2>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span>Nome padrão do agente</span>
            <input type="text" value={config.aiDefaultAgentName} onChange={e => setConfig({ ...config, aiDefaultAgentName: e.target.value })} className="mt-1 block w-full border rounded px-2 py-1" />
          </label>
          <label className="block">
            <span>Tom padrão</span>
            <input type="text" value={config.aiDefaultTone} onChange={e => setConfig({ ...config, aiDefaultTone: e.target.value })} className="mt-1 block w-full border rounded px-2 py-1" />
          </label>
        </div>
        <div className="flex items-center justify-between">
          <span>Exigir nome do cliente</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={config.aiRequireCustomerName} onChange={() => handleToggle('aiRequireCustomerName')} className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
          </label>
        </div>
        <div className="flex items-center justify-between">
          <span>Habilitar upsell</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={config.aiEnableUpsell} onChange={() => handleToggle('aiEnableUpsell')} className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
          </label>
        </div>
        <div className="flex items-center justify-between">
          <span>Handoff para atendente humano</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={config.aiEnableHumanHandoff} onChange={() => handleToggle('aiEnableHumanHandoff')} className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
          </label>
        </div>
      </section>
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
