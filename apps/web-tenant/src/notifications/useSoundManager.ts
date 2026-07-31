import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSoundCatalogEntry, type SystemSoundEvent } from './soundCatalog';
import { getAudioContextState, playNotificationSound, unlockNotificationAudio } from './soundEngine';
import { traceNotificationE2E } from './e2eTrace';
import { useAuthStore } from '../stores/auth.store';

export const TENANT_NOTIFICATION_SOUND_ENABLED_KEY = 'tenantNotificationSoundEnabled';
export const TENANT_NOTIFICATION_VOLUME_KEY = 'tenantNotificationVolume';
export const TENANT_NOTIFICATION_AUDIO_CONFIRMED_KEY = 'tenantNotificationAudioConfirmedV2';
/** @deprecated This key used to mix user preference and AudioContext state. */
export const TENANT_NOTIFICATION_AUDIO_UNLOCKED_KEY = 'tenantNotificationAudioUnlocked';

const SOUND_MANAGER_STATE_EVENT = 'tenant:sound-manager-state';
const SOUND_BANNER_DISMISSED_SESSION_KEY = 'tenantNotificationSoundBannerDismissedForSession';
const SOUND_BANNER_SHOWN_SESSION_KEY = 'tenantNotificationSoundBannerShownForSession';

export type AudioContextState = 'not-created' | 'running' | 'suspended' | 'closed' | 'unavailable';
export type SoundActivationUiState = 'disabled' | 'blocked' | 'activating' | 'ready' | 'failed' | 'unavailable';

type SoundManagerSnapshot = {
  soundPreferenceEnabled: boolean;
  audioActivationConfirmed: boolean;
  volume: number;
};

type SoundActivationSession = {
  bannerDismissed: boolean;
  bannerShown: boolean;
};

export function getSoundStorageKey(key: string, scopeKey?: string) {
  return scopeKey ? `gestor:notifications:v2:${scopeKey}:${key}` : key;
}

function readBool(key: string, fallback: boolean, scopeKey?: string): boolean {
  if (typeof window === 'undefined') return fallback;
  const keyForScope = getSoundStorageKey(key, scopeKey);
  let raw = window.localStorage.getItem(keyForScope);
  if (raw === null && scopeKey) {
    raw = window.localStorage.getItem(key);
    if (raw !== null) window.localStorage.setItem(keyForScope, raw);
  }
  return raw === null ? fallback : raw === 'true';
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1;
  return Math.max(0, Math.min(1, volume));
}

function readSnapshot(scopeKey?: string): SoundManagerSnapshot {
  if (typeof window === 'undefined') return { soundPreferenceEnabled: true, audioActivationConfirmed: false, volume: 1 };
  const volumeKey = getSoundStorageKey(TENANT_NOTIFICATION_VOLUME_KEY, scopeKey);
  let storedVolume = window.localStorage.getItem(volumeKey);
  if (storedVolume === null && scopeKey) {
    storedVolume = window.localStorage.getItem(TENANT_NOTIFICATION_VOLUME_KEY);
    if (storedVolume !== null) window.localStorage.setItem(volumeKey, storedVolume);
  }
  return {
    soundPreferenceEnabled: readBool(TENANT_NOTIFICATION_SOUND_ENABLED_KEY, true, scopeKey),
    audioActivationConfirmed: readBool(TENANT_NOTIFICATION_AUDIO_CONFIRMED_KEY, false, scopeKey),
    volume: clampVolume(Number(storedVolume ?? '1')),
  };
}

function readActivationSession(): SoundActivationSession {
  if (typeof window === 'undefined') return { bannerDismissed: false, bannerShown: false };
  return {
    bannerDismissed: window.sessionStorage.getItem(SOUND_BANNER_DISMISSED_SESSION_KEY) === 'true',
    bannerShown: window.sessionStorage.getItem(SOUND_BANNER_SHOWN_SESSION_KEY) === 'true',
  };
}

function emitStateChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SOUND_MANAGER_STATE_EVENT));
}

function persistSnapshot(next: Partial<SoundManagerSnapshot>, scopeKey?: string) {
  if (typeof window === 'undefined') return;
  if (typeof next.soundPreferenceEnabled === 'boolean') {
    window.localStorage.setItem(getSoundStorageKey(TENANT_NOTIFICATION_SOUND_ENABLED_KEY, scopeKey), String(next.soundPreferenceEnabled));
  }
  if (typeof next.audioActivationConfirmed === 'boolean') {
    window.localStorage.setItem(getSoundStorageKey(TENANT_NOTIFICATION_AUDIO_CONFIRMED_KEY, scopeKey), String(next.audioActivationConfirmed));
  }
  if (typeof next.volume === 'number') {
    window.localStorage.setItem(getSoundStorageKey(TENANT_NOTIFICATION_VOLUME_KEY, scopeKey), String(clampVolume(next.volume)));
  }
  emitStateChanged();
}

