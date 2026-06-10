import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api-client';

const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const TIMEZONES = [
  'America/Sao_Paulo',
  'America/Bahia',
  'America/Recife',
  'America/Cuiaba',
  'America/Fortaleza',
  'America/Manaus',
  'America/Campo_Grande',
];

interface SchedulingSettings {
  enabled: boolean;
  acceptScheduledOrders: boolean;
  minimumAdvanceMinutes: number;
  maximumAdvanceDays: number;
  slotIntervalMinutes: number;
  maxOrdersPerSlot: number;
  timezone: string;
}

interface SchedulingWindow {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  active: boolean;
}

interface AvailableSlot {
  id: string;
  startTime: string;
  endTime: string;
  availableCapacity: number;
  totalCapacity: number;
  minOrderValue: number | null;
  maxOrderValue: number | null;
  maxItems: number | null;
}

const initialWindowForm = {
  dayOfWeek: 1,
  startTime: '09:00',
  endTime: '18:00',
  active: true,
};

export function TenantSchedulingPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();

  const [settings, setSettings] = useState<SchedulingSettings | null>(null);
  const [windows, setWindows] = useState<SchedulingWindow[]>([]);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [previewDate, setPreviewDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [windowForm, setWindowForm] = useState(initialWindowForm);
  const [editingWindowId, setEditingWindowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingWindow, setSavingWindow] = useState(false);
  const [generatingSlots, setGeneratingSlots] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canShowSlotsPreview = useMemo(() => settings?.enabled && settings.acceptScheduledOrders, [settings]);

  const loadSettings = useCallback(async () => {
    if (!tenantId) return;
    const res = await api.get<SchedulingSettings>('/scheduling/settings');
    if (res.success) {
      setSettings(res.data);
    }
  }, [tenantId]);

  const loadWindows = useCallback(async () => {
    if (!tenantId) return;
    const res = await api.get<SchedulingWindow[]>('/scheduling/windows');
    if (res.success) {
      setWindows(res.data);
    }
  }, [tenantId]);

  const loadAvailableSlots = useCallback(async () => {
    if (!tenantId || !previewDate) return;
    try {
      const res = await api.get<AvailableSlot[]>(`/scheduling/time-slots/available?date=${previewDate}`);
      if (res.success) {
        setAvailableSlots(res.data);
      }
    } catch {
      setAvailableSlots([]);
    }
  }, [previewDate, tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    setErrorMessage(null);
    Promise.all([loadSettings(), loadWindows()])
      .then(() => loadAvailableSlots())
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenantId, loadSettings, loadWindows, loadAvailableSlots]);

  function setSettingField<Key extends keyof SchedulingSettings>(key: Key, value: SchedulingSettings[Key]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function resetWindowForm() {
    setWindowForm(initialWindowForm);
    setEditingWindowId(null);
  }

  async function handleSaveSettings() {
    if (!settings) return;
    setSavingSettings(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await api.put<SchedulingSettings>('/scheduling/settings', settings);
      if (res.success) {
        setSettings(res.data);
        setSuccessMessage('Configurações de agendamento salvas com sucesso.');
        await api.post('/scheduling/time-slots/auto-generate');
        await loadAvailableSlots();
      }
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Erro ao salvar configurações de agendamento.';
      setErrorMessage(msg);
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSaveWindow() {
    setSavingWindow(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (editingWindowId) {
        const res = await api.put<SchedulingWindow>(`/scheduling/windows/${editingWindowId}`, windowForm);
        if (res.success) {
          setSuccessMessage('Janela de agendamento atualizada com sucesso.');
        }
      } else {
        const res = await api.post<SchedulingWindow>('/scheduling/windows', windowForm);
        if (res.success) {
          setSuccessMessage('Nova janela de agendamento criada com sucesso.');
        }
      }
      resetWindowForm();
      await loadWindows();
      await api.post('/scheduling/time-slots/auto-generate');
      await loadAvailableSlots();
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Erro ao salvar janela de agendamento.';
      setErrorMessage(msg);
    } finally {
      setSavingWindow(false);
    }
  }

  async function handleDeleteWindow(id: string) {
    if (!window.confirm('Tem certeza que deseja excluir esta janela de agendamento?')) return;
    setSavingWindow(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await api.delete<void>(`/scheduling/windows/${id}`);
      if (res.success) {
        setSuccessMessage('Janela excluída com sucesso.');
        await loadWindows();
        await api.post('/scheduling/time-slots/auto-generate');
        await loadAvailableSlots();
      }
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Erro ao excluir janela de agendamento.';
      setErrorMessage(msg);
    } finally {
      setSavingWindow(false);
    }
  }

  async function handleGenerateSlots() {
    setGeneratingSlots(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await api.post<{ success: boolean; resultCount: number }>('/scheduling/time-slots/auto-generate');
      if (res.success) {
        setSuccessMessage(`Slots auto-gerados com sucesso. ${res.data.resultCount} operações concluídas.`);
        await loadAvailableSlots();
      }
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Erro ao gerar slots de agendamento.';
      setErrorMessage(msg);
    } finally {
      setGeneratingSlots(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configuração de Agendamento</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie as regras e as janelas usadas para gerar slots públicos de agendamento.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/tenants')}
          className="inline-flex items-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold text-foreground transition hover:bg-muted"
        >
          Voltar para Tenants
        </button>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Configurações Gerais</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Ajuste parâmetros de disponibilidade, janela máxima e fuso-horário do tenant.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={!settings || savingSettings}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingSettings ? 'Salvando...' : 'Salvar configurações'}
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-bold text-foreground">Ativar Agendamento</span>
              <input
                type="checkbox"
                checked={settings?.enabled ?? false}
                onChange={(event) => setSettingField('enabled', event.target.checked)}
                className="h-4 w-4"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-foreground">Aceitar pedidos agendados</span>
              <input
                type="checkbox"
                checked={settings?.acceptScheduledOrders ?? false}
                onChange={(event) => setSettingField('acceptScheduledOrders', event.target.checked)}
                className="h-4 w-4"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-foreground">Min. de antecedência (minutos)</span>
              <input
                type="number"
                min={0}
                value={settings?.minimumAdvanceMinutes ?? 60}
                onChange={(event) => setSettingField('minimumAdvanceMinutes', Number(event.target.value))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-foreground">Máximo de dias à frente</span>
              <input
                type="number"
                min={1}
                value={settings?.maximumAdvanceDays ?? 7}
                onChange={(event) => setSettingField('maximumAdvanceDays', Number(event.target.value))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-foreground">Intervalo de slots (minutos)</span>
              <input
                type="number"
                min={1}
                value={settings?.slotIntervalMinutes ?? 30}
                onChange={(event) => setSettingField('slotIntervalMinutes', Number(event.target.value))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-foreground">Capacidade por slot</span>
              <input
                type="number"
                min={1}
                value={settings?.maxOrdersPerSlot ?? 4}
                onChange={(event) => setSettingField('maxOrdersPerSlot', Number(event.target.value))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </label>

            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm font-bold text-foreground">Fuso horário</span>
              <select
                value={settings?.timezone ?? TIMEZONES[0]}
                onChange={(event) => setSettingField('timezone', event.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Slots & pré-visualização</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Gere manualmente slots e veja como eles estarão disponíveis ao público.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateSlots}
              disabled={generatingSlots}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generatingSlots ? 'Gerando...' : 'Gerar slots'}
            </button>
          </div>

          <div className="grid gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">Data de pré-visualização</label>
              <input
                type="date"
                value={previewDate}
                onChange={(event) => setPreviewDate(event.target.value)}
                onBlur={loadAvailableSlots}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </div>

            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-4 mb-3">
                <h3 className="text-sm font-semibold text-foreground">Slots disponíveis em {previewDate}</h3>
                <button
                  type="button"
                  onClick={loadAvailableSlots}
                  className="rounded-xl border border-border bg-card px-3 py-1 text-xs font-bold text-foreground transition hover:bg-muted"
                >
                  Atualizar
                </button>
              </div>
              {canShowSlotsPreview ? (
                availableSlots.length > 0 ? (
                  <div className="space-y-3">
                    {availableSlots.map((slot) => (
                      <div key={slot.id} className="rounded-2xl border border-border p-3 bg-card">
                        <div className="flex items-center justify-between gap-4 text-sm text-foreground">
                          <div>
                            <div>{new Date(slot.startTime).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(slot.startTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} - {new Date(slot.endTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {slot.availableCapacity}/{slot.totalCapacity} livres
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border p-4 text-sm text-muted-foreground bg-background">
                    Nenhum slot disponível encontrado para esta data.
                  </div>
                )
              ) : (
                <div className="rounded-2xl border border-border p-4 text-sm text-muted-foreground bg-background">
                  O agendamento está desativado ou não aceita pedidos agendados.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Janelas de Agendamento</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Defina dias da semana e horários onde devem ser gerados slots.
            </p>
          </div>
          <div className="space-y-2 sm:flex sm:items-center sm:gap-2 sm:space-y-0">
            <button
              type="button"
              onClick={() => {
                resetWindowForm();
                setEditingWindowId(null);
              }}
              className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
            >
              Novo horário
            </button>
            <button
              type="button"
              onClick={async () => {
                await handleGenerateSlots();
              }}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              Gerar slots agora
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
          <div className="rounded-3xl border border-border bg-background p-4">
            <div className="grid gap-4">
              <label className="space-y-2">
                <span className="text-sm font-bold text-foreground">Dia da semana</span>
                <select
                  value={windowForm.dayOfWeek}
                  onChange={(event) => setWindowForm((prev) => ({ ...prev, dayOfWeek: Number(event.target.value) }))}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                >
                  {DAY_NAMES.map((name, index) => (
                    <option key={name} value={index}>{name}</option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-bold text-foreground">Início</span>
                  <input
                    type="time"
                    value={windowForm.startTime}
                    onChange={(event) => setWindowForm((prev) => ({ ...prev, startTime: event.target.value }))}
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-bold text-foreground">Fim</span>
                  <input
                    type="time"
                    value={windowForm.endTime}
                    onChange={(event) => setWindowForm((prev) => ({ ...prev, endTime: event.target.value }))}
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </label>
              </div>

              <label className="flex items-center gap-3 text-sm font-bold text-foreground">
                <input
                  type="checkbox"
                  checked={windowForm.active}
                  onChange={(event) => setWindowForm((prev) => ({ ...prev, active: event.target.checked }))}
                  className="h-4 w-4"
                />
                Ativo
              </label>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveWindow}
                  disabled={savingWindow}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {editingWindowId ? 'Atualizar janela' : 'Adicionar janela'}
                </button>
                {editingWindowId ? (
                  <button
                    type="button"
                    onClick={resetWindowForm}
                    className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
                  >
                    Cancelar
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {windows.length === 0 ? (
              <div className="rounded-3xl border border-border bg-background p-6 text-sm text-muted-foreground">
                Nenhuma janela de agendamento configurada ainda.
              </div>
            ) : (
              <div className="space-y-3">
                {windows.map((window) => (
                  <div key={window.id} className="rounded-3xl border border-border bg-background p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{DAY_NAMES[window.dayOfWeek]}</div>
                        <div className="text-xs text-muted-foreground">
                          {window.startTime} - {window.endTime}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${window.active ? 'bg-emerald-500/10 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                          {window.active ? 'Ativo' : 'Inativo'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingWindowId(window.id);
                            setWindowForm({
                              dayOfWeek: window.dayOfWeek,
                              startTime: window.startTime,
                              endTime: window.endTime,
                              active: window.active,
                            });
                          }}
                          className="rounded-xl border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground transition hover:bg-muted"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteWindow(window.id)}
                          className="rounded-xl border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
