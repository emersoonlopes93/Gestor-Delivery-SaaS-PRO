import { describe, expect, it } from 'vitest';
import { SoundPlaybackController } from './useSoundManager';

describe('SoundPlaybackController', () => {
  it('clamps the volume to a valid range', () => {
    const controller = new SoundPlaybackController();
    expect(controller.resolveVolume(2)).toBe(1);
    expect(controller.resolveVolume(-1)).toBe(0);
    expect(controller.resolveVolume(0.4)).toBe(0.4);
  });

  it('respects mute/disabled preference even if context is running', () => {
    const controller = new SoundPlaybackController();
    expect(controller.canPlay('order.created', { soundPreferenceEnabled: false, audioContextState: 'running' }, 1000)).toBe(false);
  });

  it('blocks playback if context is suspended', () => {
    const controller = new SoundPlaybackController();
    expect(controller.canPlay('order.created', { soundPreferenceEnabled: true, audioContextState: 'suspended' }, 1000)).toBe(false);
  });

  it('respects cooldown between repeated plays of the same event', () => {
    const controller = new SoundPlaybackController();
    expect(controller.canPlay('order.created', { soundPreferenceEnabled: true, audioContextState: 'running' }, 1000)).toBe(true);
    expect(controller.canPlay('order.created', { soundPreferenceEnabled: true, audioContextState: 'running' }, 2000)).toBe(false);
    expect(controller.canPlay('order.created', { soundPreferenceEnabled: true, audioContextState: 'running' }, 10_000)).toBe(true);
  });
});