function persistActivationSession(next: Partial<SoundActivationSession>) {
  if (typeof window === 'undefined') return;
  if (typeof next.bannerDismissed === 'boolean') {
    window.sessionStorage.setItem(SOUND_BANNER_DISMISSED_SESSION_KEY, String(next.bannerDismissed));
  }
  if (typeof next.bannerShown === 'boolean') {
    window.sessionStorage.setItem(SOUND_BANNER_SHOWN_SESSION_KEY, String(next.bannerShown));
  }
  emitStateChanged();
}

export function getSoundActivationUiState(input: {
  soundPreferenceEnabled: boolean;
  audioContextState: AudioContextState;
  activationInProgress: boolean;
  activationError: string | null;
}): SoundActivationUiState {
  if (!input.soundPreferenceEnabled) return 'disabled';
  if (input.audioContextState === 'running') return 'ready';
  if (input.audioContextState === 'unavailable' || input.audioContextState === 'closed') return 'unavailable';
  if (input.activationInProgress) return 'activating';
  if (input.activationError) return 'failed';
  return 'blocked';
}

export function shouldShowSoundActivationBanner(input: {
  soundPreferenceEnabled: boolean;
  audioContextState: AudioContextState;
  activationInProgress: boolean;
  bannerDismissedForSession: boolean;
  activationConfirmed?: boolean;
}): boolean {
  return input.soundPreferenceEnabled
    && !input.activationConfirmed
    && (input.audioContextState === 'not-created' || input.audioContextState === 'suspended')
    && !input.activationInProgress
    && !input.bannerDismissedForSession;
}

export class SoundPlaybackController {
  private readonly lastPlayedAt = new Map<SystemSoundEvent, number>();

  resolveVolume(volume: number): number {
    return clampVolume(volume);
  }

  canPlay(event: SystemSoundEvent, input: { soundPreferenceEnabled: boolean; audioContextState: AudioContextState }, now = Date.now()): boolean {
    if (!input.soundPreferenceEnabled || input.audioContextState !== 'running') return false;
    const definition = getSoundCatalogEntry(event);
    if (definition.silent) return false;
    const lastPlayed = this.lastPlayedAt.get(event);
    if (typeof lastPlayed === 'number' && definition.cooldownMs && now - lastPlayed < definition.cooldownMs) return false;
    this.lastPlayedAt.set(event, now);
    return true;
  }
}

const playbackController = new SoundPlaybackController();

