import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';

/** Sons disponíveis (devem existir em public/sounds/) */
export const AVAILABLE_SOUNDS = [
  { value: 'notification.mp3', label: 'Notificação (Padrão)' },
  { value: 'Microsoft-Teams.mp3', label: 'Microsoft Teams' },
  { value: 'Novo Pedido (H).mp3', label: 'Novo Pedido (Voz Masculina)' },
  { value: 'Novo Pedido (M).mp3', label: 'Novo Pedido (Voz Feminina)' },
  { value: 'Pedido Pronto (H).mp3', label: 'Pedido Pronto (Voz Masculina)' },
  { value: 'Pedido Pronto (M).mp3', label: 'Pedido Pronto (Voz Feminina)' },
  { value: 'pedido de cancelamento(H).mp3', label: 'Pedido de Cancelamento (Voz Masculina)' },
  { value: 'pedido de cancelamento(M).mp3', label: 'Pedido de Cancelamento (Voz Feminina)' },
  { value: 'transferindo para atendente (H).mp3', label: 'Transferindo para Atendente (Voz Masculina)' },
] as const;

export type SoundFile = typeof AVAILABLE_SOUNDS[number]['value'];

const DEFAULT_NEW_ORDER_SOUND: SoundFile = 'notification.mp3';
const DEFAULT_CANCELLATION_SOUND: SoundFile = 'notification.mp3';
const DEFAULT_HANDOFF_SOUND: SoundFile = 'notification.mp3';
const DEFAULT_READY_SOUND: SoundFile = 'notification.mp3';

function buildSoundUrl(filename: string | undefined, fallback: SoundFile): string {
  if (!filename) {
    return `/sounds/${fallback}`;
  }
  const name = filename.trim();
  if (name === '' || name === 'undefined') {
    return `/sounds/${fallback}`;
  }
  if (!AVAILABLE_SOUNDS.some((s) => s.value === name)) {
    console.warn(`[Audio] Invalid sound: "${name}", using fallback: "${fallback}"`);
    return `/sounds/${fallback}`;
  }
  return `/sounds/${name}`;
}

function playAudio(url: string, volume: number): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const audio = new Audio(url);
      const validVolume = Math.max(0, Math.min(1, volume || 1.0));
      audio.volume = validVolume;
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log(`[Audio] Playing: ${url} (volume: ${Math.round(validVolume * 100)}%)`);
            resolve();
          })
          .catch((err) => {
            console.warn(`[Audio] Play error for ${url}:`, err);
            reject(err);
          });
      } else {
        console.log(`[Audio] Playing: ${url} (volume: ${Math.round(validVolume * 100)}%)`);
        resolve();
      }
    } catch (err) {
      console.error(`[Audio] Error creating audio element:`, err);
      reject(err);
    }
  });
}

interface AudioSettings {
  enabled: boolean;
  volume: number;
  newOrderSound?: string;
  cancellationSound?: string;
  handoffSound?: string;
  readySound?: string;
}

