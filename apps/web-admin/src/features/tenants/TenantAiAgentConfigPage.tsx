import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api-client';

interface AiAgentConfig {
  id: string;
  tenantId: string;
  memoryEnabled: boolean;
  rememberCustomerName: boolean;
  rememberAddresses: boolean;
  rememberLastOrder: boolean;
  rememberPreferences: boolean;
  allowRepeatLastOrder: boolean;
  memoryRetentionDays: number;
  isEnabled: boolean;
  agentName: string;
  greetingMessage: string;
  tone: string;
  customInstructions: string;
  operatingMode: string;
  handoffPolicy: string;
  fallbackMessage: string;
  maxRetries: number;
  sessionTimeoutMin: number;
  dailyMessageLimit: number;
  customerCooldownMin: number;
  simulateTyping: boolean;
  debounceMs: number;
  closeOnExitCommand?: boolean;
  exitCommands?: string[];
  resetDraftOnSessionClose?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UpdateConfigDto {
  memoryEnabled?: boolean;
  rememberCustomerName?: boolean;
  rememberAddresses?: boolean;
  rememberLastOrder?: boolean;
  rememberPreferences?: boolean;
  allowRepeatLastOrder?: boolean;
  memoryRetentionDays?: number;
  sessionTimeoutMin?: number;
  closeOnExitCommand?: boolean;
  exitCommands?: string[];
  resetDraftOnSessionClose?: boolean;
}

export function TenantAiAgentConfigPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  
  const [config, setConfig] = useState<AiAgentConfig | null>(null);
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
      .get<AiAgentConfig>(`/admin/ai-agent/tenants/${tenantId}/config`)
      .then((res) => {
        if (res.success) {
          setConfig(res.data);
        } else {
          setErrorMessage('Erro ao carregar configuração do agente IA.');
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof ApiError ? err.message : 'Erro ao carregar configuração do agente IA.';
        setErrorMessage(msg);
      })
      .finally(() => setLoading(false));
  }, [tenantId]);

  const handleToggle = (field: keyof UpdateConfigDto) => {
    if (!config) return;
    setConfig(prev => prev ? { ...prev, [field]: !prev[field] } : null);
  };

  const handleRetentionChange = (value: string) => {
    if (!config) return;
    setConfig(prev => prev ? { ...prev, memoryRetentionDays: parseInt(value, 10) } : null);
  };

  const handleSessionTimeoutChange = (value: string) => {
    if (!config) return;
    setConfig(prev => prev ? { ...prev, sessionTimeoutMin: parseInt(value, 10) } : null);
  };

  const handleExitCommandsChange = (value: string) => {
    if (!config) return;
    const commands = value.split(',').map(cmd => cmd.trim()).filter(cmd => cmd.length > 0);
    setConfig(prev => prev ? { ...prev, exitCommands: commands } : null);
  };

  const handleSave = async () => {
    if (!tenantId || !config) return;

    setSaving(true);
    setSaveMessage(null);
    setErrorMessage(null);

    try {
      const dto: UpdateConfigDto = {
        memoryEnabled: config.memoryEnabled,
        rememberCustomerName: config.rememberCustomerName,
        rememberAddresses: config.rememberAddresses,
        rememberLastOrder: config.rememberLastOrder,
        rememberPreferences: config.rememberPreferences,
        allowRepeatLastOrder: config.allowRepeatLastOrder,
        memoryRetentionDays: config.memoryRetentionDays,
        sessionTimeoutMin: config.sessionTimeoutMin,
        closeOnExitCommand: config.closeOnExitCommand,
        exitCommands: config.exitCommands,
        resetDraftOnSessionClose: config.resetDraftOnSessionClose,
      };

      const res = await api.patch(`/admin/ai-agent/tenants/${tenantId}/config`, dto);

      if (!res.success) {
        setErrorMessage('Erro ao salvar configuração de memória.');
        return;
      }

      setSaveMessage('Configuração de memória salva com sucesso!');
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Erro ao salvar configuração de memória.';
      setErrorMessage(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <button
            onClick={() => navigate('/tenants')}
            className="text-primary hover:opacity-80 text-sm font-medium"
          >
            ← Voltar para Tenants
          </button>
        </div>
        <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">
          Configuração não encontrada
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <button
          onClick={() => navigate('/tenants')}
          className="text-primary hover:opacity-80 text-sm font-medium mb-2 inline-block"
        >
          ← Voltar para Tenants
        </button>
        <h1 className="text-2xl font-bold text-foreground">Memória do Agente IA</h1>
        <p className="text-muted-foreground mt-1">
          Configure a política de memória do agente IA para este tenant
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

      <div className="space-y-6">
        {/* Geral */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Geral</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Quando ativada, a memória permite que o agente lembre nome, endereço e último pedido do cliente para agilizar atendimentos futuros.
            </p>
          </div>
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-medium text-foreground">Ativar memória do agente</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Permite que o agente use dados salvos da conversa, cliente e pedidos anteriores
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.memoryEnabled}
                  onChange={() => handleToggle('memoryEnabled')}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-medium text-foreground">Tempo de sessão</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Tempo em minutos para expirar a sessão por inatividade do cliente.
                </p>
              </div>
              <input
                type="number"
                min={1}
                value={config.sessionTimeoutMin}
                onChange={(e) => handleSessionTimeoutChange(e.target.value)}
                className="w-24 px-3 py-2 border border-border bg-card text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-sm"
              />
            </div>
          </div>
        </div>

        {/* Dados do Cliente */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Dados do Cliente</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure quais informações do cliente o agente deve lembrar
            </p>
          </div>
          <div className="divide-y divide-border/50">
            <div className="p-6 flex items-center justify-between">
              <div>
                <h3 className="text-base font-medium text-foreground">Lembrar nome do cliente</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  O agente usará o nome do cliente em conversas futuras
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.rememberCustomerName}
                  onChange={() => handleToggle('rememberCustomerName')}
                  disabled={!config.memoryEnabled}
                  className="sr-only peer"
                />
                <div className={`w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${config.memoryEnabled ? 'peer-checked:bg-primary' : 'opacity-50 cursor-not-allowed'}`}></div>
              </label>
            </div>
            <div className="p-6 flex items-center justify-between">
              <div>
                <h3 className="text-base font-medium text-foreground">Lembrar endereços usados</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  O agente sugerirá endereços previamente usados pelo cliente
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.rememberAddresses}
                  onChange={() => handleToggle('rememberAddresses')}
                  disabled={!config.memoryEnabled}
                  className="sr-only peer"
                />
                <div className={`w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${config.memoryEnabled ? 'peer-checked:bg-primary' : 'opacity-50 cursor-not-allowed'}`}></div>
              </label>
            </div>
          </div>
        </div>

        {/* Pedidos */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Pedidos</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure como o agente deve lidar com pedidos anteriores
            </p>
          </div>
          <div className="divide-y divide-border/50">
            <div className="p-6 flex items-center justify-between">
              <div>
                <h3 className="text-base font-medium text-foreground">Lembrar último pedido</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  O agente terá acesso ao último pedido do cliente
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.rememberLastOrder}
                  onChange={() => handleToggle('rememberLastOrder')}
                  disabled={!config.memoryEnabled}
                  className="sr-only peer"
                />
                <div className={`w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${config.memoryEnabled ? 'peer-checked:bg-primary' : 'opacity-50 cursor-not-allowed'}`}></div>
              </label>
            </div>
            <div className="p-6 flex items-center justify-between">
              <div>
                <h3 className="text-base font-medium text-foreground">Permitir repetir último pedido</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  O agente pode oferecer a opção de repetir o último pedido (sempre com confirmação)
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.allowRepeatLastOrder}
                  onChange={() => handleToggle('allowRepeatLastOrder')}
                  disabled={!config.memoryEnabled || !config.rememberLastOrder}
                  className="sr-only peer"
                />
                <div className={`w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${config.memoryEnabled && config.rememberLastOrder ? 'peer-checked:bg-primary' : 'opacity-50 cursor-not-allowed'}`}></div>
              </label>
            </div>
          </div>
        </div>

        {/* Preferências */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Preferências</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure o aprendizado de preferências do cliente
            </p>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-medium text-foreground">Lembrar preferências de compra</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  O agente aprenderá e usará preferências como forma de pagamento, observações, etc.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.rememberPreferences}
                  onChange={() => handleToggle('rememberPreferences')}
                  disabled={!config.memoryEnabled}
                  className="sr-only peer"
                />
                <div className={`w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${config.memoryEnabled ? 'peer-checked:bg-primary' : 'opacity-50 cursor-not-allowed'}`}></div>
              </label>
            </div>
          </div>
        </div>

        {/* Sessão e Encerramento */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Sessão e Encerramento</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure como as sessões de conversa são gerenciadas e encerradas
            </p>
          </div>
          <div className="divide-y divide-border/50">
            <div className="p-6 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-medium text-foreground">Expiração de sessão</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Tempo em minutos para expirar a sessão por inatividade do cliente
                </p>
              </div>
              <input
                type="number"
                min={1}
                max={10080}
                value={config.sessionTimeoutMin}
                onChange={(e) => handleSessionTimeoutChange(e.target.value)}
                className="w-24 px-3 py-2 border border-border bg-card text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-sm"
              />
            </div>
            <div className="p-6 flex items-center justify-between">
              <div>
                <h3 className="text-base font-medium text-foreground">Ativar comando #Sair</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Permite que o cliente encerre a conversa com comandos como #sair, sair, encerrar
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.closeOnExitCommand ?? false}
                  onChange={() => handleToggle('closeOnExitCommand')}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
            {config.closeOnExitCommand && (
              <div className="p-6">
                <div>
                  <h3 className="text-base font-medium text-foreground">Comandos customizados (opcional)</h3>
                  <p className="text-sm text-muted-foreground mt-1 mb-2">
                    Separe comandos por vírgula. Deixe vazio para usar padrões: #sair, sair, encerrar, etc.
                  </p>
                  <textarea
                    value={(config.exitCommands ?? []).join(', ')}
                    onChange={(e) => handleExitCommandsChange(e.target.value)}
                    placeholder="#sair, sair, encerrar, cancelar"
                    className="w-full px-3 py-2 border border-border bg-card text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                    rows={2}
                  />
                </div>
              </div>
            )}
            <div className="p-6 flex items-center justify-between">
              <div>
                <h3 className="text-base font-medium text-foreground">Limpar pedido em andamento</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Remove o rascunho de pedido ao encerrar ou expirar a sessão (memória persistente é preservada)
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.resetDraftOnSessionClose ?? true}
                  onChange={() => handleToggle('resetDraftOnSessionClose')}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Retenção */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Retenção</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure por quanto tempo os dados de memória são mantidos
            </p>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-medium text-foreground">Retenção da memória</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Período em dias que os dados de memória são mantidos antes de serem descartados
                </p>
              </div>
              <select
                value={config.memoryRetentionDays}
                onChange={(e) => handleRetentionChange(e.target.value)}
                disabled={!config.memoryEnabled}
                className="w-40 px-3 py-2 border border-border bg-card text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-sm"
              >
                <option value="30">30 dias</option>
                <option value="90">90 dias</option>
                <option value="180">180 dias</option>
                <option value="365">365 dias</option>
              </select>
            </div>
          </div>
        </div>

        {/* Botão Salvar */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all"
          >
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      </div>
    </div>
  );
}
