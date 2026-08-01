import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';

const configuredWsUrl = import.meta.env.VITE_WS_URL?.trim();

if (import.meta.env.PROD && !configuredWsUrl) {
  throw new Error('VITE_WS_URL precisa estar configurado para o app entregador em produÃ§Ã£o.');
}

const WS_URL = configuredWsUrl || 'http://localhost:3333/delivery';

// How often to send location via HTTP REST (to ensure DB persistence)
const HTTP_LOCATION_INTERVAL_MS = 15_000;

export function useDriverTracking() {
  const { user, accessToken } = useAuthStore();
  const socketRef = useRef<Socket | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastHttpSentRef = useRef<number>(0);
  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLocation, setLastLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!user) return;

    // Connect to WebSockets
    const socket = io(WS_URL, {
      transports: ['websocket'],
      auth: { token: accessToken },
    });

    socket.on('connect', () => {
      console.log('Driver connected to tracking socket:', socket.id);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [accessToken, user]);

  /**
   * BUG 5 FIX: Send location via HTTP REST to ensure DB persistence.
   * The WebSocket event alone does not update the DB — only the REST endpoint does.
   * We throttle HTTP calls to once every HTTP_LOCATION_INTERVAL_MS.
   */
  const sendLocationHttp = useCallback(
    async (lat: number, lng: number) => {
      if (!user?.driverId) return;
      const now = Date.now();
      if (now - lastHttpSentRef.current < HTTP_LOCATION_INTERVAL_MS) return;
      lastHttpSentRef.current = now;

      try {
        await api.post('/delivery/driver/location', { lat, lng });
      } catch (err) {
        console.warn('Failed to send location via HTTP:', err);
      }
    },
    [user],
  );

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError('Geolocalização não é suportada neste dispositivo.');
      return;
    }

    if (!user) return;
    setError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const loc = { lat: latitude, lng: longitude };
        setLastLocation(loc);
        lastLocationRef.current = loc;

        // Emit to server via WebSocket (real-time tenant map)
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('updateDriverLocation', {
            lat: latitude,
            lng: longitude,
          });
        }

        // Also persist via HTTP REST so polling-based map always has fresh coords
        sendLocationHttp(latitude, longitude);
      },
      (err) => {
        console.error('Error getting location:', err);
        setError(err.message);
        setIsTracking(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 5000,
      },
    );

    setIsTracking(true);
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
  };

  // Stop tracking on unmount
  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, []);

  return {
    isTracking,
    startTracking,
    stopTracking,
    error,
    lastLocation,
  };
}
