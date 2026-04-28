import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000/delivery';

export function useDriverTracking() {
  const { user } = useAuthStore();
  const socketRef = useRef<Socket | null>(null);
  const watchIdRef = useRef<number | null>(null);
  
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLocation, setLastLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!user) return;

    // Connect to WebSockets
    const socket = io(WS_URL, {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('Driver connected to tracking socket:', socket.id);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [user]);

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
        setLastLocation({ lat: latitude, lng: longitude });

        // Emit to server
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('updateDriverLocation', {
            driverId: user.driverId,
            tenantId: user.tenantId,
            lat: latitude,
            lng: longitude,
          });
        }
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
      }
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
