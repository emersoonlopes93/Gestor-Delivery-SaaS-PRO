import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api-client';

interface ModuleItem {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  accessId?: string;
}

export function TenantModulesPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    setLoading(true);
    setSaveMessage(null);
    setErrorMessage(null);

    api
      .get<ModuleItem[]>(`/admin/modules/${tenantId}`)
      .then((res) => {
        if (res.success) {
          setModules(res.data);
        } else {
          setModules([]);
          setErrorMessage('Erro ao carregar módulos.');
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof ApiError ? err.message : 'Erro ao carregar módulos.';
        setErrorMessage(msg);
      })
      .finally(() => setLoading(false));
  }, [tenantId]);

  const handleToggle = (moduleKey: string) => {
    setModules(prev =>
      prev.map(m => m.key === moduleKey ? { ...m, enabled: !m.enabled } : m)
    );
  };

  const handleSave = async () => {
    if (!tenantId) return;

    setSaving(true);
    setSaveMessage(null);
    setErrorMessage(null);
    try {
      const res = await api.put(`/admin/modules/${tenantId}`, {
        modules: modules.map(({ key, enabled }) => ({ module: key, enabled })),
      });

      if (!res.success) {
        setErrorMessage('Erro ao salvar configuração de módulos.');
        return;
      }

      setSaveMessage('Configuração de módulos salva com sucesso!');
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Erro ao salvar configuração de módulos.';
      setErrorMessage(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Módulos do Tenant</h1>
        <p className="text-muted-foreground mt-1">
          Configure quais módulos estão disponíveis para este tenant
        </p>
      </div>

      {errorMessage && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-500/10 text-sm text-red-700 dark:text-red-400">
          {errorMessage}
        </div>
      )}

      {saveMessage && (
        <div className="mb-4 p-3 rounded-lg border border-green-200 dark:border-green-900/30 bg-green-50 dark:bg-green-500/10 text-sm text-green-700 dark:text-green-400">
          {saveMessage}
        </div>
      )}

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="p-6 border-b border-border">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-foreground">Módulos Disponíveis</h2>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>

        <div className="divide-y divide-border/50">
          {modules.map((module) => (
            <div key={module.key} className="p-6 flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-medium text-foreground">{module.name}</h3>
                <p className="text-muted-foreground mt-1">{module.description}</p>
              </div>
              <div className="ml-4">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={module.enabled}
                    onChange={() => handleToggle(module.key)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
