import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OrderBoardItemDTO } from '@gestor/types';
import { OrderAlertCoordinator } from './order-alert-coordinator';
import { filterManagerOrders, formatElapsed, groupOrdersForManager, isRunnableStatusAction, privacySafeOrderPhrase } from './order-manager-v2';

function order(status: OrderBoardItemDTO['status'], overrides: Partial<OrderBoardItemDTO> = {}): OrderBoardItemDTO {
  return {
    id: `id-${status}`, orderNumber: '1042', status, fulfillmentType: 'delivery', customerName: 'Cliente confidencial', customerPhone: '11999999999', total: 42,
    itemsSubtotal: 42, itemCount: 1, itemsSummary: 'Pizza', createdAt: '2026-09-10T12:00:00.000Z',
    operational: { origin: 'PEDEHUB', provider: null, displayChannel: 'PedeHub', deliveryOwnership: 'MERCHANT', fulfillmentMode: 'delivery', capabilities: { canConfirm: true, canStartPreparation: true, canMarkReady: true, canCancel: true, canAssignDriver: true, canDispatch: true, canRecalculateRoute: true, canComplete: true, canPrint: true, canEdit: true }, availableActions: [], marketplaceOperation: { state: 'NONE' }, syncState: 'NONE', financialSummary: { operationalValue: 42, operationalValueLabel: 'Venda', saleAmount: 42, customerPaid: null, paymentState: 'PENDING', paymentLabel: 'Pendente' }, deliverySummary: { ownership: 'MERCHANT', label: 'Entrega própria' }, productionSummary: { state: 'NOT_SENT', label: 'Não enviado' }, primaryAction: null, secondaryActions: [] },
    ...overrides,
  };
}

describe('Order Manager V2 projections', () => {
  it('groups only canonical statuses into the operational lanes', () => {
    const groups = groupOrdersForManager([order('preparing'), order('ready_for_delivery'), order('out_for_delivery'), order('completed')]);
    expect(groups.kitchen).toHaveLength(1); expect(groups.ready).toHaveLength(1); expect(groups.route).toHaveLength(1); expect(groups.finalization).toHaveLength(1);
  });
  it('preserves board search and origin filtering', () => {
    expect(filterManagerOrders([order('pending')], '1042', 'PEDEHUB')).toHaveLength(1);
    expect(filterManagerOrders([order('pending')], '1042', 'IFOOD')).toHaveLength(0);
  });
  it('uses a shared clock display and never emits customer data for voice', () => {
    expect(formatElapsed('2026-09-10T12:00:00.000Z', Date.parse('2026-09-10T12:46:00.000Z'))).toBe('46 min');
    expect(privacySafeOrderPhrase(order('pending'))).not.toContain('Cliente confidencial');
  });
  it('only exposes enabled actions backed by a canonical target status', () => {
    expect(isRunnableStatusAction({ type: 'CONFIRM', label: 'Confirmar', mode: 'LOCAL', enabled: true, targetStatus: 'confirmed' })).toBe(true);
    expect(isRunnableStatusAction({ type: 'CONFIRM', label: 'Confirmar', mode: 'DISABLED', enabled: false, targetStatus: 'confirmed' })).toBe(false);
    expect(isRunnableStatusAction({ type: 'ASSIGN_DRIVER', label: 'Atribuir', mode: 'LOCAL', enabled: true })).toBe(false);
    expect(isRunnableStatusAction({ type: 'DISPATCH', label: 'Despachar', mode: 'LOCAL', enabled: true, targetStatus: 'out_for_delivery' })).toBe(false);
  });
});

describe('Order alert coordinator', () => {
  it('serializes alerts and prioritizes the highest pending event', async () => {
    const calls: string[] = [];
    const coordinator = new OrderAlertCoordinator();
    coordinator.enqueue({ type: 'order.ready', orderId: 'one', priority: 'low', createdAt: '2026-09-10T12:00:00.000Z' }, { speak: async (phrase) => { calls.push(phrase); } });
    coordinator.enqueue({ type: 'order.cancelled', orderId: 'two', priority: 'critical', createdAt: '2026-09-10T12:01:00.000Z' }, { speak: async (phrase) => { calls.push(phrase); } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual(['Pedido pronto para a próxima etapa.', 'Um pedido foi cancelado.']);
  });
});

describe('Order Manager V2 visual contracts', () => {
  it('keeps the operational lanes horizontally scrollable below desktop', () => {
    const source = readFileSync(resolve(__dirname, 'OrderManagerV2Page.tsx'), 'utf8');
    expect(source).toContain('overflow-x-auto');
    expect(source).toContain('min-w-[19rem]');
    expect(source).toContain('snap-mandatory');
    expect(source).toContain('xl:grid-cols-4');
  });

  it('surfaces alert settings and cross-tab coordination in the control-room strip', () => {
    const page = readFileSync(resolve(__dirname, 'OrderManagerV2Page.tsx'), 'utf8');
    const center = readFileSync(resolve(__dirname, '../../../notifications/NotificationCenter.tsx'), 'utf8');
    expect(page).toContain('Central de alertas');
    expect(page).toContain('uma aba anuncia');
    expect(page).toContain('setSoundPreferenceEnabled');
    expect(page).toContain('setVoiceAlertsEnabled');
    expect(page).toContain('soundManager.testSound()');
    expect(page).toContain('testVoice');
    expect(page).toContain('soundManager.setVolume');
    expect(page).toContain('Teste de voz do Gestor de Pedidos.');
    expect(page).toContain('needsAudioUnlock');
    expect(center).toContain('sharedOrderAlertCoordinator.enqueue');
    expect(center).toContain("document.visibilityState === 'visible'");
    expect(center).toContain('if (shouldAnnounce && !isConnectionEvent(event))');
  });

  it('labels card scan indicators and repeats operational context in details', () => {
    const card = readFileSync(resolve(__dirname, 'OrderCardV2.tsx'), 'utf8');
    const details = readFileSync(resolve(__dirname, 'OrderDetailsModalV2.tsx'), 'utf8');
    expect(card).toContain('Indicadores operacionais');
    expect(card).toContain('Logistica da loja');
    expect(card).toContain('Falha de sincronizacao');
    expect(details).toContain('Resumo operacional do pedido');
    expect(details).toContain('Proxima acao');
    expect(details).toContain('formatElapsed');
    expect(card).toContain('onAction(order, action)');
    expect(card).toContain('pointer-events-auto relative z-10');
    expect(details).toContain('Acoes de status do pedido');
    expect(readFileSync(resolve(__dirname, 'OrderManagerV2Page.tsx'), 'utf8')).toContain('/orders/${order.id}/status');
  });
});
