export type SystemSoundEvent =
  | 'order.new'
  | 'order.cancelled'
  | 'order.accepted'
  | 'order.auto_accepted'
  | 'order.kds_ready'
  | 'order.out_for_delivery'
  | 'store.closed'
  | 'store.opened'
  | 'connection.lost'
  | 'connection.restored'
  | 'error.critical'
  | 'whatsapp.handoff';

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
  repeat?: boolean;
  cooldownMs?: number;
};

const CHIME = 'triangle' as const;
const SOFT = 'sine' as const;
const ALERT = 'square' as const;
const BRIGHT = 'sawtooth' as const;

export const SOUND_CATALOG: Record<SystemSoundEvent, SoundCatalogEntry> = {
  'order.new': {
    event: 'order.new',
    pattern: {
      steps: [
        { frequency: 784, durationMs: 120, waveform: CHIME, gain: 0.45, attackMs: 8, releaseMs: 24 },
        { frequency: 988, durationMs: 140, waveform: CHIME, gain: 0.55, attackMs: 8, releaseMs: 24 },
        { frequency: 1175, durationMs: 200, waveform: CHIME, gain: 0.6, attackMs: 10, releaseMs: 36 },
      ],
      gapMs: 28,
    },
    priority: 'critical',
    cooldownMs: 8_000,
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
  'order.accepted': {
    event: 'order.accepted',
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
  'order.kds_ready': {
    event: 'order.kds_ready',
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
  'connection.lost': {
    event: 'connection.lost',
    pattern: {
      steps: [
        { noise: true, noiseFilter: 'highpass', durationMs: 60, gain: 0.28, attackMs: 1, releaseMs: 24 },
        { frequency: 196, durationMs: 160, waveform: ALERT, gain: 0.3, attackMs: 4, releaseMs: 26 },
        { frequency: 174.61, durationMs: 220, waveform: ALERT, gain: 0.36, attackMs: 4, releaseMs: 32 },
      ],
      gapMs: 18,
    },
    priority: 'critical',
    cooldownMs: 12_000,
  },
  'connection.restored': {
    event: 'connection.restored',
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
  'error.critical': {
    event: 'error.critical',
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
};

export function getSoundCatalogEntry(event: SystemSoundEvent): SoundCatalogEntry {
  return SOUND_CATALOG[event];
}
