import { describe, expect, it } from 'vitest';
import { getSoundActivationUiState, shouldShowSoundActivationBanner, SoundPlaybackController } from './useSoundManager';

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

  it('keeps a new-device preference enabled while distinguishing a context not yet created', () => {
    expect(getSoundActivationUiState({
      soundPreferenceEnabled: true,
      audioContextState: 'not-created',
      activationInProgress: false,
      activationError: null,
    })).toBe('blocked');
  });

  it('does not surface activation controls when audio is ready or manually disabled', () => {
    expect(getSoundActivationUiState({
      soundPreferenceEnabled: true,
      audioContextState: 'running',
      activationInProgress: false,
      activationError: null,
    })).toBe('ready');
    expect(getSoundActivationUiState({
      soundPreferenceEnabled: false,
      audioContextState: 'suspended',
      activationInProgress: false,
      activationError: null,
    })).toBe('disabled');
  });

  it('models activating and rejected resume states without claiming audio is ready', () => {
    expect(getSoundActivationUiState({
      soundPreferenceEnabled: true,
      audioContextState: 'suspended',
      activationInProgress: true,
      activationError: null,
    })).toBe('activating');
    expect(getSoundActivationUiState({
      soundPreferenceEnabled: true,
      audioContextState: 'suspended',
      activationInProgress: false,
      activationError: 'NotAllowedError',
    })).toBe('failed');
  });

  it('shows the large banner only for an enabled, blocked and undismissed session', () => {
    expect(shouldShowSoundActivationBanner({
      soundPreferenceEnabled: true,
      audioContextState: 'suspended',
      activationInProgress: false,
      bannerDismissedForSession: false,
    })).toBe(true);
    expect(shouldShowSoundActivationBanner({
      soundPreferenceEnabled: true,
      audioContextState: 'running',
      activationInProgress: false,
      bannerDismissedForSession: false,
    })).toBe(false);
    expect(shouldShowSoundActivationBanner({
      soundPreferenceEnabled: true,
      audioContextState: 'suspended',
      activationInProgress: false,
      bannerDismissedForSession: true,
    })).toBe(false);
    expect(shouldShowSoundActivationBanner({
      soundPreferenceEnabled: false,
      audioContextState: 'suspended',
      activationInProgress: false,
      bannerDismissedForSession: false,
    })).toBe(false);
  });

  it('respects cooldown between repeated plays of the same event', () => {
    const controller = new SoundPlaybackController();
    expect(controller.canPlay('order.created', { soundPreferenceEnabled: true, audioContextState: 'running' }, 1000)).toBe(true);
    expect(controller.canPlay('order.created', { soundPreferenceEnabled: true, audioContextState: 'running' }, 2000)).toBe(false);
    expect(controller.canPlay('order.created', { soundPreferenceEnabled: true, audioContextState: 'running' }, 10_000)).toBe(true);
  });
});
