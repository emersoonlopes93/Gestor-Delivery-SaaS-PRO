import { describe, expect, it } from 'vitest';
import { getOperationalDisplayNumber, OrderAlertCoordinator } from './order-alert-coordinator';

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

    expect(phrases).toEqual(['Novo pedido #1042 recebido.']);
    expect(getOperationalDisplayNumber('Pedido 550e8400-e29b-41d4-a716-446655440000')).toBeNull();
  });
});
