import type { NotificationCanonicalEvent } from '../../../../packages/types/src/notifications';

export type SystemSoundEvent = NotificationCanonicalEvent;

export type SoundPriority = 'low' | 'medium' | 'high' | 'critical';

export type SoundWaveform = OscillatorType;

export type SoundStep = {
  durationMs: number;
  frequency?: number;
  glideTo?: number;
  waveform?: SoundWaveform;
  gain?: number;
  attackMs?: number;
  releaseMs?: number;
  detune?: number;
  noise?: boolean;
  noiseFilter?: BiquadFilterType;
};

export type SoundPattern = {
  steps: SoundStep[];
  gapMs?: number;
};

export type SoundCatalogEntry = {
  event: SystemSoundEvent;
  pattern: SoundPattern;
  priority: SoundPriority;
  silent?: boolean;
  repeat?: boolean;
  cooldownMs?: number;
};

const CHIME = 'triangle' as const;
const SOFT = 'sine' as const;
const ALERT = 'square' as const;
const BRIGHT = 'sawtooth' as const;

export const SOUND_CATALOG: Record<SystemSoundEvent, SoundCatalogEntry> = {
  'order.created': {
    event: 'order.created',
    pattern: {
      steps: [
        { frequency: 659.25, durationMs: 150, waveform: CHIME, gain: 0.62, attackMs: 8, releaseMs: 30 },
        { frequency: 783.99, durationMs: 170, waveform: CHIME, gain: 0.7, attackMs: 8, releaseMs: 32 },
        { frequency: 987.77, durationMs: 220, waveform: CHIME, gain: 0.78, attackMs: 10, releaseMs: 44 },
        { frequency: 783.99, durationMs: 130, waveform: CHIME, gain: 0.58, attackMs: 8, releaseMs: 28 },
        { frequency: 987.77, durationMs: 170, waveform: CHIME, gain: 0.7, attackMs: 8, releaseMs: 34 },
        { frequency: 1318.51, durationMs: 300, waveform: CHIME, gain: 0.8, attackMs: 12, releaseMs: 70 },
      ],
      gapMs: 36,
    },
    priority: 'critical',
    cooldownMs: 8_000,
  },
  'order.alert': {
    event: 'order.alert',
    pattern: {
      steps: [
        { frequency: 880, durationMs: 160, waveform: ALERT, gain: 0.5, attackMs: 8, releaseMs: 32 },
        { frequency: 880, durationMs: 160, waveform: ALERT, gain: 0.5, attackMs: 8, releaseMs: 32 },
      ],
      gapMs: 110,
    },
    priority: 'high',
    cooldownMs: 30_000,
  },
  'order.cancelled': {
    event: 'order.cancelled',
    pattern: {
      steps: [
        { frequency: 392, durationMs: 180, waveform: SOFT, gain: 0.42, attackMs: 8, releaseMs: 40 },
        { frequency: 330, durationMs: 190, waveform: SOFT, gain: 0.38, attackMs: 8, releaseMs: 40 },
        { frequency: 262, durationMs: 240, waveform: SOFT, gain: 0.34, attackMs: 10, releaseMs: 48 },
      ],
      gapMs: 26,
    },
    priority: 'high',
    cooldownMs: 5_000,
  },
  'order.confirmed': {
    event: 'order.confirmed',
    pattern: {
      steps: [
        { frequency: 523.25, durationMs: 120, waveform: CHIME, gain: 0.42, attackMs: 10, releaseMs: 28 },
        { frequency: 659.25, durationMs: 150, waveform: CHIME, gain: 0.48, attackMs: 10, releaseMs: 30 },
        { frequency: 783.99, durationMs: 180, waveform: CHIME, gain: 0.5, attackMs: 12, releaseMs: 36 },
      ],
      gapMs: 24,
    },
    priority: 'medium',
    cooldownMs: 4_000,
  },
  'order.auto_accepted': {
    event: 'order.auto_accepted',
    pattern: {
      steps: [
        { frequency: 554.37, durationMs: 110, waveform: CHIME, gain: 0.36, attackMs: 10, releaseMs: 24 },
        { frequency: 698.46, durationMs: 140, waveform: CHIME, gain: 0.48, attackMs: 10, releaseMs: 28 },
        { frequency: 880, durationMs: 180, waveform: CHIME, gain: 0.54, attackMs: 12, releaseMs: 32 },
      ],
      gapMs: 22,
    },
    priority: 'medium',
    cooldownMs: 4_000,
  },
  'order.sent_to_kitchen': {
    event: 'order.sent_to_kitchen',
    pattern: {
      steps: [
        { frequency: 523.25, durationMs: 120, waveform: CHIME, gain: 0.42, attackMs: 10, releaseMs: 28 },
        { frequency: 659.25, durationMs: 150, waveform: CHIME, gain: 0.48, attackMs: 10, releaseMs: 30 },
        { frequency: 783.99, durationMs: 180, waveform: CHIME, gain: 0.5, attackMs: 12, releaseMs: 36 },
      ],
      gapMs: 24,
    },
    priority: 'medium',
    cooldownMs: 4_000,
  },
  'order.ready': {
    event: 'order.ready',
    pattern: {
      steps: [
        { frequency: 880, durationMs: 90, waveform: ALERT, gain: 0.32, attackMs: 4, releaseMs: 12 },
        { frequency: 880, durationMs: 90, waveform: ALERT, gain: 0.32, attackMs: 4, releaseMs: 12 },
        { frequency: 659.25, durationMs: 160, waveform: CHIME, gain: 0.46, attackMs: 8, releaseMs: 24 },
      ],
      gapMs: 18,
    },
    priority: 'high',
    cooldownMs: 5_000,
  },
  'order.out_for_delivery': {
    event: 'order.out_for_delivery',
    pattern: {
      steps: [
        { frequency: 440, durationMs: 110, waveform: CHIME, gain: 0.34, attackMs: 8, releaseMs: 22 },
        { frequency: 587.33, durationMs: 130, waveform: CHIME, gain: 0.42, attackMs: 10, releaseMs: 24 },
        { frequency: 659.25, durationMs: 160, waveform: CHIME, gain: 0.48, attackMs: 10, releaseMs: 28 },
      ],
      gapMs: 24,
    },
    priority: 'medium',
    cooldownMs: 4_000,
  },
  'order.delivered': {
    event: 'order.delivered',
    pattern: {
      steps: [
        { frequency: 523.25, durationMs: 110, waveform: CHIME, gain: 0.28, attackMs: 10, releaseMs: 20 },
        { frequency: 659.25, durationMs: 120, waveform: CHIME, gain: 0.34, attackMs: 10, releaseMs: 22 },
        { frequency: 783.99, durationMs: 160, waveform: CHIME, gain: 0.4, attackMs: 12, releaseMs: 30 },
      ],
      gapMs: 22,
    },
    priority: 'low',
    cooldownMs: 8_000,
  },
  'order.failed': {
    event: 'order.failed',
    pattern: {
      steps: [
        { noise: true, noiseFilter: 'bandpass', durationMs: 60, gain: 0.32, attackMs: 1, releaseMs: 14 },
        { frequency: 220, durationMs: 150, waveform: BRIGHT, gain: 0.35, attackMs: 4, releaseMs: 18 },
        { noise: true, noiseFilter: 'highpass', durationMs: 60, gain: 0.32, attackMs: 1, releaseMs: 14 },
        { frequency: 196, durationMs: 160, waveform: BRIGHT, gain: 0.4, attackMs: 4, releaseMs: 22 },
      ],
      gapMs: 16,
    },
    priority: 'critical',
    cooldownMs: 10_000,
  },
  'store.closed': {
    event: 'store.closed',
    pattern: {
      steps: [
        { frequency: 293.66, durationMs: 180, waveform: SOFT, gain: 0.28, attackMs: 10, releaseMs: 42 },
        { frequency: 246.94, durationMs: 220, waveform: SOFT, gain: 0.24, attackMs: 12, releaseMs: 48 },
      ],
      gapMs: 26,
    },
    priority: 'high',
    cooldownMs: 10_000,
  },
  'store.opened': {
    event: 'store.opened',
    pattern: {
      steps: [
        { frequency: 523.25, durationMs: 120, waveform: CHIME, gain: 0.28, attackMs: 10, releaseMs: 24 },
        { frequency: 659.25, durationMs: 130, waveform: CHIME, gain: 0.34, attackMs: 10, releaseMs: 26 },
        { frequency: 783.99, durationMs: 170, waveform: CHIME, gain: 0.4, attackMs: 12, releaseMs: 32 },
      ],
      gapMs: 22,
    },
    priority: 'low',
    cooldownMs: 10_000,
  },
  'store.paused': {
    event: 'store.paused',
    pattern: {
      steps: [
        { frequency: 293.66, durationMs: 180, waveform: SOFT, gain: 0.28, attackMs: 10, releaseMs: 42 },
        { frequency: 246.94, durationMs: 220, waveform: SOFT, gain: 0.24, attackMs: 12, releaseMs: 48 },
      ],
      gapMs: 26,
    },
    priority: 'high',
    cooldownMs: 10_000,
  },
  'store.resumed': {
    event: 'store.resumed',
    pattern: {
      steps: [
        { frequency: 523.25, durationMs: 120, waveform: CHIME, gain: 0.28, attackMs: 10, releaseMs: 24 },
        { frequency: 659.25, durationMs: 130, waveform: CHIME, gain: 0.34, attackMs: 10, releaseMs: 26 },
        { frequency: 783.99, durationMs: 170, waveform: CHIME, gain: 0.4, attackMs: 12, releaseMs: 32 },
      ],
      gapMs: 22,
    },
    priority: 'low',
    cooldownMs: 10_000,
  },
  'connection.lost': {
    event: 'connection.lost',
    pattern: { steps: [] },
    priority: 'critical',
    silent: true,
    cooldownMs: 12_000,
  },
  'connection.restored': {
    event: 'connection.restored',
    pattern: { steps: [] },
    priority: 'low',
    silent: true,
    cooldownMs: 8_000,
  },
  'print.completed': {
    event: 'print.completed',
    pattern: {
      steps: [
        { frequency: 523.25, durationMs: 110, waveform: CHIME, gain: 0.28, attackMs: 10, releaseMs: 20 },
        { frequency: 659.25, durationMs: 120, waveform: CHIME, gain: 0.34, attackMs: 10, releaseMs: 22 },
        { frequency: 783.99, durationMs: 160, waveform: CHIME, gain: 0.4, attackMs: 12, releaseMs: 30 },
      ],
      gapMs: 22,
    },
    priority: 'low',
    cooldownMs: 8_000,
  },
  'print.failed': {
    event: 'print.failed',
    pattern: {
      steps: [
        { noise: true, noiseFilter: 'bandpass', durationMs: 60, gain: 0.32, attackMs: 1, releaseMs: 14 },
        { frequency: 220, durationMs: 150, waveform: BRIGHT, gain: 0.35, attackMs: 4, releaseMs: 18 },
        { noise: true, noiseFilter: 'highpass', durationMs: 60, gain: 0.32, attackMs: 1, releaseMs: 14 },
        { frequency: 196, durationMs: 160, waveform: BRIGHT, gain: 0.4, attackMs: 4, releaseMs: 22 },
      ],
      gapMs: 16,
    },
    priority: 'critical',
    cooldownMs: 10_000,
  },
  'system.error': {
    event: 'system.error',
    pattern: {
      steps: [
        { noise: true, noiseFilter: 'bandpass', durationMs: 60, gain: 0.32, attackMs: 1, releaseMs: 14 },
        { frequency: 220, durationMs: 150, waveform: BRIGHT, gain: 0.35, attackMs: 4, releaseMs: 18 },
        { noise: true, noiseFilter: 'highpass', durationMs: 60, gain: 0.32, attackMs: 1, releaseMs: 14 },
        { frequency: 196, durationMs: 160, waveform: BRIGHT, gain: 0.4, attackMs: 4, releaseMs: 22 },
      ],
      gapMs: 16,
    },
    priority: 'critical',
    cooldownMs: 10_000,
  },
  'whatsapp.handoff': {
    event: 'whatsapp.handoff',
    pattern: {
      steps: [
        { frequency: 440, durationMs: 110, waveform: SOFT, gain: 0.28, attackMs: 10, releaseMs: 20, glideTo: 554.37 },
        { frequency: 554.37, durationMs: 130, waveform: SOFT, gain: 0.34, attackMs: 10, releaseMs: 22, glideTo: 440 },
        { frequency: 659.25, durationMs: 180, waveform: SOFT, gain: 0.38, attackMs: 12, releaseMs: 30 },
      ],
      gapMs: 20,
    },
    priority: 'high',
    cooldownMs: 5_000,
  },
  'whatsapp.message_received': {
    event: 'whatsapp.message_received',
    pattern: {
      steps: [
        { frequency: 440, durationMs: 110, waveform: SOFT, gain: 0.28, attackMs: 10, releaseMs: 20, glideTo: 554.37 },
        { frequency: 554.37, durationMs: 130, waveform: SOFT, gain: 0.34, attackMs: 10, releaseMs: 22, glideTo: 440 },
        { frequency: 659.25, durationMs: 180, waveform: SOFT, gain: 0.38, attackMs: 12, releaseMs: 30 },
      ],
      gapMs: 20,
    },
    priority: 'medium',
    cooldownMs: 5_000,
  },
};

export function getSoundCatalogEntry(event: SystemSoundEvent): SoundCatalogEntry {
  return SOUND_CATALOG[event];
}
