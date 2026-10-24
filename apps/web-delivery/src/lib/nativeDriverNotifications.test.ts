import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriverDeliveryEvent } from '@gestor/types';

const native = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  isPluginAvailable: vi.fn(),
  getPlatform: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  createChannel: vi.fn(),
  schedule: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: native.isNativePlatform,
    isPluginAvailable: native.isPluginAvailable,
    getPlatform: native.getPlatform,
  },
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: native.checkPermissions,
    requestPermissions: native.requestPermissions,
    createChannel: native.createChannel,
    schedule: native.schedule,
  },
}));

import {
  getNativeNotificationStatus,
  requestNativeLocalNotifications,
  showNativeAssignmentNotification,
} from './nativeDriverNotifications';

const assignment: DriverDeliveryEvent = {
  eventId: 'event-1',
  type: 'delivery.assigned',
  orderId: 'order-1',
  orderNumber: '101',
  status: 'ready_for_delivery',
  occurredAt: '2026-08-11T12:00:00.000Z',
};

describe('native driver notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.isNativePlatform.mockReturnValue(true);
    native.isPluginAvailable.mockReturnValue(true);
    native.getPlatform.mockReturnValue('android');
    native.checkPermissions.mockResolvedValue({ display: 'prompt' });
    native.requestPermissions.mockResolvedValue({ display: 'granted' });
    native.createChannel.mockResolvedValue(undefined);
    native.schedule.mockResolvedValue(undefined);
  });

  it('reports native push as not configured instead of pretending it works', async () => {
    await expect(getNativeNotificationStatus()).resolves.toMatchObject({
      isNative: true,
      nativePush: 'not_configured',
      localNotifications: 'prompt',
    });
  });

  it('requests local notification permission and creates the Android channel', async () => {
    native.checkPermissions
      .mockResolvedValueOnce({ display: 'prompt' })
      .mockResolvedValueOnce({ display: 'granted' });

    await expect(requestNativeLocalNotifications()).resolves.toMatchObject({
      localNotifications: 'granted',
    });
    expect(native.requestPermissions).toHaveBeenCalledTimes(1);
    expect(native.createChannel).toHaveBeenCalledTimes(1);
  });

  it('schedules a local alert only for an assigned delivery with permission', async () => {
    native.checkPermissions.mockResolvedValue({ display: 'granted' });

    await expect(showNativeAssignmentNotification(assignment)).resolves.toBe(true);
    expect(native.schedule).toHaveBeenCalledWith({
      notifications: [expect.objectContaining({
        title: 'Nova entrega',
        body: 'Você recebeu o pedido #101.',
        extra: { route: '/', orderId: 'order-1' },
      })],
    });

    await expect(showNativeAssignmentNotification({
      ...assignment,
      type: 'delivery.updated',
    })).resolves.toBe(false);
    expect(native.schedule).toHaveBeenCalledTimes(1);
  });
});
