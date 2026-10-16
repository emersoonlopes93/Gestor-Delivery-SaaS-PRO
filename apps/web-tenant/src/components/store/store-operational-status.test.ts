import { describe, expect, it } from 'vitest';
import type { TenantOperatingHours } from '@gestor/types';
import { resolveStoreOperationalStatus } from './store-operational-status';

const monday: TenantOperatingHours[] = [{
  id: 'hours-1',
  tenantId: 'tenant-1',
  dayOfWeek: 1,
  isOpen: true,
  openTime: '08:00',
  closeTime: '22:00',
}];

describe('resolveStoreOperationalStatus', () => {
  const insideHours = new Date('2026-08-17T15:00:00.000Z');
  const outsideHours = new Date('2026-08-17T23:00:00.000Z');

  it('returns open inside hours when manual pause is disabled', () => {
    expect(resolveStoreOperationalStatus({ timezone: 'UTC', isStorePaused: false } as never, monday, insideHours)).toMatchObject({
      status: 'open',
      canTogglePause: true,
    });
  });

  it('returns paused inside hours when manual pause is enabled', () => {
    expect(resolveStoreOperationalStatus({ timezone: 'UTC', isStorePaused: true } as never, monday, insideHours).status).toBe('paused');
  });

  it('keeps the store closed outside hours even when it is not manually paused', () => {
    expect(resolveStoreOperationalStatus({ timezone: 'UTC', isStorePaused: false } as never, monday, outsideHours)).toMatchObject({
      status: 'closed',
      canTogglePause: false,
      nextOpenTime: '08:00',
    });
  });

  it('gives schedule precedence over a manual pause outside hours', () => {
    expect(resolveStoreOperationalStatus({ timezone: 'UTC', isStorePaused: true } as never, monday, outsideHours).status).toBe('closed');
  });

  it('supports multiple shifts and overnight hours', () => {
    const hours: TenantOperatingHours[] = [
      ...monday,
      { ...monday[0], id: 'hours-2', openTime: '23:00', closeTime: '02:00' },
    ];
    expect(resolveStoreOperationalStatus({ timezone: 'UTC' } as never, hours, new Date('2026-08-18T01:00:00.000Z')).status).toBe('open');
  });
});
