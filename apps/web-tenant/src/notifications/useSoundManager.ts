import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSoundCatalogEntry, type SystemSoundEvent } from './soundCatalog';
import { getAudioContextState, playNotificationSound, unlockNotificationAudio } from './soundEngine';
import { traceNotificationE2E } from './e2eTrace';

export const TENANT_NOTIFICATION_SOUND_ENABLED_KEY = 'tenantNotificationSoundEnabled';
export const TENANT_NOTIFICATION_VOLUME_KEY = 'tenantNotificationVolume';
/** @deprecated This key used to mix user preference and AudioContext state. */
export const TENANT_NOTIFICATION_AUDIO_UNLOCKED_KEY = 'tenantNotificationAudioUnlocked';

const SOUND_MANAGER_STATE_EVENT = 'tenant:sound-manager-state';
const SOUND_BANNER_DISMISSED_SESSION_KEY = 'tenantNotificationSoundBannerDismissedForSession';
const SOUND_BANNER_SHOWN_SESSION_KEY = 'tenantNotificationSoundBannerShownForSession';

export type AudioContextState = 'not-created' | 'running' | 'suspended' | 'closed' | 'unavailable';
export type SoundActivationUiState = 'disabled' | 'blocked' | 'activating' | 'ready' | 'failed' | 'unavailable';

type SoundManagerSnapshot = {
  soundPreferenceEnabled: boolean;
  volume: number;
};

type SoundActivationSession = {
  bannerDismissed: boolean;
  bannerShown: boolean;
};

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  return raw === null ? fallback : raw === 'true';
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1;
  return Math.max(0, Math.min(1, volume));
}

function readSnapshot(): SoundManagerSnapshot {
  if (typeof window === 'undefined') return { soundPreferenceEnabled: true, volume: 1 };
  return {
    soundPreferenceEnabled: readBool(TENANT_NOTIFICATION_SOUND_ENABLED_KEY, true),
    volume: clampVolume(Number(window.localStorage.getItem(TENANT_NOTIFICATION_VOLUME_KEY) ?? '1')),
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

function persistSnapshot(next: Partial<SoundManagerSnapshot>) {
  if (typeof window === 'undefined') return;
  if (typeof next.soundPreferenceEnabled === 'boolean') {
    window.localStorage.setItem(TENANT_NOTIFICATION_SOUND_ENABLED_KEY, String(next.soundPreferenceEnabled));
  }
  if (typeof next.volume === 'number') {
    window.localStorage.setItem(TENANT_NOTIFICATION_VOLUME_KEY, String(clampVolume(next.volume)));
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
}): boolean {
  return input.soundPreferenceEnabled
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
    const lastPlayed = this.lastPlayedAt.get(event);
    if (typeof lastPlayed === 'number' && definition.cooldownMs && now - lastPlayed < definition.cooldownMs) return false;
    this.lastPlayedAt.set(event, now);
    return true;
  }
}

const playbackController = new SoundPlaybackController();

export function useSoundManager() {
  const [snapshot, setSnapshot] = useState<SoundManagerSnapshot>(() => readSnapshot());
  const [audioContextState, setAudioContextState] = useState<AudioContextState>(() => getAudioContextState());
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activationInProgress, setActivationInProgress] = useState(false);
  const [activationSession, setActivationSession] = useState<SoundActivationSession>(() => readActivationSession());

  useEffect(() => {
    const syncState = () => {
      setSnapshot(readSnapshot());
      setAudioContextState(getAudioContextState());
      setActivationSession(readActivationSession());
    };
    window.addEventListener('storage', syncState);
    window.addEventListener(SOUND_MANAGER_STATE_EVENT, syncState as EventListener);
    return () => {
      window.removeEventListener('storage', syncState);
      window.removeEventListener(SOUND_MANAGER_STATE_EVENT, syncState as EventListener);
    };
  }, []);

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
    persistSnapshot({ soundPreferenceEnabled: enabled });
    setSnapshot((previous) => ({ ...previous, soundPreferenceEnabled: enabled }));
    const nextSession = { bannerDismissed: !enabled, bannerShown: !enabled };
    persistActivationSession(nextSession);
    setActivationSession((previous) => ({ ...previous, ...nextSession }));
    if (enabled) setActivationError(null);
  }, []);

  const setVolume = useCallback((volume: number) => {
    const nextVolume = clampVolume(volume);
    persistSnapshot({ volume: nextVolume });
    setSnapshot((previous) => ({ ...previous, volume: nextVolume }));
  }, []);

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
      setActivationSession((previous) => ({ ...previous, bannerDismissed: true, bannerShown: true }));
      return true;
    } catch (error) {
      setAudioContextState(getAudioContextState());
      setActivationError(error instanceof Error ? error.message : 'Nao foi possivel ativar os sons neste navegador.');
      return false;
    } finally {
      setActivationInProgress(false);
    }
  }, []);

  const playEvent = useCallback(async (event: SystemSoundEvent, options?: { force?: boolean }): Promise<boolean> => {
    const currentPrefs = readSnapshot();
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
  }, []);

  const testSound = useCallback(async (): Promise<boolean> => {
    if (!readSnapshot().soundPreferenceEnabled || getAudioContextState() !== 'running') return false;
    return playEvent('order.created', { force: true });
  }, [playEvent]);

  const needsAudioUnlock = snapshot.soundPreferenceEnabled && (audioContextState === 'not-created' || audioContextState === 'suspended');
  const activationUiState = getSoundActivationUiState({ soundPreferenceEnabled: snapshot.soundPreferenceEnabled, audioContextState, activationInProgress, activationError });
  const activationBannerEligible = shouldShowSoundActivationBanner({
    soundPreferenceEnabled: snapshot.soundPreferenceEnabled,
    audioContextState,
    activationInProgress,
    bannerDismissedForSession: activationSession.bannerDismissed,
  });
  const markActivationBannerShownForSession = useCallback(() => {
    persistActivationSession({ bannerShown: true });
    setActivationSession((previous) => ({ ...previous, bannerShown: true }));
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
  }), [activationBannerEligible, activationError, activationInProgress, activationSession.bannerShown, activationUiState, audioContextState, markActivationBannerShownForSession, needsAudioUnlock, playEvent, setSoundPreferenceEnabled, setVolume, snapshot.soundPreferenceEnabled, snapshot.volume, testSound, unlockAudio]);
}
