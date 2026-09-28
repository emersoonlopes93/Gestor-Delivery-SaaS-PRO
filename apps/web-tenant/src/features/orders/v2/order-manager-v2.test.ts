import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OrderBoardItemDTO } from '@gestor/types';
import { OrderAlertCoordinator } from './order-alert-coordinator';
import { filterManagerOrders, formatElapsed, getOperationalIntelligence, groupOrdersForManager, isRunnableStatusAction, matchesOrderSearch, privacySafeOrderPhrase } from './order-manager-v2';

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
    expect(groups.kitchen).toHaveLength(1); expect(groups.ready).toHaveLength(1); expect(groups.route).toHaveLength(1);
  });
  it('preserves board search and origin filtering', () => {
    expect(filterManagerOrders([order('pending')], '1042', 'PEDEHUB')).toHaveLength(1);
    expect(filterManagerOrders([order('pending')], '1042', 'IFOOD')).toHaveLength(0);
  });
  it('derives compact cockpit counts from the reconciled operational board', () => {
    const ready = order('ready_for_delivery', { fulfillmentType: 'delivery' });
    const pending = order('pending', { operational: { ...order('pending').operational, origin: 'IFOOD' } });
    const result = getOperationalIntelligence([ready, pending], Date.parse('2026-09-10T12:40:00.000Z'));
    expect(result).toMatchObject({ waitingAction: 1, delayed: 2, ready: 1, delivery: 2, pickup: 0, channels: { PEDEHUB: 1, IFOOD: 1, FOOD_99: 0 } });
  });
  it('keeps every channel in the same mini-KPI visual system, including zero counts', () => {
    const page = readFileSync(resolve(__dirname, 'OrderManagerV2Page.tsx'), 'utf8');
    expect(page).toContain('Metric label="PedeHub" value={intelligence.channels.PEDEHUB}');
    expect(page).toContain('Metric label="iFood" value={intelligence.channels.IFOOD}');
    expect(page).toContain('Metric label="99Food" value={intelligence.channels.FOOD_99}');
    expect(page).not.toContain('.filter((channel) => channel.count > 0)');
  });
  it('searches locally across item composition and short notes without accents', () => {
    const searchable = order('pending', { itemsSummary: 'Pizza Calabresa', searchText: 'Catupiry, bacon, borda cheddar complemento', notes: 'sem cebola' });
    expect(matchesOrderSearch(searchable, 'calabresa')).toBe(true);
    expect(matchesOrderSearch(searchable, 'catupiry')).toBe(true);
    expect(matchesOrderSearch(searchable, 'bacon')).toBe(true);
    expect(matchesOrderSearch(searchable, 'cheddar')).toBe(true);
    expect(matchesOrderSearch(searchable, 'complemento')).toBe(true);
    expect(matchesOrderSearch(searchable, 'CEBOLA')).toBe(true);
    expect(matchesOrderSearch(order('pending', { customerName: 'Mário' }), 'mario')).toBe(true);
    expect(matchesOrderSearch(searchable, '')).toBe(true);
    expect(matchesOrderSearch(searchable, 'inexistente')).toBe(false);
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
  it('keeps operational actions and channel selection inside the V2 cockpit', () => {
    const controlCenter = readFileSync(resolve(__dirname, 'OperationalControlCenter.tsx'), 'utf8');
    const overlay = readFileSync(resolve(__dirname, 'OperationalOverlay.tsx'), 'utf8');
    const page = readFileSync(resolve(__dirname, 'OrderManagerV2Page.tsx'), 'utf8');
    const sidebar = readFileSync(resolve(__dirname, '../../../layouts/AppLayout.tsx'), 'utf8');
    expect(controlCenter).not.toContain('/tenant/store-pause');
    expect(controlCenter).not.toContain("navigate('");
    expect(controlCenter).toContain('<OperationalOverlay title="Tempos e taxas"');
    expect(controlCenter).toContain('<OperationalOverlay title="Radar da frota"');
    expect(page).toContain('Painel de pedidos');
    expect(page).toContain('<OperationalQuickActions orders={orders} onOpenOrder={setSelected} />');
    expect(page.indexOf('<header')).toBeLessThan(page.indexOf('<OperationalControlCenter'));
    expect(controlCenter).toContain('<OperationalOverlay title="Lançamentos de caixa"');
    expect(controlCenter).toContain("onTabChange('delivery')");
    expect(controlCenter).toContain("onTabChange('pickup')");
    expect(page).toContain('filterOrdersForOperationalTab(filterManagerOrders(orders, query, origin), operationalTab)');
    expect(page).toContain('OPERATIONAL_TAB_LANES[operationalTab].includes(lane.id)');
    expect(overlay).toContain("event.key === 'Escape'");
    expect(overlay).toContain('aria-modal="true"');
    expect(sidebar).toContain('/tenant/store-pause');
  });

  it('uses explicit mobile stage tabs instead of a horizontally scrolling mobile kanban', () => {
    const source = readFileSync(resolve(__dirname, 'OrderManagerV2Page.tsx'), 'utf8');
    expect(source).toContain('Etapas do kanban');
    expect(source).toContain('activeMobileLane');
    expect(source).toContain('setActiveMobileLane');
    expect(source).toContain('sm:overflow-x-auto');
    expect(source).not.toContain('min-w-[calc(100vw-2.5rem)]');
    expect(source).toContain('sm:min-w-[22rem]');
    expect(source).toContain('sm:snap-mandatory');
    expect(source).toContain('sm:overscroll-x-contain');
    expect(source).toContain('sm:scroll-px-3');
    expect(source).toContain('grid-cols-4');
    expect(source).toContain('xl:grid-cols-3');
  });

  it('keeps alert settings and cross-tab coordination while moving the trigger to the global topbar', () => {
    const page = readFileSync(resolve(__dirname, 'OrderManagerV2Page.tsx'), 'utf8');
    const center = readFileSync(resolve(__dirname, '../../../notifications/NotificationCenter.tsx'), 'utf8');
    const layout = readFileSync(resolve(__dirname, '../../../layouts/AppLayout.tsx'), 'utf8');
    const topbar = readFileSync(resolve(__dirname, 'OrderAlertTopbarButton.tsx'), 'utf8');
    expect(page).toContain('Central de alertas');
    expect(page).toContain('ORDER_ALERT_CENTER_TOGGLE_EVENT');
    expect(page).not.toContain('relógio compartilhado');
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
    expect(layout).toContain('<OrderAlertTopbarButton />');
    expect(topbar).toContain('ORDER_ALERT_CENTER_TOGGLE_EVENT');
    expect(topbar).toContain("'/order-alerts'");
  });

  it('keeps search and filters outside the persisted collapsible cockpit panel', () => {
    const page = readFileSync(resolve(__dirname, 'OrderManagerV2Page.tsx'), 'utf8');
    expect(page).toContain('COCKPIT_COLLAPSED_STORAGE_KEY');
    expect(page).toContain('aria-expanded={!cockpitCollapsed}');
    expect(page).toContain('aria-controls="order-manager-v2-cockpit-expanded"');
    expect(page).toContain('hidden={cockpitCollapsed}');
    expect(page.indexOf('Buscar pedido, cliente ou item')).toBeGreaterThan(page.indexOf('order-manager-v2-cockpit-expanded'));
    expect(page).toContain('Metric label="Ativos"');
    expect(page).toContain('2xl:justify-end');
    expect(page).toContain('sm:w-[260px]');
  });

  it('labels card scan indicators and repeats operational context in details', () => {
    const card = readFileSync(resolve(__dirname, 'OrderCardV2.tsx'), 'utf8');
    const details = readFileSync(resolve(__dirname, 'OrderDetailsModalV2.tsx'), 'utf8');
    expect(card).toContain('Indicadores operacionais');
    expect(card).not.toContain('Logistica da loja');
    expect(details).toContain('Logística');
    expect(card).toContain('Não foi possível atualizar a plataforma. Confira o estado antes de tentar novamente.');
    expect(card).toContain('Atualização com a plataforma em andamento');
    expect(card).toContain('Aberto há');
    expect(card).not.toContain('deliveryStatement');
    expect(card).not.toContain('financialSummary.operationalValue');
    expect(details).toContain('Não foi possível atualizar a plataforma. Confira o estado antes de tentar novamente.');
    expect(details).toContain('Resumo operacional do pedido');
    expect(details).toContain('Proxima acao');
    expect(details).toContain('formatElapsed');
    expect(card).toContain('onAction(order, action)');
    expect(card).toContain('pointer-events-auto relative z-10');
    expect(details).toContain('Acoes de status do pedido');
    expect(readFileSync(resolve(__dirname, 'OrderManagerV2Page.tsx'), 'utf8')).toContain('/orders/${order.id}/status');
    expect(readFileSync(resolve(__dirname, 'OrderManagerV2Page.tsx'), 'utf8')).toContain('void reconcile({ eventId: `status-updated:${order.id}:${Date.now()}`');
    expect(card).toContain('alertSeverity');
    expect(card).toContain('onOpenAlert');
    expect(readFileSync(resolve(__dirname, 'OrderManagerV2Page.tsx'), 'utf8')).toContain('activeAlertSeverityByOrderId');
    expect(readFileSync(resolve(__dirname, 'OrderManagerV2Page.tsx'), 'utf8')).toContain('ORDER_ALERT_CENTER_TOGGLE_EVENT');
    expect(readFileSync(resolve(__dirname, 'OrderManagerV2Page.tsx'), 'utf8')).toContain('Resumo da operação');
    expect(readFileSync(resolve(__dirname, 'OrderManagerV2Page.tsx'), 'utf8')).toContain('Pedidos exibidos');
    expect(readFileSync(resolve(__dirname, 'OrderManagerV2Page.tsx'), 'utf8')).toContain('Limpar filtros');
    expect(readFileSync(resolve(__dirname, 'OrderManagerV2Page.tsx'), 'utf8')).toContain('OPERATIONAL_TAB_LABELS');
    expect(readFileSync(resolve(__dirname, 'OrderManagerV2Page.tsx'), 'utf8')).toContain('para {operationalContextLabel}');
    expect(readFileSync(resolve(__dirname, 'OrderManagerV2Page.tsx'), 'utf8')).toContain('Ação imediata');
    expect(readFileSync(resolve(__dirname, 'OrderManagerV2Page.tsx'), 'utf8')).toContain('Requer atenção');
  });

  it('wires accessible print actions to the canonical receipt flow', () => {
    const card = readFileSync(resolve(__dirname, 'OrderCardV2.tsx'), 'utf8');
    const details = readFileSync(resolve(__dirname, 'OrderDetailsModalV2.tsx'), 'utf8');
    const page = readFileSync(resolve(__dirname, 'OrderManagerV2Page.tsx'), 'utf8');
    const printFlow = readFileSync(resolve(__dirname, '../order-print.ts'), 'utf8');
    expect(card).toContain('title="Imprimir pedido"');
    expect(card).toContain('onPrint(order)');
    expect(details).toContain('title="Imprimir pedido"');
    expect(details).toContain('onPrint(order)');
    expect(page).toContain('printOrderCustomerReceipt');
    expect(page).toContain('Não foi possível imprimir o pedido');
    expect(printFlow).toContain('/pos/sales/${orderId}/print?type=customer');
    expect(printFlow).toContain('/orders/${orderId}/print-log');
    expect(printFlow).toContain('printTicketViaPrimaryBluetooth');
    expect(printFlow).toContain('printThermalText');
  });

  it('renders the complete fetched order in V2 details instead of only base item names', () => {
    const details = readFileSync(resolve(__dirname, 'OrderDetailsModalV2.tsx'), 'utf8');
    expect(details).toContain("import { OrderCustomerSection } from '../components/OrderCustomerSection'");
    expect(details).toContain("import { OrderFulfillmentSection } from '../components/OrderFulfillmentSection'");
    expect(details).toContain("import { OrderItemsSection } from '../components/OrderItemsSection'");
    expect(details).toContain("import { OrderPaymentSection } from '../components/OrderPaymentSection'");
    expect(details).toContain("missingPhoneMessage={origin === 'FOOD_99'");
    expect(details).toContain('financialSummary={detail.operational?.financialSummary}');
  });
});
