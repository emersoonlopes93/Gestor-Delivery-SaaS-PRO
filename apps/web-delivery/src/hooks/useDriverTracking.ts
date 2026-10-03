import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  DriverDeliveryEvent,
  DriverLocationIngestResultDTO,
  DriverLocationPointDTO,
  DriverRouteEvent,
} from '@gestor/types';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';
import { playAssignmentSound, processDriverDeliveryEvent } from '../lib/driverDeliveryEvents';
import {
  ForegroundGeolocationError,
  startForegroundGeolocation,
  type StopForegroundGeolocation,
} from '../lib/foregroundGeolocation';
import { Capacitor } from '@capacitor/core';
import {
  BackgroundGeolocationError,
  startBackgroundGeolocation,
} from '../lib/backgroundGeolocation';
import { showNativeAssignmentNotification } from '../lib/nativeDriverNotifications';
import {
  acknowledgeLocationPoints,
  enqueueLocationPoint,
  readLocationBuffer,
} from '../lib/driverLocationBuffer';

const configuredWsUrl = import.meta.env.VITE_WS_URL?.trim();

if (import.meta.env.PROD && !configuredWsUrl) {
  throw new Error('VITE_WS_URL precisa estar configurado para o app entregador em produção.');
}

const WS_URL = configuredWsUrl || 'http://localhost:3333/delivery';
const HTTP_LOCATION_INTERVAL_MS = 15_000;

function createLocationEventKey(source: 'foreground' | 'background'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${source}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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
  const [lastRouteEvent, setLastRouteEvent] = useState<DriverRouteEvent | null>(null);

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
    socket.on('driverRouteEvent', setLastRouteEvent);

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

  const replayLocationBuffer = useCallback(async () => {
    if (!user?.driverId) return;
    const now = Date.now();
    if (now - lastHttpSentRef.current < HTTP_LOCATION_INTERVAL_MS) return;
    lastHttpSentRef.current = now;

    try {
      const points = readLocationBuffer().slice(0, 100);
      if (points.length === 0) return;
      const response = await api.post<DriverLocationIngestResultDTO>(
        '/delivery/driver/location/batch',
        { points },
      );
      const payload = response.data && typeof response.data === 'object' && 'data' in response.data
        ? (response.data as { data: DriverLocationIngestResultDTO }).data
        : response.data;
      acknowledgeLocationPoints(payload.acknowledgedEventKeys);
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
    if (!user) return false;
    setError(null);
    const generation = trackingGenerationRef.current + 1;
    trackingGenerationRef.current = generation;

    try {
      void replayLocationBuffer();
      const nativeBackground = Capacitor.isNativePlatform();
      const source = nativeBackground ? 'background' : 'foreground';
      const startGeolocation = nativeBackground ? startBackgroundGeolocation : startForegroundGeolocation;
      const stop = await startGeolocation(
        ({ latitude, longitude, accuracy, heading, speed, ...positionMetadata }) => {
          if (generation !== trackingGenerationRef.current) return;
          const location = { lat: latitude, lng: longitude };
          const point: DriverLocationPointDTO = {
            eventKey: createLocationEventKey(source),
            recordedAt: 'recordedAt' in positionMetadata && typeof positionMetadata.recordedAt === 'string'
              ? positionMetadata.recordedAt
              : new Date().toISOString(),
            ...location,
            ...(typeof accuracy === 'number' && accuracy >= 0 ? { accuracy } : {}),
            ...(typeof heading === 'number' && heading >= 0 ? { heading } : {}),
            ...(typeof speed === 'number' && speed >= 0 ? { speed } : {}),
            source,
          };
          enqueueLocationPoint(point);
          setLastLocation(location);

          if (socketRef.current?.connected) {
            socketRef.current.emit('updateDriverLocation', point);
          }
          void replayLocationBuffer();
        },
        (message) => {
          if (generation !== trackingGenerationRef.current) return;
          setError(message);
        },
      );

      if (generation !== trackingGenerationRef.current) {
        await stop();
        return false;
      }
      stopGeolocationRef.current = stop;
      setIsTracking(true);
      return true;
    } catch (trackingError) {
      if (generation !== trackingGenerationRef.current) return;
      setError(trackingError instanceof ForegroundGeolocationError || trackingError instanceof BackgroundGeolocationError
        ? trackingError.message
        : 'Não foi possível iniciar a localização.');
      setIsTracking(false);
      return false;
    }
  }, [replayLocationBuffer, user]);

  useEffect(() => {
    const replay = () => void replayLocationBuffer();
    window.addEventListener('online', replay);
    return () => window.removeEventListener('online', replay);
  }, [replayLocationBuffer]);

  useEffect(() => stopTracking, [stopTracking]);

  return {
    isTracking,
    startTracking,
    stopTracking,
    error,
    lastLocation,
    lastDeliveryEvent,
    lastRouteEvent,
  };
}
