import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { DriverDeliveryEvent } from '@gestor/types';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';
import { playAssignmentSound, processDriverDeliveryEvent } from '../lib/driverDeliveryEvents';
import {
  ForegroundGeolocationError,
  startForegroundGeolocation,
  type StopForegroundGeolocation,
} from '../lib/foregroundGeolocation';
import { showNativeAssignmentNotification } from '../lib/nativeDriverNotifications';

const configuredWsUrl = import.meta.env.VITE_WS_URL?.trim();

if (import.meta.env.PROD && !configuredWsUrl) {
  throw new Error('VITE_WS_URL precisa estar configurado para o app entregador em produção.');
}

const WS_URL = configuredWsUrl || 'http://localhost:3333/delivery';
const HTTP_LOCATION_INTERVAL_MS = 15_000;

export function useDriverTracking() {
  const { user, accessToken } = useAuthStore();
  const socketRef = useRef<Socket | null>(null);
  const stopGeolocationRef = useRef<StopForegroundGeolocation | null>(null);
  const trackingGenerationRef = useRef(0);
  const lastHttpSentRef = useRef(0);

  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLocation, setLastLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [lastDeliveryEvent, setLastDeliveryEvent] = useState<DriverDeliveryEvent | null>(null);

  useEffect(() => {
    if (!user) return;

    const socket = io(WS_URL, {
      transports: ['websocket'],
      auth: { token: accessToken },
    });

    socket.on('connect', () => {
      console.log('Driver connected to tracking socket:', socket.id);
    });

    const handleDeliveryEvent = (event: DriverDeliveryEvent) => {
      processDriverDeliveryEvent(event, {
        onEvent: setLastDeliveryEvent,
        onAssignment: () => {
          try {
            playAssignmentSound();
          } catch {
            // Visual feedback remains available when autoplay is blocked.
          }
          void showNativeAssignmentNotification(event).catch(() => undefined);
        },
      });
    };
    socket.on('driverDeliveryEvent', handleDeliveryEvent);

    const handleServiceWorkerMessage = (message: MessageEvent) => {
      if (message.data?.type === 'DRIVER_DELIVERY_PUSH') {
        handleDeliveryEvent(message.data.payload as DriverDeliveryEvent);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage);
    socketRef.current = socket;

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage);
      socket.disconnect();
    };
  }, [accessToken, user]);

  const sendLocationHttp = useCallback(async (lat: number, lng: number) => {
    if (!user?.driverId) return;
    const now = Date.now();
    if (now - lastHttpSentRef.current < HTTP_LOCATION_INTERVAL_MS) return;
    lastHttpSentRef.current = now;

    try {
      await api.post('/delivery/driver/location', { lat, lng });
    } catch (sendError) {
      console.warn('Failed to send location via HTTP:', sendError);
    }
  }, [user]);

  const stopTracking = useCallback(() => {
    trackingGenerationRef.current += 1;
    const stop = stopGeolocationRef.current;
    stopGeolocationRef.current = null;
    void stop?.().catch(() => undefined);
    setIsTracking(false);
  }, []);

  const startTracking = useCallback(async () => {
    if (!user) return;
    setError(null);
    const generation = trackingGenerationRef.current + 1;
    trackingGenerationRef.current = generation;

    try {
      const stop = await startForegroundGeolocation(
        ({ latitude, longitude }) => {
          if (generation !== trackingGenerationRef.current) return;
          const location = { lat: latitude, lng: longitude };
          setLastLocation(location);

          if (socketRef.current?.connected) {
            socketRef.current.emit('updateDriverLocation', location);
          }
          void sendLocationHttp(latitude, longitude);
        },
        (message) => {
          if (generation !== trackingGenerationRef.current) return;
          setError(message);
          stopTracking();
        },
      );

      if (generation !== trackingGenerationRef.current) {
        await stop();
        return;
      }
      stopGeolocationRef.current = stop;
      setIsTracking(true);
    } catch (trackingError) {
      if (generation !== trackingGenerationRef.current) return;
      setError(trackingError instanceof ForegroundGeolocationError
        ? trackingError.message
        : 'Não foi possível iniciar a localização.');
      setIsTracking(false);
    }
  }, [sendLocationHttp, stopTracking, user]);

  useEffect(() => stopTracking, [stopTracking]);

  return {
    isTracking,
    startTracking,
    stopTracking,
    error,
    lastLocation,
    lastDeliveryEvent,
  };
}
