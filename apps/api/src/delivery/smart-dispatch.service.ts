import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { getLocationFreshness, type SmartDispatchSuggestionDTO } from '@gestor/types';
import { PrismaService } from '../database/prisma.service';
import { DeliveryRunsService } from './delivery-runs.service';
import { evaluateOwnFleetEligibility } from './own-fleet-eligibility';

const activeRunStatuses = ['PENDING_ACCEPTANCE', 'ASSIGNED', 'IN_PROGRESS', 'RETURNING'] as const;

@Injectable()
export class SmartDispatchService {
  private readonly logger = new Logger(SmartDispatchService.name);

  constructor(private readonly prisma: PrismaService, private readonly runs: DeliveryRunsService) {}

  async suggestion(tenantId: string): Promise<SmartDispatchSuggestionDTO> {
    const settings = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    if (!settings || settings.smartDispatchMode !== 'ASSISTED' || !settings.smartDispatchUseQueue) {
      return { driver: null, queue: [], orderIds: [], reasons: [], manualFallback: true };
    }
    const [drivers, orders] = await Promise.all([
      this.prisma.deliveryDriver.findMany({
        where: { tenantId, isActive: true, status: 'available', dispatchQueueJoinedAt: { not: null }, shifts: { some: { status: 'ACTIVE' } }, deliveryRuns: { none: { status: { in: [...activeRunStatuses] } } } },
        orderBy: [{ dispatchQueueJoinedAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.order.findMany({
        where: { tenantId, fulfillmentType: 'delivery', status: 'ready_for_delivery', deliveryStops: { none: { run: { status: { in: [...activeRunStatuses] } } } } },
        include: { deliveryAddress: true, marketplaceOrders: { select: { provider: true, deliveryOwnership: true } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const eligibleOrders = orders.filter((order) => {
      const eligibility = evaluateOwnFleetEligibility(order.marketplaceOrders);
      if (!eligibility.eligible) {
        this.logger.warn({
          event: 'own_fleet_order_blocked', tenantId, orderId: order.id,
          provider: eligibility.provider, deliveryOwnership: eligibility.deliveryOwnership,
          reason: eligibility.reason,
        });
      }
      return eligibility.eligible;
    });
    const queue = drivers.map((driver, index) => {
      const fresh = getLocationFreshness(driver.lastLocationAt);
      const hasCoordinates = driver.currentLat !== null && driver.currentLng !== null && settings.lat !== null && settings.lng !== null;
      const distanceKm = hasCoordinates ? haversine(settings.lat!, settings.lng!, driver.currentLat!, driver.currentLng!) : null;
      const status = fresh.status !== 'fresh' || distanceKm === null ? 'bypassed_stale_location' as const : settings.smartDispatchBypassDistance && distanceKm > settings.smartDispatchDistanceKm ? 'bypassed_distance' as const : 'eligible' as const;
      return { driverId: driver.id, name: driver.name, queuePosition: index + 1, distanceKm, status, reason: status === 'eligible' ? null : status === 'bypassed_distance' ? 'Longe da loja' : 'Localização desatualizada' };
    });
    const candidate = queue.find((driver) => driver.status === 'eligible') ?? null;
    const orderIds = candidate
      ? nearbyOrders(
        eligibleOrders,
        settings.smartDispatchAutoCarona ? settings.smartDispatchMaxStops : 1,
        settings.smartDispatchGroupingKm,
      )
      : [];
    return { driver: candidate, queue, orderIds, reasons: candidate ? ['FIFO_POSITION', 'NEARBY_DESTINATION'] : [], manualFallback: !candidate || orderIds.length === 0 };
  }

  async accept(tenantId: string, actorId: string, driverId: string, orderIds: string[]) {
    const suggestion = await this.suggestion(tenantId);
    if (!suggestion.driver || suggestion.driver.driverId !== driverId || orderIds.length === 0 || orderIds.some((id) => !suggestion.orderIds.includes(id))) {
      throw new BadRequestException('A sugestão não está mais disponível. Atualize antes de despachar.');
    }
    return this.runs.createAssignedRun(tenantId, driverId, orderIds, actorId);
  }
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) { const r = 6371; const d = Math.PI / 180; const a = Math.sin((lat2 - lat1) * d / 2) ** 2 + Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin((lng2 - lng1) * d / 2) ** 2; return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); }
function nearbyOrders(orders: Array<{ id: string; deliveryAddress: { lat: number | null; lng: number | null } | null }>, max: number, radius: number) { const seed = orders[0]; if (!seed) return []; const address = seed.deliveryAddress; return orders.filter((order) => { if (!address || !order.deliveryAddress || address.lat === null || address.lng === null || order.deliveryAddress.lat === null || order.deliveryAddress.lng === null) return order.id === seed.id; return haversine(address.lat, address.lng, order.deliveryAddress.lat, order.deliveryAddress.lng) <= radius; }).slice(0, max).map((order) => order.id); }
