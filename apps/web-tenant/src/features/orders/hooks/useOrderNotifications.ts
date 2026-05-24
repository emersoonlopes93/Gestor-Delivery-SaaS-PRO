import { useEffect, useRef, useState, useCallback } from 'react';
import type { OrderBoardItemDTO } from '@gestor/types';
import toast from 'react-hot-toast';

export function useOrderNotifications(orders: OrderBoardItemDTO[]) {
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const prevOrdersRef = useRef<OrderBoardItemDTO[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Initialize audio object
    audioRef.current = new Audio('/sounds/notification.mp3');
    
    // Check if user has already interacted to enable audio
    const checkInteraction = () => {
      setIsAudioEnabled(true);
      window.removeEventListener('click', checkInteraction);
    };
    window.addEventListener('click', checkInteraction);
    
    return () => window.removeEventListener('click', checkInteraction);
  }, []);

  const playNotification = useCallback(() => {
    if (isAudioEnabled && audioRef.current) {
      audioRef.current.play().catch(err => {
        console.warn('[useOrderNotifications] Autoplay prevented:', err);
      });
    }
  }, [isAudioEnabled]);

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
          toast.error(`❌ Pedido #${order.orderNumber} foi CANCELADO`, { duration: 6000 });
          playNotification();
        } else if (order.status === 'ready_for_delivery' || order.status === 'ready_for_pickup') {
          toast.success(`✅ Pedido #${order.orderNumber} está PRONTO!`, { duration: 6000 });
          playNotification();
        }
      }
    });

    prevOrdersRef.current = orders;
  }, [orders, playNotification]);

  return {
    isAudioEnabled,
    enableAudio: () => setIsAudioEnabled(true)
  };
}
