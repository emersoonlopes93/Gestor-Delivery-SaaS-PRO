import { getSoundCatalogEntry, type SoundPattern, type SoundStep, type SystemSoundEvent } from './soundCatalog';

type AudioContextCtor = typeof AudioContext;

type E2EUnlockTrace = {
  step: string;
  state: NotificationAudioContextState | null;
  error?: { name: string; message: string };
};

type NotificationAudioContextState = 'running' | 'suspended' | 'closed' | 'interrupted';

declare global {
  interface Window {
    __notificationAudioE2ETrace?: E2EUnlockTrace[];
  }
}

let sharedAudioContext: AudioContext | null = null;

function traceUnlock(step: string, context: AudioContext | null, error?: unknown) {
  if (typeof window === 'undefined' || !window.__notificationAudioE2ETrace) return;
  const entry: E2EUnlockTrace = {
    step,
    state: context?.state ?? null,
  };
  if (error instanceof Error) {
    entry.error = { name: error.name, message: error.message };
  }
  window.__notificationAudioE2ETrace.push(entry);
}

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext || null;
}

export function hasSoundEngine(): boolean {
  return getAudioContextCtor() !== null;
}

/**
 * Retorna o estado real do AudioContext compartilhado.
 * 'unavailable' quando o navegador nao suporta Web Audio API.
 * Chamadores devem verificar esse estado ao vivo — nao contar com localStorage.
 */
export function getAudioContextState(): Exclude<NotificationAudioContextState, 'interrupted'> | 'unavailable' {
  if (!getAudioContextCtor()) return 'unavailable';
  if (!sharedAudioContext) return 'suspended'; // contexto ainda nao criado = suspenso implicitamente
  return sharedAudioContext.state as 'running' | 'suspended' | 'closed';
}

function clampVolume(volume: number) {
  if (!Number.isFinite(volume)) return 1;
  return Math.max(0, Math.min(1, volume));
}

async function getAudioContext() {
  const Ctor = getAudioContextCtor();
  if (!Ctor) {
    throw new Error('Este navegador nao suporta notificacoes sonoras personalizadas.');
  }

  if (!sharedAudioContext) {
    sharedAudioContext = new Ctor();
    traceUnlock('context:create', sharedAudioContext);
  }

  if (sharedAudioContext.state === 'suspended') {
    traceUnlock('resume:called', sharedAudioContext);
    try {
      await sharedAudioContext.resume();
      traceUnlock('resume:resolved', sharedAudioContext);
      await Promise.resolve();
      traceUnlock('resume:microtask', sharedAudioContext);
    } catch (error) {
      traceUnlock('resume:rejected', sharedAudioContext, error);
      throw error;
    }
  }

  return sharedAudioContext;
}

function createEnvelope(
  gainNode: GainNode,
  startTime: number,
  durationSeconds: number,
  volume: number,
  attackMs = 12,
  releaseMs = 24,
) {
  const attackSeconds = Math.max(0.003, attackMs / 1000);
  const releaseSeconds = Math.max(0.01, releaseMs / 1000);
  const sustainLevel = Math.max(0, volume);

  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(sustainLevel, startTime + Math.min(attackSeconds, durationSeconds * 0.5));
  gainNode.gain.setTargetAtTime(sustainLevel, startTime + Math.min(attackSeconds, durationSeconds * 0.65), 0.03);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + Math.max(durationSeconds - releaseSeconds, 0.001));
}

function scheduleToneStep(
  context: AudioContext,
  step: SoundStep,
  startTime: number,
  volume: number,
) {
  const durationSeconds = step.durationMs / 1000;
  const gainNode = context.createGain();
  gainNode.connect(context.destination);

  const stepVolume = clampVolume(volume * (step.gain ?? 1));
  createEnvelope(gainNode, startTime, durationSeconds, stepVolume, step.attackMs, step.releaseMs);

  if (step.noise) {
    const source = context.createBufferSource();
    const buffer = context.createBuffer(1, Math.max(1, Math.round(context.sampleRate * durationSeconds)), context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }
    source.buffer = buffer;

    const filter = context.createBiquadFilter();
    filter.type = step.noiseFilter ?? 'highpass';
    filter.frequency.setValueAtTime(step.noiseFilter === 'bandpass' ? 1800 : 1200, startTime);
    source.connect(filter);
    filter.connect(gainNode);
    source.start(startTime);
    source.stop(startTime + durationSeconds + 0.02);
    return;
  }

  const oscillator = context.createOscillator();
  oscillator.type = step.waveform ?? 'sine';
  const initialFrequency = step.frequency ?? 440;
  oscillator.frequency.setValueAtTime(initialFrequency, startTime);

  if (typeof step.glideTo === 'number') {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, step.glideTo), startTime + durationSeconds);
  }

  if (typeof step.detune === 'number') {
    oscillator.detune.setValueAtTime(step.detune, startTime);
  }

  oscillator.connect(gainNode);
  oscillator.start(startTime);
  oscillator.stop(startTime + durationSeconds + 0.02);
}

async function playPattern(pattern: SoundPattern, volume: number) {
  const context = await getAudioContext();
  const startTime = context.currentTime + 0.02;
  let cursor = startTime;

  for (const step of pattern.steps) {
    scheduleToneStep(context, step, cursor, volume);
    cursor += step.durationMs / 1000 + (pattern.gapMs ?? 0) / 1000;
  }

  await new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, (cursor - context.currentTime) * 1000 + 40));
  });
}

export async function unlockNotificationAudio() {
  traceUnlock('unlock:start', sharedAudioContext);
  const context = await getAudioContext();
  traceUnlock('unlock:context-ready', context);
  const buffer = context.createBuffer(1, 1, context.sampleRate);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
  source.stop(context.currentTime + 0.02);
  await new Promise((resolve) => window.setTimeout(resolve, 25));
  traceUnlock('unlock:success', context);
  return true;
}

export async function playNotificationSound(event: SystemSoundEvent, volume: number): Promise<boolean> {
  try {
    const entry = getSoundCatalogEntry(event);
    await playPattern(entry.pattern, volume);
    return true;
  } catch {
    // AudioContext suspenso ou indisponivel — retorna false sem lancar
    return false;
  }
}
