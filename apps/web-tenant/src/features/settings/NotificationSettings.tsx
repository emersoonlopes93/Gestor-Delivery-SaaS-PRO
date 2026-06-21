import { useState, useEffect, useRef } from 'react';
import { 
  Bell, 
  Save, 
  MessageSquare, 
  Info,
  Loader2,
  Volume2,
  VolumeX,
  Play,
  Smartphone
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';


import { useNotificationAudio, AVAILABLE_SOUNDS } from '../../hooks/useNotificationAudio';
import { Tenant, TenantSettings } from '@gestor/types';

const DEFAULT_TEMPLATES = {
  confirmed: '✅ Pedido #{{orderNumber}} confirmado! {{restaurantName}} já está preparando seu pedido.',
  preparing: '👨‍🍳 Pedido #{{orderNumber}} está sendo preparado por {{restaurantName}}. Já já sai!',
  ready: '📦 Pedido #{{orderNumber}} está pronto! Aguardando retirada/entregador.',
  out_for_delivery: '🛵 Pedido #{{orderNumber}} saiu para entrega! Fique atento.',
  completed: '🎉 Pedido #{{orderNumber}} foi entregue! Bom apetite! Obrigado por pedir no {{restaurantName}}.',
  cancelled: '❌ Pedido #{{orderNumber}} foi cancelado. Entre em contato com {{restaurantName}} para mais informações.',
};

export function NotificationSettings() {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(true);
  const [volume, setVolume] = useState(1.0);
  const [newOrderSound, setNewOrderSound] = useState<string>('notification.mp3');
  const [cancellationSound, setCancellationSound] = useState<string>('notification.mp3');
  const [handoffSound, setHandoffSound] = useState<string>('notification.mp3');
  const [readySound, setReadySound] = useState<string>('notification.mp3');
  const [templates, setTemplates] = useState<Record<string, string>>(DEFAULT_TEMPLATES);
  const templateRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const { data: settings, isLoading } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: async () => {
      const res = await api.get<Tenant & { settings: TenantSettings }>('/tenant/me');
      return res.data.settings;
    }
  });

  useEffect(() => {
    if (settings) {
      setEnabled(settings.whatsappNotificationsEnabled || false);
      if (settings.notificationTemplates) {
        setTemplates({ ...DEFAULT_TEMPLATES, ...settings.notificationTemplates });
      }
      setAudioEnabled(settings.audioNotificationEnabled ?? true);
      setBrowserNotificationsEnabled(settings.browserNotificationsEnabled ?? true);
      setVolume(settings.notificationVolume ?? 1.0);
      if (settings.newOrderSound) setNewOrderSound(settings.newOrderSound);
      if (settings.cancellationSound) setCancellationSound(settings.cancellationSound);
      if (settings.handoffSound) setHandoffSound(settings.handoffSound);
      if (settings.readySound) setReadySound(settings.readySound);
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return api.patch('/tenant/settings', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      toast.success('Configurações salvas com sucesso!', {
        duration: 3000,
        style: { fontWeight: 'bold' },
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Erro ao salvar configurações';
      toast.error(message, {
        duration: 4000,
        style: { fontWeight: 'bold' },
      });
    }
  });

  const handleSave = () => {
    mutation.mutate({
      whatsappNotificationsEnabled: enabled,
      notificationTemplates: templates,
      audioNotificationEnabled: audioEnabled,
      browserNotificationsEnabled,
      notificationVolume: volume,
      newOrderSound,
      cancellationSound,
      handoffSound,
      readySound,
    });
  };

  // Usa o hook central para testar os sons (mesma lógica do AppLayout, sem duplicar)
  const { playTestNewOrder, playTestCancellation, playTestHandoff, playTestReady } = useNotificationAudio(undefined, {
    enabled: false, // socket desativado nesta instância (apenas para acesso aos helpers de teste)
    volume,
    newOrderSound,
    cancellationSound,
    handoffSound,
    readySound,
  });

  const handleTestNewOrder = () => {
    console.log('[Test] Playing new order sound:', { volume, newOrderSound });
    playTestNewOrder().catch(() => {
      toast.error('Clique na página primeiro para permitir o áudio do navegador!', {
        duration: 4000,
        style: { fontWeight: 'bold' },
      });
    });
  };

  const handleTestCancellation = () => {
    console.log('[Test] Playing cancellation sound:', { volume, cancellationSound });
    playTestCancellation().catch(() => {
      toast.error('Clique na página primeiro para permitir o áudio do navegador!', {
        duration: 4000,
        style: { fontWeight: 'bold' },
      });
    });
  };

  const handleTestHandoff = () => {
    console.log('[Test] Playing handoff sound:', { volume, handoffSound });
    playTestHandoff().catch(() => {
      toast.error('Clique na página primeiro para permitir o áudio do navegador!', {
        duration: 4000,
        style: { fontWeight: 'bold' },
      });
    });
  };

  const handleTestReady = () => {
    console.log('[Test] Playing ready sound:', { volume, readySound });
    playTestReady().catch(() => {
      toast.error('Clique na página primeiro para permitir o áudio do navegador!', {
        duration: 4000,
        style: { fontWeight: 'bold' },
      });
    });
  };

  const insertTemplateVariable = (status: string, variable: string) => {
    const textarea = templateRefs.current[status];
    setTemplates(prev => {
      const current = prev[status] ?? '';
      if (!textarea) {
        return { ...prev, [status]: `${current}${current ? ' ' : ''}${variable}` };
      }

      const start = textarea.selectionStart ?? current.length;
      const end = textarea.selectionEnd ?? current.length;
      const nextValue = `${current.slice(0, start)}${variable}${current.slice(end)}`;

      window.requestAnimationFrame(() => {
        textarea.focus();
        const nextCursor = start + variable.length;
        textarea.setSelectionRange(nextCursor, nextCursor);
      });

      return { ...prev, [status]: nextValue };
    });
  };

  if (isLoading) return (
    <div className="p-12 flex justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
    </div>
  );

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-5xl mx-auto animate-in fade-in duration-500">
      <header className="mb-4 sm:mb-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-black text-foreground flex items-center gap-2 sm:gap-3">
            <div className="p-2 bg-emerald-600 rounded-xl text-white shadow-lg shadow-emerald-600/20">
              <MessageSquare className="w-6 h-6" />
            </div>
            Notificações WhatsApp
          </h1>
          <p className="text-xs sm:text-base text-muted-foreground mt-1 font-medium leading-relaxed">
            Configure o envio automático de mensagens de status para seus clientes.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="w-full lg:w-auto min-w-[160px] justify-center bg-primary text-primary-foreground hover:bg-primary/90 px-4 sm:px-8 py-2.5 sm:py-3 rounded-2xl flex items-center gap-2 shadow-xl disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed font-semibold transition-colors"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {mutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </header>

      <div className="space-y-6 sm:space-y-8">
        {/* Toggle Principal */}
        <section className="bg-card rounded-3xl border border-border p-3 sm:p-6 lg:p-8 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`p-2.5 rounded-2xl transition-colors ${enabled ? 'bg-status-success/10 text-status-success' : 'bg-muted text-muted-foreground'}`}>
                <Bell className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-black text-foreground">Status das Notificações</h2>
                <p className="text-sm text-muted-foreground font-medium leading-relaxed">Ative para enviar mensagens automaticamente conforme o pedido avança.</p>
              </div>
            </div>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`w-14 h-8 rounded-full border transition-colors duration-300 relative shrink-0 ${enabled ? 'bg-primary border-primary' : 'bg-muted border-border'}`}
            >
              <div className={`absolute top-[3px] w-6 h-6 rounded-full bg-white shadow-sm transition-all duration-300 ${enabled ? 'right-1' : 'left-1'}`} />
              <span className="sr-only">{enabled ? 'Notificações ativadas' : 'Notificações desativadas'}</span>
            </button>
          </div>
        </section>

        {/* Notificações Sonoras */}
        <section className="bg-card rounded-3xl border border-border p-3 sm:p-6 lg:p-8 shadow-sm">
           <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-8">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`p-2.5 rounded-2xl transition-colors ${audioEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                {audioEnabled ? <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" /> : <VolumeX className="w-5 h-5 sm:w-6 sm:h-6" />}
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-black text-foreground">Alertas Sonoros</h2>
                <p className="text-sm text-muted-foreground font-medium leading-relaxed">Toque um som sempre que um novo pedido chegar.</p>
              </div>
            </div>
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`w-14 h-8 rounded-full border transition-colors duration-300 relative shrink-0 ${audioEnabled ? 'bg-primary border-primary' : 'bg-muted border-border'}`}
            >
              <div className={`absolute top-[3px] w-6 h-6 rounded-full bg-white shadow-sm transition-all duration-300 ${audioEnabled ? 'right-1' : 'left-1'}`} />
              <span className="sr-only">{audioEnabled ? 'Alertas sonoros ativados' : 'Alertas sonoros desativados'}</span>
            </button>
          </div>

          <div className={`space-y-4 sm:space-y-6 transition-opacity ${audioEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
            <div className="flex flex-col gap-1.5 sm:gap-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black uppercase tracking-widest text-foreground">Volume do Alerta</label>
                <span className="text-xs font-bold text-foreground">{Math.round(volume * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0" max="1" step="0.1" 
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            {/* Seletor de som — Novo Pedido */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-1.5 sm:space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-foreground">Som de Novo Pedido</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={newOrderSound}
                    onChange={(e) => setNewOrderSound(e.target.value)}
                    className="input-premium flex-1 min-w-0"
                  >
                    {AVAILABLE_SOUNDS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleTestNewOrder}
                    title="Testar som de novo pedido"
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-2.5 py-2.5 sm:px-3 sm:py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl font-bold text-xs hover:bg-primary/20 transition-all active:scale-95 animate-pulse"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Testar
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-foreground">Som de Cancelamento</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={cancellationSound}
                    onChange={(e) => setCancellationSound(e.target.value)}
                    className="input-premium flex-1 min-w-0"
                  >
                    {AVAILABLE_SOUNDS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleTestCancellation}
                    title="Testar som de cancelamento"
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-2.5 py-2.5 sm:px-3 sm:py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl font-bold text-xs hover:bg-primary/20 transition-all active:scale-95 animate-pulse"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Testar
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-foreground">Som de Transferência (IA→Agente)</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={handoffSound}
                    onChange={(e) => setHandoffSound(e.target.value)}
                    className="input-premium flex-1 min-w-0"
                  >
                    {AVAILABLE_SOUNDS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleTestHandoff}
                    title="Testar som de transferência"
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-2.5 py-2.5 sm:px-3 sm:py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl font-bold text-xs hover:bg-primary/20 transition-all active:scale-95 animate-pulse"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Testar
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-foreground">Som de Pedido Pronto</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={readySound}
                    onChange={(e) => setReadySound(e.target.value)}
                    className="input-premium flex-1 min-w-0"
                  >
                    {AVAILABLE_SOUNDS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleTestReady}
                    title="Testar som de pedido pronto"
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-2.5 py-2.5 sm:px-3 sm:py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl font-bold text-xs hover:bg-primary/20 transition-all active:scale-95 animate-pulse"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Testar
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Browser Notifications */}
          <div className="border-t border-border pt-4 sm:pt-6 mt-4 sm:mt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3 sm:gap-4">
                <div className={`p-2.5 rounded-2xl transition-colors ${browserNotificationsEnabled ? 'bg-blue-600/10 text-blue-600' : 'bg-muted text-muted-foreground'}`}>
                  <Smartphone className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-foreground">Notificações do Navegador</h3>
                  <p className="text-[11px] sm:text-xs text-muted-foreground font-medium leading-relaxed">Receba alertas mesmo em outras abas ou com o navegador minimizado</p>
                </div>
              </div>
              <button
                onClick={() => setBrowserNotificationsEnabled(!browserNotificationsEnabled)}
                className={`w-14 h-8 rounded-full border transition-colors duration-300 relative shrink-0 ${browserNotificationsEnabled ? 'bg-primary border-primary' : 'bg-muted border-border'}`}
              >
                <div className={`absolute top-[3px] w-6 h-6 rounded-full bg-white shadow-sm transition-all duration-300 ${browserNotificationsEnabled ? 'right-1' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </section>

        {/* Templates */}
        <section className={`transition-opacity duration-300 ${enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
          <div className="flex items-center gap-2 mb-4 sm:mb-6">
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Personalização de Mensagens</h2>
            <div className="h-px flex-1 bg-muted" />
          </div>

          <div className="grid gap-4 sm:gap-6">
            {Object.entries(templates).map(([status, content]) => (
              <div key={status} className="bg-card rounded-3xl border border-border p-4 sm:p-6 shadow-sm hover:border-emerald-500/30 transition-all">
                <div className="flex items-center justify-between mb-3 sm:mb-4 gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-status-success" />
                    <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">{status.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="flex gap-2 flex-wrap justify-end">
                     <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertTemplateVariable(status, '{{orderNumber}}')} className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-1 rounded hover:text-primary transition-colors">{"{{orderNumber}}"}</button>
                     <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertTemplateVariable(status, '{{restaurantName}}')} className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-1 rounded hover:text-primary transition-colors">{"{{restaurantName}}"}</button>
                  </div>
                </div>
                <textarea
                  ref={(el) => { templateRefs.current[status] = el; }}
                  value={content}
                  onChange={(e) => setTemplates(prev => ({ ...prev, [status]: e.target.value }))}
                  className="w-full bg-muted/50 border border-border rounded-2xl p-3 sm:p-4 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition-all min-h-[88px] sm:min-h-[100px]"
                  placeholder="Digite a mensagem..."
                />
              </div>
            ))}
          </div>
        </section>

        {/* Info Box */}
        <div className="bg-primary/5 border border-primary/20 p-4 sm:p-6 rounded-3xl flex gap-3 sm:gap-4 text-foreground">
          <Info className="w-5 h-5 sm:w-6 sm:h-6 text-primary-600 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-primary-800 dark:text-primary-400 leading-relaxed font-medium">
            <strong>Como funciona?</strong> As variáveis em chaves duplas como <code>{"{{orderNumber}}"}</code> serão substituídas automaticamente pelos dados reais do pedido antes do envio. Certifique-se de que sua instância de WhatsApp está conectada para que os disparos ocorram.
          </div>
        </div>
      </div>
    </div>
  );
}
