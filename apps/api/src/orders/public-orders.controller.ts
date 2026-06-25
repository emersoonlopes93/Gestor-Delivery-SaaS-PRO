import { Controller, Get, NotFoundException, Param, Query, UseGuards, Post, Body, BadRequestException } from '@nestjs/common';
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

  @Public()
  @Get(':token/feedback-info')
  @Throttle({ public: { limit: 30, ttl: 60 } })
  async getFeedbackInfo(@Param('token') token: string) {
    if (!token) throw new NotFoundException('Pedido não encontrado');

    const order = await this.prisma.order.findUnique({
      where: { publicTrackingToken: token },
      include: { tenant: true, OrderFeedback: true },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado');

    const automation = await this.prisma.marketingAutomation.findUnique({
      where: { tenantId_type: { tenantId: order.tenantId, type: 'post_order_review' } },
    });

    const config = (automation?.config as Record<string, unknown>) || {};

    return {
      storeName: order.tenant.name,
      orderNumber: order.orderNumber,
      alreadyResponded: !!order.OrderFeedback,
      googleReviewUrl: config.googleReviewUrl as string | undefined,
      facebookUrl: config.facebookUrl as string | undefined,
      instagramUrl: config.instagramUrl as string | undefined,
      shareText: config.shareText as string | undefined,
      highRatingMessage: config.highRatingMessage as string | undefined,
      lowRatingMessage: config.lowRatingMessage as string | undefined,
    };
  }

  @Public()
  @Post(':token/feedback')
  @Throttle({ public: { limit: 10, ttl: 60 } })
  async submitFeedback(
    @Param('token') token: string,
    @Body() body: { rating: number; comment?: string },
  ) {
    if (!token || !body.rating || body.rating < 1 || body.rating > 5) {
      throw new BadRequestException('Dados inválidos');
    }

    const order = await this.prisma.order.findUnique({
      where: { publicTrackingToken: token },
      include: { OrderFeedback: true },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (order.OrderFeedback) throw new BadRequestException('Feedback já registrado');

    await this.prisma.orderFeedback.create({
      data: {
        tenantId: order.tenantId,
        orderId: order.id,
        customerId: order.customerId,
        rating: body.rating,
        comment: body.comment,
      },
    });

    return { success: true };
  }

  @Public()
  @Post(':token/feedback-click')
  @Throttle({ public: { limit: 10, ttl: 60 } })
  async registerFeedbackClick(
    @Param('token') token: string,
    @Body() body: { channel: string },
  ) {
    if (!token || !body.channel) throw new BadRequestException('Dados inválidos');

    const order = await this.prisma.order.findUnique({
      where: { publicTrackingToken: token },
      include: { OrderFeedback: true },
    });

    if (!order || !order.OrderFeedback) throw new NotFoundException('Feedback não encontrado');

    await this.prisma.orderFeedback.update({
      where: { id: order.OrderFeedback.id },
      data: {
        publicReviewClicked: true,
        clickedChannel: body.channel,
      },
    });

    return { success: true };
  }
}
