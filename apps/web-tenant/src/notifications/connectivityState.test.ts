import { describe, expect, it } from 'vitest';
import { connectionIssueCopy, resolveConnectivityState } from './connectivityState';

describe('notification connectivity state', () => {
  it('treats a hidden or paused app as suspended instead of offline', () => {
    expect(resolveConnectivityState({
      appActive: false,
      networkOnline: false,
      socketConnected: false,
    })).toBe('background_suspended');
  });

  it('separates real network loss from a socket reconnect', () => {
    expect(resolveConnectivityState({
      appActive: true,
      networkOnline: false,
      socketConnected: false,
    })).toBe('foreground_offline');
    expect(resolveConnectivityState({
      appActive: true,
      networkOnline: true,
      socketConnected: false,
      serviceReachable: true,
    })).toBe('foreground_online_reconnecting');
  });

  it('does not label backend unavailability as missing internet', () => {
    expect(resolveConnectivityState({
      appActive: true,
      networkOnline: true,
      socketConnected: false,
      serviceReachable: false,
    })).toBe('foreground_service_unavailable');
    expect(connectionIssueCopy('service_unavailable').title).toBe('Reconectando ao servidor...');
  });
});
