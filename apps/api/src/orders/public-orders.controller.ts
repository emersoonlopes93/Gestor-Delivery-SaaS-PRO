import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { Public, CurrentCustomer } from '../common/decorators';
import { PrismaService } from '../database/prisma.service';
import { Throttle } from '@nestjs/throttler';
import { OrdersService } from './orders.service';
import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { CustomerJwtPayload } from '@gestor/types';

@Controller('public/orders')
export class PublicOrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  @Get('history')
  @UseGuards(CustomerAuthGuard)
  async history(
    @CurrentCustomer() customer: CustomerJwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ordersService.listCustomerOrders(
      customer.tenantId,
      customer.sub,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get(':id')
  @UseGuards(CustomerAuthGuard)
  async detail(
    @CurrentCustomer() customer: CustomerJwtPayload,
    @Param('id') id: string,
  ) {
    return this.ordersService.getOrderDetail(id, customer.tenantId);
  }

  @Public()
  @Get(':token/tracking')
  @Throttle({ public: { limit: 60, ttl: 60 } })
  async tracking(@Param('token') token: string) {
    if (!token) {
      throw new NotFoundException('Pedido não encontrado');
    }

    const order = await this.prisma.order.findUnique({
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

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    const isInRoute = order.status === 'out_for_delivery';
    const deliveryDriver = order.deliveryDriver;

    const driverId = deliveryDriver ? deliveryDriver.id : null;
    const driverName = deliveryDriver ? deliveryDriver.name : null;

    const currentLat = deliveryDriver ? Number(deliveryDriver.currentLat) : null;
    const currentLng = deliveryDriver ? Number(deliveryDriver.currentLng) : null;
    const lastLocationAt = deliveryDriver ? deliveryDriver.lastLocationAt : null;

    return {
      orderId: order.id,
      status: order.status,
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
