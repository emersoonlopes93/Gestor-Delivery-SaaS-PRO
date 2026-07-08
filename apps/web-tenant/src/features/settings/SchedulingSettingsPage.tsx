import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api-client';
import { CalendarClock, Plus, Trash2, Save, Loader2, Play } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';

interface TenantSchedulingSettings {
  id: string;
  enabled: boolean;
  acceptScheduledOrders: boolean;
  allowScheduleWhenClosed: boolean;
  minimumAdvanceMinutes: number;
  maximumAdvanceDays: number;
  slotIntervalMinutes: number;
  maxOrdersPerSlot: number;
  timezone: string;
}

interface TenantSchedulingWindow {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  active: boolean;
}

const DAY_NAMES = [
  'Domingo', 'Segunda-feira', 'Terca-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sabado',
];

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message) {
    return error.message;
  }
  return fallback;
}

export function SchedulingSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settings, setSettings] = useState<Partial<TenantSchedulingSettings>>({
    enabled: false,
    acceptScheduledOrders: true,
    allowScheduleWhenClosed: false,
    minimumAdvanceMinutes: 60,
    maximumAdvanceDays: 7,
    slotIntervalMinutes: 30,
    maxOrdersPerSlot: 4,
    timezone: 'America/Sao_Paulo',
  });

  const [windows, setWindows] = useState<Partial<TenantSchedulingWindow>[]>([]);
  const [savingWindows, setSavingWindows] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    void fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resSettings, resWindows] = await Promise.all([
        api.get<TenantSchedulingSettings>('/scheduling/settings'),
        api.get<TenantSchedulingWindow[]>('/scheduling/windows'),
      ]);

      if (resSettings.success && resSettings.data) {
        setSettings(resSettings.data);
      }

      if (resWindows.success && resWindows.data) {
        setWindows(resWindows.data);
      }
    } catch (error) {
      console.error('Erro ao buscar dados de agendamento', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await api.put('/scheduling/settings', {
        enabled: Boolean(settings.enabled),
        acceptScheduledOrders: Boolean(settings.acceptScheduledOrders),
        allowScheduleWhenClosed: Boolean(settings.allowScheduleWhenClosed),
        minimumAdvanceMinutes: Number(settings.minimumAdvanceMinutes),
        maximumAdvanceDays: Number(settings.maximumAdvanceDays),
        slotIntervalMinutes: Number(settings.slotIntervalMinutes),
        maxOrdersPerSlot: Number(settings.maxOrdersPerSlot),
        timezone: settings.timezone ?? 'America/Sao_Paulo',
      });
      if (res.success) {
        alert('Configuracoes gerais salvas com sucesso!');
      }
    } catch (error) {
      alert(getErrorMessage(error, 'Erro ao salvar configuracoes.'));
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveWindow = async (index: number) => {
    const w = windows[index];
    if (!w.startTime || !w.endTime) {
      alert('Preencha os horarios corretamente.');
      return;
    }

    setSavingWindows(true);
    try {
      const payload = {
        dayOfWeek: Number(w.dayOfWeek),
        startTime: w.startTime,
        endTime: w.endTime,
        active: w.active ?? true,
      };

      if (w.id) {
        await api.put(`/scheduling/windows/${w.id}`, payload);
      } else {
        const res = await api.post<TenantSchedulingWindow>('/scheduling/windows', payload);
        if (res.success && res.data) {
          const newWindows = [...windows];
          newWindows[index] = res.data;
          setWindows(newWindows);
        }
      }
      alert('Janela de agendamento salva!');
    } catch (error) {
      alert(getErrorMessage(error, 'Erro ao salvar janela.'));
    } finally {
      setSavingWindows(false);
    }
  };

  const handleDeleteWindow = async (index: number) => {
    const w = windows[index];
    if (w.id) {
      try {
        await api.delete(`/scheduling/windows/${w.id}`);
      } catch (error) {
        alert(getErrorMessage(error, 'Erro ao excluir janela.'));
        return;
      }
    }
    const newWindows = [...windows];
    newWindows.splice(index, 1);
    setWindows(newWindows);
  };

  const addWindow = () => {
    setWindows([
      ...windows,
      {
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '18:00',
        active: true,
      },
    ]);
  };

  const handleGenerateSlots = async () => {
    setGenerating(true);
    try {
      const res = await api.post<{ success: boolean; resultCount: number }>('/scheduling/time-slots/auto-generate', {});
      if (res.success) {
        alert(`Slots de horario gerados com sucesso! ${res.data?.resultCount || 0} slots criados/atualizados.`);
      }
    } catch (error) {
      alert(getErrorMessage(error, 'Erro ao gerar slots manualmente. Verifique se as janelas estao configuradas corretamente.'));
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin text-primary-600 w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8 animate-in fade-in">
      <PageHeader
        title="Agendamentos de Pedidos"
        description="Configure como os clientes podem agendar pedidos na sua loja."
      />

      <div className={`bg-card rounded-2xl shadow-sm border p-6 transition-all ${settings.enabled ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl ${settings.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
              <CalendarClock className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Agendamentos Ativos</h2>
              <p className="text-sm text-muted-foreground font-medium">Permitir que os clientes escolham um horario de entrega/retirada futuro no Checkout.</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer scale-125">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={settings.enabled || false}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            />
            <div className="w-9 h-5 bg-input peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card rounded-2xl shadow-sm border border-border p-6 space-y-4">
          <h3 className="text-lg font-bold">Regras Gerais</h3>

          <div>
            <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Antecedencia Minima (Minutos)</label>
            <input
              type="number"
              min="0"
              value={settings.minimumAdvanceMinutes || 0}
              onChange={(e) => setSettings({ ...settings, minimumAdvanceMinutes: Number(e.target.value) })}
              className="input-premium w-full"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Tempo minimo para preparo do pedido antes do horario escolhido.</p>
          </div>

          <div>
            <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Maximo de Dias para Frente</label>
            <input
              type="number"
              min="1"
              max="30"
              value={settings.maximumAdvanceDays || 7}
              onChange={(e) => setSettings({ ...settings, maximumAdvanceDays: Number(e.target.value) })}
              className="input-premium w-full"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Quantos dias a frente o cliente pode visualizar na agenda.</p>
          </div>

          <div>
            <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Intervalo dos Slots (min)</label>
            <input
              type="number"
              min="1"
              value={settings.slotIntervalMinutes || 30}
              onChange={(e) => setSettings({ ...settings, slotIntervalMinutes: Number(e.target.value) })}
              className="input-premium w-full"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Duracao de cada horario gerado automaticamente.</p>
          </div>

          <div>
            <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Capacidade por Slot</label>
            <input
              type="number"
              min="1"
              value={settings.maxOrdersPerSlot || 4}
              onChange={(e) => setSettings({ ...settings, maxOrdersPerSlot: Number(e.target.value) })}
              className="input-premium w-full"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Quantidade maxima de pedidos aceitos por horario.</p>
          </div>

          <button
            onClick={handleSaveSettings}
            disabled={savingSettings}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold py-2.5 px-8 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-70 mt-4 flex items-center justify-center gap-2"
          >
            {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Regras
          </button>
        </div>

        <div className="bg-card rounded-2xl shadow-sm border border-border p-6 space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold">Geracao de Horarios (Slots)</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Os horarios visiveis para os clientes sao gerados automaticamente com base nas janelas configuradas abaixo.
              Sempre que voce alterar regras, o sistema reconstruira a agenda em background.
            </p>
          </div>

          <button
            onClick={handleGenerateSlots}
            disabled={generating}
            className="w-full bg-purple-600 text-white hover:bg-purple-700 font-bold py-2.5 px-8 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Forcar Geracao Agora
          </button>
        </div>
      </div>

      <div className="bg-card rounded-2xl shadow-sm border border-border p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold">Janelas de Disponibilidade</h3>
            <p className="text-sm text-muted-foreground">Configure os dias e blocos de horarios em que aceita agendamentos.</p>
          </div>
          <button
            onClick={addWindow}
            className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-bold rounded-xl transition-all"
          >
            <Plus className="w-4 h-4" />
            Nova Janela
          </button>
        </div>

        <div className="space-y-4">
          {windows.map((w, index) => (
            <div key={w.id || index} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-background p-4 rounded-xl border border-border">
              <div className="md:col-span-3">
                <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-1">Dia da Semana</label>
                <select
                  value={w.dayOfWeek || 0}
                  onChange={(e) => {
                    const newWindows = [...windows];
                    newWindows[index].dayOfWeek = Number(e.target.value);
                    setWindows(newWindows);
                  }}
                  className="input-premium w-full py-2"
                >
                  {DAY_NAMES.map((name, i) => <option key={i} value={i}>{name}</option>)}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-1">Inicio</label>
                <input
                  type="time"
                  value={w.startTime || ''}
                  onChange={(e) => {
                    const newWindows = [...windows];
                    newWindows[index].startTime = e.target.value;
                    setWindows(newWindows);
                  }}
                  className="input-premium w-full py-2"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-1">Fim</label>
                <input
                  type="time"
                  value={w.endTime || ''}
                  onChange={(e) => {
                    const newWindows = [...windows];
                    newWindows[index].endTime = e.target.value;
                    setWindows(newWindows);
                  }}
                  className="input-premium w-full py-2"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-1">Ativa</label>
                <label className="flex h-[42px] items-center gap-3 rounded-xl border border-border bg-card px-3">
                  <input
                    type="checkbox"
                    checked={w.active ?? true}
                    onChange={(e) => {
                      const newWindows = [...windows];
                      newWindows[index].active = e.target.checked;
                      setWindows(newWindows);
                    }}
                  />
                  <span className="text-sm font-bold text-foreground">{w.active ?? true ? 'Sim' : 'Nao'}</span>
                </label>
              </div>

              <div className="md:col-span-3 flex items-center justify-end gap-2 pb-1">
                <button
                  onClick={() => handleSaveWindow(index)}
                  disabled={savingWindows}
                  className="p-2 text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
                  title="Salvar Janela"
                >
                  <Save className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteWindow(index)}
                  className="p-2 text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-lg transition-colors"
                  title="Excluir Janela"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {windows.length === 0 && (
            <div className="text-center py-8 text-muted-foreground bg-muted/30 rounded-xl border border-dashed border-border">
              Nenhuma janela de agendamento configurada.<br /> Clique em "Nova Janela" para comecar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
