import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSoundCatalogEntry, type SystemSoundEvent } from './soundCatalog';

export const TENANT_NOTIFICATION_SOUND_ENABLED_KEY = 'tenantNotificationSoundEnabled';
export const TENANT_NOTIFICATION_VOLUME_KEY = 'tenantNotificationVolume';
export const TENANT_NOTIFICATION_AUDIO_UNLOCKED_KEY = 'tenantNotificationAudioUnlocked';

const SOUND_MANAGER_STATE_EVENT = 'tenant:sound-manager-state';

type SoundManagerSnapshot = {
  enabled: boolean;
  volume: number;
  unlocked: boolean;
};

function readBool(key: string, fallback: boolean) {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

function clampVolume(volume: number) {
  if (!Number.isFinite(volume)) return 1;
  return Math.max(0, Math.min(1, volume));
}

function readVolume() {
  if (typeof window === 'undefined') return 1;
  const raw = Number(window.localStorage.getItem(TENANT_NOTIFICATION_VOLUME_KEY) ?? '1');
  return clampVolume(raw);
}

function readSnapshot(): SoundManagerSnapshot {
  return {
    enabled: readBool(TENANT_NOTIFICATION_SOUND_ENABLED_KEY, true),
    volume: readVolume(),
    unlocked: readBool(TENANT_NOTIFICATION_AUDIO_UNLOCKED_KEY, false),
  };
}

function emitStateChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SOUND_MANAGER_STATE_EVENT));
}

function persistSnapshot(next: Partial<SoundManagerSnapshot>) {
  if (typeof window === 'undefined') return;

  if (typeof next.enabled === 'boolean') {
    window.localStorage.setItem(TENANT_NOTIFICATION_SOUND_ENABLED_KEY, String(next.enabled));
  }

  if (typeof next.volume === 'number') {
    window.localStorage.setItem(TENANT_NOTIFICATION_VOLUME_KEY, String(clampVolume(next.volume)));
  }

  if (typeof next.unlocked === 'boolean') {
    window.localStorage.setItem(TENANT_NOTIFICATION_AUDIO_UNLOCKED_KEY, String(next.unlocked));
  }

  emitStateChanged();
}

export class SoundPlaybackController {
  private readonly lastPlayedAt = new Map<SystemSoundEvent, number>();

  resolveVolume(volume: number) {
    return clampVolume(volume);
  }

  canPlay(event: SystemSoundEvent, input: { enabled: boolean; unlocked?: boolean }, now = Date.now()) {
    if (!input.enabled) return false;
    if (input.unlocked === false) return false;

    const definition = getSoundCatalogEntry(event);
    const lastPlayed = this.lastPlayedAt.get(event);
    if (typeof lastPlayed === 'number' && definition.cooldownMs && now - lastPlayed < definition.cooldownMs) {
      return false;
    }

    this.lastPlayedAt.set(event, now);
    return true;
  }
}

const playbackController = new SoundPlaybackController();

async function playAudioAsset(asset: string, volume: number) {
  const audio = new Audio(asset);
  audio.volume = clampVolume(volume);
  await audio.play();
  return audio;
}

export function useSoundManager() {
  const [snapshot, setSnapshot] = useState<SoundManagerSnapshot>(() => readSnapshot());
  const [lastPlaybackBlocked, setLastPlaybackBlocked] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setSnapshot(readSnapshot());
    };

    if (typeof window === 'undefined') return;
    window.addEventListener('storage', sync);
    window.addEventListener(SOUND_MANAGER_STATE_EVENT, sync as EventListener);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(SOUND_MANAGER_STATE_EVENT, sync as EventListener);
    };
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    persistSnapshot({ enabled });
    setSnapshot((prev) => ({ ...prev, enabled }));
  }, []);

  const setVolume = useCallback((volume: number) => {
    const nextVolume = clampVolume(volume);
    persistSnapshot({ volume: nextVolume });
    setSnapshot((prev) => ({ ...prev, volume: nextVolume }));
  }, []);

  const unlockAudio = useCallback(async () => {
    try {
      const audio = await playAudioAsset('/sounds/notification.mp3', 0);
      audio.pause();
      audio.currentTime = 0;
      persistSnapshot({ unlocked: true });
      setSnapshot((prev) => ({ ...prev, unlocked: true }));
      setLastPlaybackBlocked(null);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nao foi possivel ativar os sons neste navegador.';
      setLastPlaybackBlocked(message);
      return false;
    }
  }, []);

  const playEvent = useCallback(async (event: SystemSoundEvent, options?: { force?: boolean }) => {
    const current = readSnapshot();
    if (!options?.force && !playbackController.canPlay(event, current)) {
      return false;
    }

    try {
      const definition = getSoundCatalogEntry(event);
      await playAudioAsset(definition.asset, current.volume);
      setLastPlaybackBlocked(null);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'O navegador bloqueou a reproducao de audio.';
      setLastPlaybackBlocked(message);
      return false;
    }
  }, []);

  const testSound = useCallback(async () => {
    if (!readSnapshot().unlocked) {
      const unlocked = await unlockAudio();
      if (!unlocked) return false;
    }
    return playEvent('order.new', { force: true });
  }, [playEvent, unlockAudio]);

  return useMemo(() => ({
    isEnabled: snapshot.enabled,
    volume: snapshot.volume,
    isUnlocked: snapshot.unlocked,
    lastPlaybackBlocked,
    setEnabled,
    setVolume,
    unlockAudio,
    playEvent,
    testSound,
  }), [lastPlaybackBlocked, playEvent, setEnabled, setVolume, snapshot.enabled, snapshot.unlocked, snapshot.volume, testSound, unlockAudio]);
}
