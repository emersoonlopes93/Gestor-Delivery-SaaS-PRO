import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSoundCatalogEntry, type SystemSoundEvent } from './soundCatalog';
import { getAudioContextState, playNotificationSound, unlockNotificationAudio } from './soundEngine';
import { traceNotificationE2E } from './e2eTrace';

// ---------------------------------------------------------------------------
// Chaves de localStorage (preferências do utilizador)
// ---------------------------------------------------------------------------

export const TENANT_NOTIFICATION_SOUND_ENABLED_KEY = 'tenantNotificationSoundEnabled';
export const TENANT_NOTIFICATION_VOLUME_KEY = 'tenantNotificationVolume';

/**
 * @deprecated Chave legada que misturava preferência com estado do AudioContext.
 * Mantida apenas para leitura de migração — não escrever.
 */
export const TENANT_NOTIFICATION_AUDIO_UNLOCKED_KEY = 'tenantNotificationAudioUnlocked';

const SOUND_MANAGER_STATE_EVENT = 'tenant:sound-manager-state';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Estado real do AudioContext — verificado ao vivo, nunca lido do localStorage. */
export type AudioContextState = 'running' | 'suspended' | 'closed' | 'unavailable';

type SoundManagerSnapshot = {
  /** Preferência do utilizador: quer ouvir sons? (persistida em localStorage) */
  soundPreferenceEnabled: boolean;
  /** Volume atual (0.0 – 1.0, persistido em localStorage) */
  volume: number;
};

// ---------------------------------------------------------------------------
// Helpers de leitura de localStorage
// ---------------------------------------------------------------------------

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1;
  return Math.max(0, Math.min(1, volume));
}

function readVolume(): number {
  if (typeof window === 'undefined') return 1;
  const raw = Number(window.localStorage.getItem(TENANT_NOTIFICATION_VOLUME_KEY) ?? '1');
  return clampVolume(raw);
}

function readSnapshot(): SoundManagerSnapshot {
  return {
    soundPreferenceEnabled: readBool(TENANT_NOTIFICATION_SOUND_ENABLED_KEY, true),
    volume: readVolume(),
  };
}

function emitStateChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SOUND_MANAGER_STATE_EVENT));
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

// ---------------------------------------------------------------------------
// SoundPlaybackController
// ---------------------------------------------------------------------------

export class SoundPlaybackController {
  private readonly lastPlayedAt = new Map<SystemSoundEvent, number>();

  resolveVolume(volume: number): number {
    return clampVolume(volume);
  }

