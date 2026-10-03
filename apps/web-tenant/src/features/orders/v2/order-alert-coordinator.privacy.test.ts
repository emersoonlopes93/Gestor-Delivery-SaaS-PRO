import { describe, expect, it } from 'vitest';
import { getOperationalAlertRepeatIntervalMs, getOperationalDisplayNumber, normalizeOrderNumberForSpeech, OrderAlertCoordinator, shouldAnnounceOperationalAlert } from './order-alert-coordinator';

describe('Order Manager V2 voice privacy', () => {
  it('speaks only a human-facing display number and deduplicates the event', async () => {
    const phrases: string[] = [];
    const coordinator = new OrderAlertCoordinator();
    const event = {
      id: 'event-1',
      type: 'order.created' as const,
      title: 'Pedido #1042 recebido para Cliente confidencial',
      priority: 'high' as const,
      createdAt: '2026-09-10T12:00:00.000Z',
    };
    const speech = { speak: async (phrase: string) => { phrases.push(phrase); } };

    coordinator.enqueue(event, speech);
    coordinator.enqueue(event, speech);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(phrases).toEqual(['Novo pedido 1042 recebido.']);
    expect(getOperationalDisplayNumber('Pedido 550e8400-e29b-41d4-a716-446655440000')).toBeNull();
  });

  it('normalizes only numeric display numbers for speech', () => {
    expect(normalizeOrderNumberForSpeech('##0002')).toBe('2');
    expect(normalizeOrderNumberForSpeech('##0137')).toBe('137');
    expect(normalizeOrderNumberForSpeech('##0000')).toBe('0');
    expect(normalizeOrderNumberForSpeech('IFOOD-A12')).toBe('IFOOD-A12');
  });

  it('keeps waiting-for-acceptance reminders audible after acknowledgement', () => {
    const waitingAcknowledged = { ruleKey: 'ORDER_WAITING_ACTION', acknowledgedAt: '2026-09-15T12:00:00.000Z', severity: 'ATTENTION' as const };
    expect(shouldAnnounceOperationalAlert(waitingAcknowledged)).toBe(true);
    expect(getOperationalAlertRepeatIntervalMs(waitingAcknowledged)).toBe(30_000);
    expect(shouldAnnounceOperationalAlert({ ruleKey: 'ORDER_DELAYED', acknowledgedAt: '2026-09-15T12:00:00.000Z', severity: 'ATTENTION' })).toBe(false);
  });

  it('keeps the courier-arrived condition audible after acknowledgement without rider data', async () => {
    const courierAcknowledged = { ruleKey: 'MARKETPLACE_COURIER_ARRIVED', acknowledgedAt: '2026-09-15T12:00:00.000Z', severity: 'ATTENTION' as const };
    expect(shouldAnnounceOperationalAlert(courierAcknowledged)).toBe(true);
    expect(getOperationalAlertRepeatIntervalMs(courierAcknowledged)).toBe(30_000);

    const phrases: string[] = [];
    const coordinator = new OrderAlertCoordinator();
    coordinator.enqueue({
      id: 'courier-101', type: 'order.alert', title: 'Entregador da 99Food chegou para o pedido #101', priority: 'high', createdAt: '2026-09-15T12:00:00.000Z',
    }, { speak: async (phrase: string) => { phrases.push(phrase); } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(phrases).toEqual(['Entregador da 99Food chegou para o pedido 101.']);
  });

  it('uses the operational waiting-acceptance voice without customer data', async () => {
    const phrases: string[] = [];
    const coordinator = new OrderAlertCoordinator();
    coordinator.enqueue({
      id: 'waiting-101',
      type: 'order.alert',
      title: 'Pedido #101 aguardando ação',
      priority: 'high',
      createdAt: '2026-09-15T12:00:00.000Z',
    }, { speak: async (phrase: string) => { phrases.push(phrase); } });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(phrases).toEqual(['Pedido 101 aguarda aceite.']);
  });
});
