import { useEffect, useRef, useState, useCallback } from 'react';
import type { OrderBoardItemDTO } from '@gestor/types';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api-client';
import { Tenant, TenantSettings } from '@gestor/types';

export function useOrderNotifications(orders: OrderBoardItemDTO[]) {
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [isInteractionAllowed, setIsInteractionAllowed] = useState(false);
  const prevOrdersRef = useRef<OrderBoardItemDTO[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch tenant settings to respect user's audio configuration
  const { data: tenantSettings } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: async () => {
      const res = await api.get<Tenant & { settings: TenantSettings }>('/tenant/me');
      return res.data.settings;
    },
    staleTime: 1000 * 60 * 5,
  });

  // Refs to track current settings
  const settingsRef = useRef(tenantSettings);
  useEffect(() => {
    settingsRef.current = tenantSettings;
  }, [tenantSettings]);

  useEffect(() => {
    // Initialize audio with configured sound
    const soundFile = settingsRef.current?.newOrderSound || 'notification.mp3';
    const volume = Math.max(0, Math.min(1, settingsRef.current?.notificationVolume ?? 1.0));
    
    audioRef.current = new Audio(`/sounds/${soundFile}`);
    audioRef.current.volume = volume;
    
    console.log(`[useOrderNotifications] Audio initialized: ${soundFile} (volume: ${Math.round(volume * 100)}%)`);
    
    // Check if user has already interacted to enable audio
    const checkInteraction = () => {
      setIsInteractionAllowed(true);
      window.removeEventListener('click', checkInteraction);
    };
    window.addEventListener('click', checkInteraction);
    
    return () => window.removeEventListener('click', checkInteraction);
  }, []);

  const playNotification = useCallback(() => {
    // Only play if audio is enabled in settings AND user has interacted
    if (settingsRef.current?.audioNotificationEnabled && isInteractionAllowed && audioRef.current) {
      // Update volume in case it changed
      audioRef.current.volume = Math.max(0, Math.min(1, settingsRef.current?.notificationVolume ?? 1.0));
      
      audioRef.current.play().catch(err => {
        console.warn('[useOrderNotifications] Autoplay prevented:', err);
      });
    }
  }, [isInteractionAllowed]);

  useEffect(() => {
    if (prevOrdersRef.current.length === 0) {
      prevOrdersRef.current = orders;
      return;
    }

    const prevOrders = prevOrdersRef.current;
    
    // Check for NEW orders
    const newOrders = orders.filter(o => !prevOrders.some(prev => prev.id === o.id));
    if (newOrders.length > 0) {
      newOrders.forEach(order => {
        console.log('[useOrderNotifications] New order detected:', order.orderNumber);
        toast.success(`🔔 Novo pedido #${order.orderNumber}`, {
          duration: 8000,
          position: 'top-right',
        });
      });
      playNotification();
    }

    // Check for status changes
    orders.forEach(order => {
      const prevOrder = prevOrders.find(prev => prev.id === order.id);
      if (prevOrder && prevOrder.status !== order.status) {
        // Status changed
        if (order.status === 'cancelled') {
          console.log('[useOrderNotifications] Order cancelled:', order.orderNumber);
          toast.error(`❌ Pedido #${order.orderNumber} foi CANCELADO`, { duration: 6000 });
          playNotification();
        } else if (order.status === 'ready_for_delivery' || order.status === 'ready_for_pickup') {
          console.log('[useOrderNotifications] Order ready:', order.orderNumber);
          toast.success(`✅ Pedido #${order.orderNumber} está PRONTO!`, { duration: 6000 });
          playNotification();
        }
      }
    });

    prevOrdersRef.current = orders;
  }, [orders, playNotification]);

  const handleEnableAudio = useCallback(() => {
    if (!isInteractionAllowed) {
      setIsInteractionAllowed(true);
    }
    setIsAudioEnabled(prev => !prev);
    
    // If user enables audio on this page, save it to settings
    if (!isAudioEnabled && settingsRef.current) {
      api.patch('/tenant/settings', { audioNotificationEnabled: true }).catch(err => {
        console.warn('[useOrderNotifications] Failed to save audio setting:', err);
      });
    }
  }, [isAudioEnabled, isInteractionAllowed]);

  // Reflect the actual setting from tenant
  useEffect(() => {
    if (tenantSettings?.audioNotificationEnabled !== undefined) {
      setIsAudioEnabled(tenantSettings.audioNotificationEnabled);
    }
  }, [tenantSettings?.audioNotificationEnabled]);

  return {
    isAudioEnabled,
    enableAudio: handleEnableAudio
  };
}