export function useSoundManager() {
  const user = useAuthStore((state) => state.user);
  const scopeKey = user ? `${user.tenantId}:${user.userId}` : undefined;
  const [snapshot, setSnapshot] = useState<SoundManagerSnapshot>(() => readSnapshot(scopeKey));
  const [audioContextState, setAudioContextState] = useState<AudioContextState>(() => getAudioContextState());
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activationInProgress, setActivationInProgress] = useState(false);
  const [activationSession, setActivationSession] = useState<SoundActivationSession>(() => readActivationSession());

  useEffect(() => {
    const syncState = () => {
      setSnapshot(readSnapshot(scopeKey));
      setAudioContextState(getAudioContextState());
      setActivationSession(readActivationSession());
    };
    window.addEventListener('storage', syncState);
    window.addEventListener(SOUND_MANAGER_STATE_EVENT, syncState as EventListener);
    return () => {
      window.removeEventListener('storage', syncState);
      window.removeEventListener(SOUND_MANAGER_STATE_EVENT, syncState as EventListener);
    };
  }, [scopeKey]);

  useEffect(() => {
    if (!snapshot.soundPreferenceEnabled || !snapshot.audioActivationConfirmed || audioContextState === 'running') return;
    const resumeFromGesture = () => {
      void unlockNotificationAudio().then(() => {
        setAudioContextState(getAudioContextState());
      }).catch(() => {
        setAudioContextState(getAudioContextState());
      });
    };
    window.addEventListener('pointerdown', resumeFromGesture, { once: true, capture: true });
    window.addEventListener('keydown', resumeFromGesture, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', resumeFromGesture, { capture: true });
      window.removeEventListener('keydown', resumeFromGesture, { capture: true });
    };
  }, [audioContextState, snapshot.audioActivationConfirmed, snapshot.soundPreferenceEnabled]);

  useEffect(() => {
    const syncAudioContext = () => setAudioContextState(getAudioContextState());
    syncAudioContext();
    window.addEventListener('focus', syncAudioContext);
    document.addEventListener('visibilitychange', syncAudioContext);
    return () => {
      window.removeEventListener('focus', syncAudioContext);
      document.removeEventListener('visibilitychange', syncAudioContext);
    };
  }, []);

  const setSoundPreferenceEnabled = useCallback((enabled: boolean) => {
    persistSnapshot({ soundPreferenceEnabled: enabled }, scopeKey);
    setSnapshot((previous) => ({ ...previous, soundPreferenceEnabled: enabled }));
    const nextSession = { bannerDismissed: !enabled, bannerShown: !enabled };
    persistActivationSession(nextSession);
    setActivationSession((previous) => ({ ...previous, ...nextSession }));
    if (enabled) setActivationError(null);
  }, [scopeKey]);

  const setVolume = useCallback((volume: number) => {
    const nextVolume = clampVolume(volume);
    persistSnapshot({ volume: nextVolume }, scopeKey);
    setSnapshot((previous) => ({ ...previous, volume: nextVolume }));
  }, [scopeKey]);

  const unlockAudio = useCallback(async (): Promise<boolean> => {
    setActivationInProgress(true);
    setActivationError(null);
    try {
      await unlockNotificationAudio();
      const nextState = getAudioContextState();
      setAudioContextState(nextState);
      if (nextState !== 'running') {
        setActivationError('O navegador ainda nao liberou os sons.');
        return false;
      }
      persistActivationSession({ bannerDismissed: true, bannerShown: true });
      persistSnapshot({ audioActivationConfirmed: true }, scopeKey);
      setSnapshot((previous) => ({ ...previous, audioActivationConfirmed: true }));
      setActivationSession((previous) => ({ ...previous, bannerDismissed: true, bannerShown: true }));
      return true;
    } catch (error) {
      setAudioContextState(getAudioContextState());
      setActivationError(error instanceof Error ? error.message : 'Nao foi possivel ativar os sons neste navegador.');
      return false;
    } finally {
      setActivationInProgress(false);
    }
  }, [scopeKey]);

  const playEvent = useCallback(async (event: SystemSoundEvent, options?: { force?: boolean }): Promise<boolean> => {
    const currentPrefs = readSnapshot(scopeKey);
    const currentContextState = getAudioContextState();
    const canPlay = options?.force
      ? currentPrefs.soundPreferenceEnabled && currentContextState === 'running'
      : playbackController.canPlay(event, { soundPreferenceEnabled: currentPrefs.soundPreferenceEnabled, audioContextState: currentContextState });
    traceNotificationE2E({
      stage: 'playback.can-play', eventType: event, soundPreferenceEnabled: currentPrefs.soundPreferenceEnabled,
      effectiveVolume: currentPrefs.volume, audioContextState: currentContextState, accepted: canPlay,
      reason: canPlay ? 'accepted' : currentPrefs.soundPreferenceEnabled ? `audio-context-${currentContextState}` : 'sound-preference-disabled',
    });
    if (!canPlay) return false;
    traceNotificationE2E({ stage: 'playback.requested', eventType: event, playbackRequested: true });
    const played = await playNotificationSound(event, currentPrefs.volume);
    setAudioContextState(getAudioContextState());
    if (played) setActivationError(null);
    return played;
  }, [scopeKey]);

  const testSound = useCallback(async (): Promise<boolean> => {
    if (!readSnapshot(scopeKey).soundPreferenceEnabled || getAudioContextState() !== 'running') return false;
    return playEvent('order.created', { force: true });
  }, [playEvent, scopeKey]);

  const needsAudioUnlock = snapshot.soundPreferenceEnabled && (audioContextState === 'not-created' || audioContextState === 'suspended');
  const activationUiState = getSoundActivationUiState({ soundPreferenceEnabled: snapshot.soundPreferenceEnabled, audioContextState, activationInProgress, activationError });
  const activationBannerEligible = shouldShowSoundActivationBanner({
    soundPreferenceEnabled: snapshot.soundPreferenceEnabled,
    audioContextState,
    activationInProgress,
    bannerDismissedForSession: activationSession.bannerDismissed,
    activationConfirmed: snapshot.audioActivationConfirmed,
  });
  const markActivationBannerShownForSession = useCallback(() => {
    persistActivationSession({ bannerShown: true });
    setActivationSession((previous) => ({ ...previous, bannerShown: true }));
  }, []);
  const dismissActivationBannerForSession = useCallback(() => {
    persistActivationSession({ bannerDismissed: true, bannerShown: true });
    setActivationSession((previous) => ({ ...previous, bannerDismissed: true, bannerShown: true }));
  }, []);

  return useMemo(() => ({
    soundPreferenceEnabled: snapshot.soundPreferenceEnabled,
    audioContextState,
    volume: snapshot.volume,
    needsAudioUnlock,
    activationUiState,
    activationError,
    activationInProgress,
    activationBannerEligible,
    activationBannerShownForSession: activationSession.bannerShown,
    setSoundPreferenceEnabled,
    setVolume,
    unlockAudio,
    playEvent,
    testSound,
    markActivationBannerShownForSession,
    dismissActivationBannerForSession,
  }), [activationBannerEligible, activationError, activationInProgress, activationSession.bannerShown, activationUiState, audioContextState, dismissActivationBannerForSession, markActivationBannerShownForSession, needsAudioUnlock, playEvent, setSoundPreferenceEnabled, setVolume, snapshot.soundPreferenceEnabled, snapshot.volume, testSound, unlockAudio]);
}