export function useNotificationAudio(tenantId: string | undefined, settings: AudioSettings) {
  const socketRef = useRef<Socket | null>(null);

  const newOrderUrl = buildSoundUrl(settings.newOrderSound, DEFAULT_NEW_ORDER_SOUND);
  const cancelledUrl = buildSoundUrl(settings.cancellationSound, DEFAULT_CANCELLATION_SOUND);
  const handoffUrl = buildSoundUrl(settings.handoffSound, DEFAULT_HANDOFF_SOUND);
  const readyUrl = buildSoundUrl(settings.readySound, DEFAULT_READY_SOUND);

  // Refs para que o socket handler sempre acesse os valores atualizados sem re-subscribe
  const settingsRef = useRef(settings);
  const newOrderUrlRef = useRef(newOrderUrl);
  const cancelledUrlRef = useRef(cancelledUrl);
  const handoffUrlRef = useRef(handoffUrl);
  const readyUrlRef = useRef(readyUrl);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { newOrderUrlRef.current = newOrderUrl; }, [newOrderUrl]);
  useEffect(() => { cancelledUrlRef.current = cancelledUrl; }, [cancelledUrl]);
  useEffect(() => { handoffUrlRef.current = handoffUrl; }, [handoffUrl]);
  useEffect(() => { readyUrlRef.current = readyUrl; }, [readyUrl]);

  useEffect(() => {
    if (!tenantId || !settings.enabled) {
      if (socketRef.current) {
        console.log('[Websocket] Disconnecting orders namespace');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333';
    const socketUrl = API_URL.replace(/\/api\/v1\/?$/, '').replace(/\/api\/?$/, '');
    console.log(`[Websocket] Connecting to orders namespace at: ${socketUrl}/orders`);
    
    const socket = io(`${socketUrl}/orders`, {
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      console.log('[Websocket] Connected to orders namespace');
      socket.emit('joinTenant', { tenantId });
    });

    socket.on('connect_error', (error) => {
      console.error('[Websocket] Connection error:', error);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[Websocket] Disconnected:', reason);
    });

    socket.on('newOrder', (data: { order: { orderNumber: string; customerName: string; total: number } }) => {
      console.log('[Websocket] Novo pedido recebido!', data);

      if (settingsRef.current.enabled) {
        playAudio(newOrderUrlRef.current, settingsRef.current.volume).catch((err) => {
          console.warn('[Audio] Falha ao reproduzir som de novo pedido:', err);
        });
      }

      const totalFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.order.total);
      toast.success(`🛵 Novo Pedido #${data.order.orderNumber}\n${data.order.customerName} — ${totalFmt}`, {
        duration: 8000,
        style: { fontWeight: 'bold', maxWidth: '340px' },
      });

      if (Notification.permission === 'granted') {
        new Notification(`Novo Pedido ${data.order.orderNumber}`, {
          body: `Cliente: ${data.order.customerName}\nTotal: ${totalFmt}`,
          icon: '/favicon.ico',
        });
      }
    });

    socket.on('orderCancelled', (data: { orderNumber?: string }) => {
      console.log('[Websocket] Pedido cancelado!', data);
      if (settingsRef.current.enabled) {
        playAudio(cancelledUrlRef.current, settingsRef.current.volume).catch((err) => {
          console.warn('[Audio] Falha ao reproduzir som de cancelamento:', err);
        });
      }
      toast.error(`❌ Pedido${data.orderNumber ? ` #${data.orderNumber}` : ''} cancelado!`, {
        duration: 7000,
        style: { fontWeight: 'bold' },
      });
    });

    // IA Handoff: Transfer to human agent
    socket.on('aiHandoff', (data: { sessionId: string; sessionName?: string; customerName?: string }) => {
      console.log('[Websocket] IA Handoff - Transferência para atendente humano!', data);
      if (settingsRef.current.enabled) {
        playAudio(handoffUrlRef.current, settingsRef.current.volume).catch((err) => {
          console.warn('[Audio] Falha ao reproduzir som de transferência:', err);
        });
      }
      toast(`👤 Transferência: Chat #${data.sessionId}\n${data.customerName || 'Cliente'} aguardando atendimento humano`, {
        duration: 7000,
        style: { fontWeight: 'bold' },
      });

      if (Notification.permission === 'granted') {
        new Notification('Transferência de Atendimento', {
          body: `${data.customerName || 'Cliente'} aguardando atendimento humano.\nSessão: #${data.sessionId}`,
          icon: '/favicon.ico',
          tag: `handoff-${data.sessionId}`,
        });
      }
    });

    // Order Ready: Order marked as ready for pickup/delivery
    socket.on('orderReady', (data: { orderNumber: string; customerName?: string; fulfillmentType?: string }) => {
      console.log('[Websocket] Pedido Pronto!', data);
      if (settingsRef.current.enabled) {
        playAudio(readyUrlRef.current, settingsRef.current.volume).catch((err) => {
          console.warn('[Audio] Falha ao reproduzir som de pedido pronto:', err);
        });
      }

      const fulfillmentText = data.fulfillmentType === 'delivery' ? 'para entrega' : 'para retirada';
      toast.success(`📦 Pedido #${data.orderNumber} está pronto ${fulfillmentText}!`, {
        duration: 7000,
        style: { fontWeight: 'bold' },
      });

      if (Notification.permission === 'granted') {
        new Notification(`Pedido #${data.orderNumber} Pronto`, {
          body: `${data.customerName || 'Cliente'} — Pedido está pronto ${fulfillmentText}`,
          icon: '/favicon.ico',
          tag: `ready-${data.orderNumber}`,
        });
      }
    });

    socketRef.current = socket;

    return () => {
      if (socketRef.current) {
        console.log('[Websocket] Cleaning up socket connection');
        socketRef.current.disconnect();
      }
    };
  // Re-subscribe apenas quando tenantId ou enabled muda — volume/som são lidos por ref
  }, [tenantId, settings.enabled]);

  const requestPermission = useCallback(() => {
    if (typeof Notification !== 'undefined') {
      Notification.requestPermission();
    }
  }, []);

  /** Testa o som de novo pedido com o volume e som actuais */
  const playTestNewOrder = useCallback(() => {
    return playAudio(newOrderUrlRef.current, settingsRef.current.volume);
  }, []);

  /** Testa o som de cancelamento com o volume e som actuais */
  const playTestCancellation = useCallback(() => {
    return playAudio(cancelledUrlRef.current, settingsRef.current.volume);
  }, []);

  /** Testa o som de transferência IA */
  const playTestHandoff = useCallback(() => {
    return playAudio(handoffUrlRef.current, settingsRef.current.volume);
  }, []);

  /** Testa o som de pedido pronto */
  const playTestReady = useCallback(() => {
    return playAudio(readyUrlRef.current, settingsRef.current.volume);
  }, []);

  return { requestPermission, playTestNewOrder, playTestCancellation, playTestHandoff, playTestReady };
}
