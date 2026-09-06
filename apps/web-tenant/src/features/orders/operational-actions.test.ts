import { describe, expect, it } from 'vitest';
import type { OrderBoardItemDTO, OrderOperationalAction, OrderOperationalViewModel } from '@gestor/types';
import { resolveKanbanDropAction } from './operational-actions';

function createAction(
  type: OrderOperationalAction['type'],
  targetStatus: OrderOperationalAction['targetStatus'],
  mode: OrderOperationalAction['mode'] = 'LOCAL',
  enabled = true,
): OrderOperationalAction {
  return { type, targetStatus, mode, enabled, label: type, reason: enabled ? null : 'Ação indisponível.' };
}

function createOrder(actions: OrderOperationalAction[]): OrderBoardItemDTO {
  const operational: OrderOperationalViewModel = {
    origin: 'PEDEHUB',
    provider: null,
    displayChannel: 'PedeHub',
    deliveryOwnership: 'MERCHANT',
    fulfillmentMode: 'delivery',
    capabilities: {
      canConfirm: true, canStartPreparation: true, canMarkReady: true, canCancel: true,
      canAssignDriver: true, canDispatch: true, canRecalculateRoute: true, canComplete: true,
      canPrint: true, canEdit: true,
    },
    availableActions: actions,
    marketplaceOperation: { state: 'NONE' },
    syncState: 'NONE',
    financialSummary: {
      operationalValue: 30, operationalValueLabel: 'Venda', saleAmount: 30,
      customerPaid: null, paymentState: 'UNKNOWN', paymentLabel: 'Pagamento não confirmado',
    },
    deliverySummary: { ownership: 'MERCHANT', label: 'Entrega própria' },
    productionSummary: { state: 'NOT_SENT', label: 'Aguardando cozinha' },
    primaryAction: actions[0] ?? null,
    secondaryActions: actions.slice(1),
  };
  return {
    id: 'order-1', orderNumber: '101', status: 'pending', fulfillmentType: 'delivery',
    customerName: 'Cliente', total: 30, itemsSubtotal: 25, itemCount: 1,
    itemsSummary: '1x Item', createdAt: new Date(0).toISOString(), operational,
  };
}

describe('resolveKanbanDropAction', () => {
  it('resolves a safe PedeHub preparation transition from the available policy', () => {
    const action = createAction('START_PREPARATION', 'preparing');
    expect(resolveKanbanDropAction(createOrder([action]), 'production')).toEqual({ action, message: null });
  });

  it('uses the same provider-async confirmation action as the primary button', () => {
    const action = createAction('CONFIRM', 'confirmed', 'PROVIDER_ASYNC');
    expect(resolveKanbanDropAction(createOrder([action]), 'production').action).toBe(action);
  });

  it('rejects invalid and disabled drops with friendly feedback', () => {
    expect(resolveKanbanDropAction(createOrder([]), 'entry').action).toBeNull();
    const disabled = createAction('MARK_READY', 'ready_for_delivery', 'DISABLED', false);
    expect(resolveKanbanDropAction(createOrder([disabled]), 'delivery')).toEqual({
      action: null,
      message: 'Ação indisponível.',
    });
  });

  it('never executes irreversible completion through drag and drop', () => {
    const complete = createAction('COMPLETE', 'completed');
    expect(resolveKanbanDropAction(createOrder([complete]), 'delivery').action).toBeNull();
  });

  it('cannot turn provider-owned or unknown delivery into own-fleet dispatch', () => {
    const dispatch = createAction('DISPATCH', 'out_for_delivery', 'DISABLED', false);
    expect(resolveKanbanDropAction(createOrder([dispatch]), 'delivery').action).toBeNull();
  });
});
