import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
  NotFoundException,
} from '@nestjs/common';
import { DriverAuthGuard } from '../auth/guards/driver-auth.guard';
import { PrismaService } from '../database/prisma.service';
import { DriversService } from './drivers.service';
import { UpdateDriverLocationDTO } from './dto/update-driver-location.dto';
import { AuthenticatedRequest } from '../common/interfaces/request.interface';

@Controller('delivery/driver')
@UseGuards(DriverAuthGuard)
export class DriverOperationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly driversService: DriversService,
  ) {}

  @Get('active-runs')
  async getActiveRuns(@Req() req: AuthenticatedRequest) {
    const user = req.user;

    // BUG 3 FIX: Include ready_for_delivery so driver sees assigned-but-not-yet-dispatched orders
    const runs = await this.prisma.order.findMany({
      where: {
        tenantId: user.tenantId,
        deliveryDriverId: user.id,
        status: { in: ['ready_for_delivery', 'out_for_delivery'] },
      },
      include: {
        deliveryAddress: true,
        items: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return runs.map((run) => ({
      id: run.id,
      orderNumber: run.orderNumber,
      status: run.status,
      customerName: run.customerName,
      customerPhone: run.customerPhone,
      deliveryAddress: run.deliveryAddress
        ? {
            street: run.deliveryAddress.street,
            number: run.deliveryAddress.number,
            neighborhood: run.deliveryAddress.neighborhood,
            city: run.deliveryAddress.city,
            complement: run.deliveryAddress.complement,
          }
        : null,
    }));
  }

  /**
   * BUG 5 FIX: Endpoint para o entregador atualizar sua própria localização via HTTP REST.
   * O app do entregador chama isso periodicamente para garantir persistência no DB,
   * independente do WebSocket.
   */
  @Post('location')
  async updateMyLocation(@Req() req: AuthenticatedRequest, @Body() data: UpdateDriverLocationDTO) {
    const user = req.user;
    return this.driversService.updateDriverLocation(user.tenantId, user.id, data);
  }

  @Patch('runs/:id/complete')
  async completeRun(@Req() req: AuthenticatedRequest, @Param('id') orderId: string) {
    const user = req.user;

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        tenantId: user.tenantId,
        deliveryDriverId: user.id,
        status: 'out_for_delivery',
      },
    });

    if (!order) {
      throw new NotFoundException('Delivery not found or not currently active for you.');
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: order.id },
      data: { status: 'completed' },
    });

    // Back to available
    await this.prisma.deliveryDriver.update({
      where: { id: user.id },
      data: { status: 'available' },
    });

    // Timeline entry
    await this.prisma.orderTimeline.create({
      data: {
        orderId: order.id,
        tenantId: user.tenantId,
        status: 'completed',
        note: 'Entrega concluída pelo entregador.',
      },
    });

    return updatedOrder;
  }
}
