import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { Public } from '../common/decorators';
import { PrismaService } from '../database/prisma.service';
import { Throttle } from '@nestjs/throttler';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' ? v : null;
}

function pickNumber(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  return typeof v === 'number' ? v : null;
}

@Public()
@Controller('public/orders')
export class PublicOrdersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':token/tracking')
  @Throttle({ public: { limit: 60, ttl: 60 } })
  async tracking(@Param('token') token: string) {
    if (!token) {
      throw new NotFoundException('Pedido não encontrado');
    }

    const orderRaw: unknown = await this.prisma.order.findUnique({
      where: {
        publicTrackingToken: token,
      },
      select: {
        id: true,
        status: true,
        deliveryDriverId: true,
        deliveryDriver: {
          select: {
            id: true,
            name: true,
            currentLat: true,
            currentLng: true,
            lastLocationAt: true,
          },
        },
      },
    });

    const order = asRecord(orderRaw);

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    const orderId = pickString(order, 'id');
    const status = pickString(order, 'status');
    const isInRoute = status === 'out_for_delivery';
    const deliveryDriver = asRecord(order.deliveryDriver);

    if (!orderId || !status) {
      throw new NotFoundException('Pedido não encontrado');
    }

    const driverId = deliveryDriver ? pickString(deliveryDriver, 'id') : null;
    const driverName = deliveryDriver ? pickString(deliveryDriver, 'name') : null;

    const currentLat = deliveryDriver ? pickNumber(deliveryDriver, 'currentLat') : null;
    const currentLng = deliveryDriver ? pickNumber(deliveryDriver, 'currentLng') : null;
    const lastLocationAt = deliveryDriver ? deliveryDriver.lastLocationAt : null;

    return {
      orderId,
      status,
      driver: driverId && driverName ? { id: driverId, name: driverName } : null,
      driverLocation:
        isInRoute && currentLat != null && currentLng != null
          ? {
              lat: currentLat,
              lng: currentLng,
              lastLocationAt,
            }
          : null,
    };
  }
}
