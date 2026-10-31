import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export type ForegroundLocationPermission = 'granted' | 'denied' | 'prompt' | 'unavailable';

async function readPermission(): Promise<ForegroundLocationPermission> {
  if (Capacitor.isNativePlatform()) {
    if (!Capacitor.isPluginAvailable('Geolocation')) return 'unavailable';
    const permission = await Geolocation.checkPermissions();
    return permission.location === 'granted' ? 'granted' : permission.location === 'denied' ? 'denied' : 'prompt';
  }
  if (!navigator.geolocation) return 'unavailable';
  if (!navigator.permissions?.query) return 'prompt';
  const permission = await navigator.permissions.query({ name: 'geolocation' });
  return permission.state === 'granted' ? 'granted' : permission.state === 'denied' ? 'denied' : 'prompt';
}

async function requestPermission(): Promise<ForegroundLocationPermission> {
  if (Capacitor.isNativePlatform()) {
    if (!Capacitor.isPluginAvailable('Geolocation')) return 'unavailable';
    const permission = await Geolocation.requestPermissions({ permissions: ['location'] });
    return permission.location === 'granted' ? 'granted' : permission.location === 'denied' ? 'denied' : 'prompt';
  }
  if (!navigator.geolocation) return 'unavailable';
  return new Promise((resolve) => navigator.geolocation.getCurrentPosition(
    () => resolve('granted'),
    (error) => resolve(error.code === error.PERMISSION_DENIED ? 'denied' : 'prompt'),
    { enableHighAccuracy: true, maximumAge: 60_000, timeout: 8_000 },
  ));
}

export function useForegroundLocationPermission() {
  const [permission, setPermission] = useState<ForegroundLocationPermission>('prompt');
  const [isRequesting, setIsRequesting] = useState(false);

  const refresh = useCallback(async () => {
    try { setPermission(await readPermission()); } catch { setPermission('unavailable'); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const request = useCallback(async () => {
    setIsRequesting(true);
    try {
      const next = await requestPermission();
      setPermission(next);
      return next === 'granted';
    } finally { setIsRequesting(false); }
  }, []);

  return { permission, isRequesting, request, refresh };
}