  /**
   * Verifica se o som pode ser reproduzido.
   * @param soundPreferenceEnabled - o utilizador quer sons?
   * @param audioContextState     - estado real do AudioContext (ao vivo, não localStorage)
   */
  canPlay(
    event: SystemSoundEvent,
    input: { soundPreferenceEnabled: boolean; audioContextState: AudioContextState },
    now = Date.now(),
  ): boolean {
    if (!input.soundPreferenceEnabled) return false;
    if (input.audioContextState !== 'running') return false;

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

// ---------------------------------------------------------------------------
// useSoundManager hook
// ---------------------------------------------------------------------------

export function useSoundManager() {
  const [snapshot, setSnapshot] = useState<SoundManagerSnapshot>(() => readSnapshot());
  const [audioContextState, setAudioContextState] = useState<AudioContextState>(() => getAudioContextState());
  const [lastPlaybackError, setLastPlaybackError] = useState<string | null>(null);

  // Sincronizar preferências entre abas via storage event
  useEffect(() => {
    const syncPrefs = () => {
      setSnapshot(readSnapshot());
    };

    if (typeof window === 'undefined') return;
    window.addEventListener('storage', syncPrefs);
    window.addEventListener(SOUND_MANAGER_STATE_EVENT, syncPrefs as EventListener);
    return () => {
      window.removeEventListener('storage', syncPrefs);
      window.removeEventListener(SOUND_MANAGER_STATE_EVENT, syncPrefs as EventListener);
    };
  }, []);

  // Verificar estado real do AudioContext periodicamente (não depende de localStorage)
  useEffect(() => {
    const checkContextState = () => {
      setAudioContextState(getAudioContextState());
    };

    // Verificar imediatamente
    checkContextState();

    // Verificar quando a aba volta ao foco (o context pode ter mudado de estado)
    window.addEventListener('focus', checkContextState);
    document.addEventListener('visibilitychange', checkContextState);

    return () => {
      window.removeEventListener('focus', checkContextState);
      document.removeEventListener('visibilitychange', checkContextState);
    };
  }, []);

  const setSoundPreferenceEnabled = useCallback((enabled: boolean) => {
    persistSnapshot({ soundPreferenceEnabled: enabled });
    setSnapshot((prev) => ({ ...prev, soundPreferenceEnabled: enabled }));
  }, []);

  const setVolume = useCallback((volume: number) => {
    const nextVolume = clampVolume(volume);
    persistSnapshot({ volume: nextVolume });
    setSnapshot((prev) => ({ ...prev, volume: nextVolume }));
  }, []);

  /**
   * Desbloqueia o AudioContext após interação do utilizador.
   * Não altera a preferência de som — apenas inicializa o contexto.
   */
  const unlockAudio = useCallback(async (): Promise<boolean> => {
    try {
      await unlockNotificationAudio();
      const newState = getAudioContextState();
      setAudioContextState(newState);
      setLastPlaybackError(null);
      return newState === 'running';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nao foi possivel ativar os sons neste navegador.';
      setLastPlaybackError(message);
      return false;
    }
  }, []);

  /**
   * Reproduz um evento sonoro.
   * Respeita: soundPreferenceEnabled → audioContextState → cooldown.
   * Não lança — retorna false se qualquer condição impedir.
   */
  const playEvent = useCallback(async (event: SystemSoundEvent, options?: { force?: boolean }): Promise<boolean> => {
    const currentPrefs = readSnapshot();
    const currentContextState = getAudioContextState();
    const canPlayReason = options?.force
      ? 'forced'
      : !currentPrefs.soundPreferenceEnabled
      ? 'sound-preference-disabled'
      : currentContextState !== 'running'
        ? `audio-context-${currentContextState}`
        : 'accepted';
    const canPlay = options?.force
      ? true
      : playbackController.canPlay(event, {
          soundPreferenceEnabled: currentPrefs.soundPreferenceEnabled,
          audioContextState: currentContextState,
        });

    traceNotificationE2E({
      stage: 'playback.can-play',
      eventType: event,
      soundPreferenceEnabled: currentPrefs.soundPreferenceEnabled,
      effectiveVolume: currentPrefs.volume,
      audioContextState: currentContextState,
      accepted: canPlay,
      reason: canPlayReason,
    });

    if (!canPlay) {
      return false;
    }

    traceNotificationE2E({ stage: 'playback.requested', eventType: event, playbackRequested: true });
    const played = await playNotificationSound(event, currentPrefs.volume);

    if (!played) {
      // Atualiza estado do contexto caso tenha mudado
      setAudioContextState(getAudioContextState());
    } else {
      setLastPlaybackError(null);
    }

    return played;
  }, []);

  /**
   * Testa o som de um novo pedido.
   * Se o contexto estiver suspenso, tenta desbloqueá-lo primeiro.
   */
  const testSound = useCallback(async (): Promise<boolean> => {
    const currentPrefs = readSnapshot();
    if (!currentPrefs.soundPreferenceEnabled) return false;

    const currentState = getAudioContextState();
    if (currentState !== 'running') {
      const unlocked = await unlockAudio();
      if (!unlocked) return false;
    }

    return playEvent('order.created', { force: true });
  }, [playEvent, unlockAudio]);

  // Indicador: o utilizador quer sons mas o contexto está bloqueado
  const needsAudioUnlock = useMemo(
    () => snapshot.soundPreferenceEnabled && audioContextState === 'suspended',
    [snapshot.soundPreferenceEnabled, audioContextState],
  );

  return useMemo(() => ({
    /** Preferência do utilizador (o que ele escolheu) */
    soundPreferenceEnabled: snapshot.soundPreferenceEnabled,
    /** Estado real do AudioContext ao vivo */
    audioContextState,
    /** Volume atual (0.0–1.0) */
    volume: snapshot.volume,
    /** Verdadeiro quando o utilizador quer som mas o navegador ainda não desbloqueou */
    needsAudioUnlock,
    /** Último erro de reprodução (null se não houve) */
    lastPlaybackError,
    setSoundPreferenceEnabled,
    setVolume,
    unlockAudio,
    playEvent,
    testSound,
  }), [
    audioContextState,
    lastPlaybackError,
    needsAudioUnlock,
    playEvent,
    setSoundPreferenceEnabled,
    setVolume,
    snapshot.soundPreferenceEnabled,
    snapshot.volume,
    testSound,
    unlockAudio,
  ]);
}
