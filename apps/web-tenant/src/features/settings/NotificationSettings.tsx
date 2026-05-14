import { useState, useEffect } from 'react';
import { 
  Bell, 
  Save, 
  MessageSquare, 
  Info,
  Loader2,
  Volume2,
  VolumeX,
  Play
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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
  const [volume, setVolume] = useState(1.0);
  const [templates, setTemplates] = useState<Record<string, string>>(DEFAULT_TEMPLATES);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['tenant-settings-notifications'],
    queryFn: async () => {
      const res = await api.get<any>('/tenant/me');
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
      setVolume(settings.notificationVolume ?? 1.0);
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      return api.patch('/tenant/settings', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings-notifications'] });
      alert('Configurações salvas com sucesso!');
    }
  });

  const handleSave = () => {
    mutation.mutate({
      whatsappNotificationsEnabled: enabled,
      notificationTemplates: templates,
      audioNotificationEnabled: audioEnabled,
      notificationVolume: volume,
    });
  };

  const handleTestSound = () => {
    const audio = new Audio('/sounds/new-order.mp3');
    audio.volume = volume;
    audio.play().catch(() => alert('Clique na página primeiro para permitir o áudio!'));
  };

  if (isLoading) return (
    <div className="p-12 flex justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
    </div>
  );

  return (
    <div className="p-8 max-w-4xl mx-auto animate-in fade-in duration-500">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-3">
            <div className="p-2 bg-emerald-600 rounded-xl text-white shadow-lg shadow-emerald-600/20">
              <MessageSquare className="w-6 h-6" />
            </div>
            Notificações WhatsApp
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 font-medium">
            Configure o envio automático de mensagens de status para seus clientes.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="btn-primary px-8 py-3 rounded-2xl flex items-center gap-2 shadow-xl"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar Alterações
        </button>
      </header>

      <div className="space-y-8">
        {/* Toggle Principal */}
        <section className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-8 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex gap-4">
              <div className={`p-3 rounded-2xl transition-colors ${enabled ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                <Bell className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-black text-gray-900 dark:text-gray-100">Status das Notificações</h2>
                <p className="text-sm text-gray-500 font-medium">Ative para enviar mensagens automaticamente conforme o pedido avança.</p>
              </div>
            </div>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`w-14 h-8 rounded-full relative transition-colors duration-300 ${enabled ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-800'}`}
            >
              <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-sm transition-all duration-300 ${enabled ? 'right-1' : 'left-1'}`} />
            </button>
          </div>
        </section>

        {/* Notificações Sonoras */}
        <section className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-8 shadow-sm">
           <div className="flex items-center justify-between mb-8">
            <div className="flex gap-4">
              <div className={`p-3 rounded-2xl transition-colors ${audioEnabled ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-400'}`}>
                {audioEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
              </div>
              <div>
                <h2 className="text-lg font-black text-gray-900 dark:text-gray-100">Alertas Sonoros</h2>
                <p className="text-sm text-gray-500 font-medium">Toque um som sempre que um novo pedido chegar.</p>
              </div>
            </div>
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`w-14 h-8 rounded-full relative transition-colors duration-300 ${audioEnabled ? 'bg-primary-500' : 'bg-gray-200 dark:bg-gray-800'}`}
            >
              <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-sm transition-all duration-300 ${audioEnabled ? 'right-1' : 'left-1'}`} />
            </button>
          </div>

          <div className={`space-y-6 transition-opacity ${audioEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black uppercase tracking-widest text-gray-400">Volume do Alerta</label>
                <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{Math.round(volume * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0" max="1" step="0.1" 
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-primary-600"
              />
            </div>

            <div className="flex items-center gap-4">
              <button 
                onClick={handleTestSound}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-xs hover:bg-gray-200 transition-all"
              >
                <Play className="w-4 h-4" />
                Testar Som de Novo Pedido
              </button>
            </div>
          </div>
        </section>

        {/* Templates */}
        <section className={`transition-opacity duration-300 ${enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
          <div className="flex items-center gap-2 mb-6">
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-400">Personalização de Mensagens</h2>
            <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
          </div>

          <div className="grid gap-6">
            {Object.entries(templates).map(([status, content]) => (
              <div key={status} className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm hover:border-emerald-500/30 transition-all">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-black uppercase tracking-widest text-gray-500">{status.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="flex gap-2">
                     <span className="text-[10px] font-bold text-gray-400 bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">{"{{orderNumber}}"}</span>
                     <span className="text-[10px] font-bold text-gray-400 bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">{"{{restaurantName}}"}</span>
                  </div>
                </div>
                <textarea
                  value={content}
                  onChange={(e) => setTemplates(prev => ({ ...prev, [status]: e.target.value }))}
                  className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition-all min-h-[100px]"
                  placeholder="Digite a mensagem..."
                />
              </div>
            ))}
          </div>
        </section>

        {/* Info Box */}
        <div className="bg-primary-50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/30 p-6 rounded-3xl flex gap-4">
          <Info className="w-6 h-6 text-primary-600 shrink-0" />
          <div className="text-sm text-primary-800 dark:text-primary-400 leading-relaxed font-medium">
            <strong>Como funciona?</strong> As variáveis em chaves duplas como <code>{"{{orderNumber}}"}</code> serão substituídas automaticamente pelos dados reais do pedido antes do envio. Certifique-se de que sua instância de WhatsApp está conectada para que os disparos ocorram.
          </div>
        </div>
      </div>
    </div>
  );
}
