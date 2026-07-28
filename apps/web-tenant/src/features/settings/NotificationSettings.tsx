import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Save,
  MessageSquare,
  Info,
  Loader2,
  Volume2,
  VolumeX,
  Play,
  Smartphone,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Tenant, TenantSettings } from '@gestor/types';
import { useSoundManager } from '../../notifications/useSoundManager';

const DEFAULT_TEMPLATES = {
  confirmed: 'Pedido #{{orderNumber}} confirmado! {{restaurantName}} ja esta preparando seu pedido.',
  preparing: 'Pedido #{{orderNumber}} esta sendo preparado por {{restaurantName}}.',
  ready: 'Pedido #{{orderNumber}} esta pronto! Aguardando retirada/entregador.',
  out_for_delivery: 'Pedido #{{orderNumber}} saiu para entrega! Fique atento.',
  completed: 'Pedido #{{orderNumber}} foi entregue! Bom apetite! Obrigado por pedir no {{restaurantName}}.',
  cancelled: 'Pedido #{{orderNumber}} foi cancelado. Entre em contato com {{restaurantName}} para mais informacoes.',
};

export function NotificationSettings() {
  const queryClient = useQueryClient();
  const soundManager = useSoundManager();
  const [enabled, setEnabled] = useState(false);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(true);
  const [templates, setTemplates] = useState<Record<string, string>>(DEFAULT_TEMPLATES);
  const templateRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const { data: settings, isLoading } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: async () => {
      const res = await api.get<Tenant & { settings: TenantSettings }>('/tenant/me');
      return res.data.settings;
    },
  });

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.whatsappNotificationsEnabled || false);
    setBrowserNotificationsEnabled(settings.browserNotificationsEnabled ?? true);
    if (settings.notificationTemplates) {
      setTemplates({ ...DEFAULT_TEMPLATES, ...settings.notificationTemplates });
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => api.patch('/tenant/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      toast.success('Configuracoes salvas com sucesso!', {
        duration: 3000,
        style: { fontWeight: 'bold' },
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Erro ao salvar configuracoes';
      toast.error(message, {
        duration: 4000,
        style: { fontWeight: 'bold' },
      });
    },
  });

  const handleSave = () => {
    mutation.mutate({
      whatsappNotificationsEnabled: enabled,
      notificationTemplates: templates,
      browserNotificationsEnabled,
    });
  };

  const insertTemplateVariable = (status: string, variable: string) => {
    const textarea = templateRefs.current[status];
    setTemplates((prev) => {
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

  if (isLoading) {
    return (
      <div className="p-12 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-5xl mx-auto animate-in fade-in duration-500">
      <header className="mb-4 sm:mb-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-black text-foreground flex items-center gap-2 sm:gap-3">
            <div className="p-2 bg-emerald-600 rounded-xl text-white shadow-lg shadow-emerald-600/20">
              <MessageSquare className="w-6 h-6" />
            </div>
            Notificacoes
          </h1>
          <p className="text-xs sm:text-base text-muted-foreground mt-1 font-medium leading-relaxed">
            Configure mensagens automáticas do WhatsApp e os sons locais deste dispositivo.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="w-full lg:w-auto min-w-[160px] justify-center bg-primary text-primary-foreground hover:bg-primary/90 px-4 sm:px-8 py-2.5 sm:py-3 rounded-2xl flex items-center gap-2 shadow-xl disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed font-semibold transition-colors"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {mutation.isPending ? 'Salvando...' : 'Salvar alteracoes'}
        </button>
      </header>

      <div className="space-y-6 sm:space-y-8">
        <section className="bg-card rounded-3xl border border-border p-3 sm:p-6 lg:p-8 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`p-2.5 rounded-2xl transition-colors ${enabled ? 'bg-status-success/10 text-status-success' : 'bg-muted text-muted-foreground'}`}>
                <Bell className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-black text-foreground">Mensagens de status</h2>
                <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                  Ative para enviar mensagens automaticamente conforme o pedido avanca.
                </p>
              </div>
            </div>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`w-14 h-8 rounded-full border transition-colors duration-300 relative shrink-0 ${enabled ? 'bg-primary border-primary' : 'bg-muted border-border'}`}
            >
              <div className={`absolute top-[3px] w-6 h-6 rounded-full bg-white shadow-sm transition-all duration-300 ${enabled ? 'right-1' : 'left-1'}`} />
            </button>
          </div>
        </section>

        <section className="bg-card rounded-3xl border border-border p-3 sm:p-6 lg:p-8 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-8">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`p-2.5 rounded-2xl transition-colors ${soundManager.soundPreferenceEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                {soundManager.soundPreferenceEnabled ? <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" /> : <VolumeX className="w-5 h-5 sm:w-6 sm:h-6" />}
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-black text-foreground">Alertas sonoros</h2>
                <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                  Os sons do sistema sao personalizados por tipo de evento para garantir uma operacao consistente e clara.
                </p>
              </div>
            </div>
            <button
              onClick={() => soundManager.setSoundPreferenceEnabled(!soundManager.soundPreferenceEnabled)}
              aria-label={soundManager.soundPreferenceEnabled ? "Desativar notificacoes sonoras" : "Ativar notificacoes sonoras"}
              className={`w-14 h-8 rounded-full border transition-colors duration-300 relative shrink-0 ${soundManager.soundPreferenceEnabled ? 'bg-primary border-primary' : 'bg-muted border-border'}`}
            >
              <div className={`absolute top-[3px] w-6 h-6 rounded-full bg-white shadow-sm transition-all duration-300 ${soundManager.soundPreferenceEnabled ? 'right-1' : 'left-1'}`} />
            </button>
          </div>

          <div className={`space-y-4 sm:space-y-6 transition-opacity ${soundManager.soundPreferenceEnabled ? 'opacity-100' : 'opacity-50'}`}>
            <div className="flex flex-col gap-1.5 sm:gap-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black uppercase tracking-widest text-foreground">Volume neste dispositivo</label>
                <span className="text-xs font-bold text-foreground">{Math.round(soundManager.volume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                aria-label="Volume das notificacoes sonoras"
                value={soundManager.volume}
                onChange={(event) => soundManager.setVolume(parseFloat(event.target.value))}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
              <p className="text-sm font-bold text-foreground">Ativacao e teste</p>
              <p className="text-xs text-muted-foreground">
                Essas preferencias sao locais e ficam salvas apenas neste navegador/dispositivo.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                {soundManager.activationUiState !== 'ready' ? (
                  <button
                    type="button"
                    aria-label="Ativar notificacoes sonoras"
                    onClick={() => void soundManager.unlockAudio()}
                    disabled={!soundManager.soundPreferenceEnabled || soundManager.activationInProgress || soundManager.activationUiState === 'unavailable'}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-xs hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    {soundManager.activationInProgress ? 'Ativando sons...' : soundManager.activationError ? 'Tentar novamente' : 'Ativar sons'}
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label="Testar som"
                    onClick={() => void soundManager.testSound()}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl font-bold text-xs hover:bg-primary/20 transition-all active:scale-95"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Testar som
                  </button>
                )}
              </div>
              {soundManager.needsAudioUnlock ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700">
                  Ative as notificacoes sonoras para nao perder novos pedidos.
                </div>
              ) : null}
              {soundManager.activationError ? (
                <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground">
                  O navegador ainda nao liberou os sons. Tente novamente com uma interacao direta.
                </div>
              ) : null}
            </div>
          </div>

          <div className="border-t border-border pt-4 sm:pt-6 mt-4 sm:mt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3 sm:gap-4">
                <div className={`p-2.5 rounded-2xl transition-colors ${browserNotificationsEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  <Smartphone className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-foreground">Notificacoes do navegador</h3>
                  <p className="text-[11px] sm:text-xs text-muted-foreground font-medium leading-relaxed">
                    Receba alertas mesmo em outras abas ou com o navegador minimizado.
                  </p>
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

        <section className={`transition-opacity duration-300 ${enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
          <div className="flex items-center gap-2 mb-4 sm:mb-6">
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Personalizacao de mensagens</h2>
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
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertTemplateVariable(status, '{{orderNumber}}')} className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-1 rounded hover:text-primary transition-colors">{'{{orderNumber}}'}</button>
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertTemplateVariable(status, '{{restaurantName}}')} className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-1 rounded hover:text-primary transition-colors">{'{{restaurantName}}'}</button>
                  </div>
                </div>
                <textarea
                  ref={(element) => { templateRefs.current[status] = element; }}
                  value={content}
                  onChange={(event) => setTemplates((prev) => ({ ...prev, [status]: event.target.value }))}
                  className="w-full bg-muted/50 border border-border rounded-2xl p-3 sm:p-4 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition-all min-h-[88px] sm:min-h-[100px]"
                  placeholder="Digite a mensagem..."
                />
              </div>
            ))}
          </div>
        </section>

        <div className="bg-primary/5 border border-primary/20 p-4 sm:p-6 rounded-3xl flex gap-3 sm:gap-4 text-foreground">
          <Info className="w-5 h-5 sm:w-6 sm:h-6 text-primary-600 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-primary-800 dark:text-primary-400 leading-relaxed font-medium">
            <strong>Como funciona?</strong> As variaveis em chaves duplas como <code>{'{{orderNumber}}'}</code> sao substituidas automaticamente pelos dados reais do pedido antes do envio. Os alertas sonoros do sistema agora sao gerados internamente por evento, sem depender de arquivos de audio antigos.
          </div>
        </div>
      </div>
    </div>
  );
}
