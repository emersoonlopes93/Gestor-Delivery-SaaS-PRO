import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
  Req,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { DriverAuthGuard } from '../auth/guards/driver-auth.guard';
import { PrismaService } from '../database/prisma.service';

import { AuthenticatedRequest } from '../common/interfaces/request.interface';

@Controller('delivery/driver')
@UseGuards(DriverAuthGuard)
export class DriverOperationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('active-runs')
  async getActiveRuns(@Req() req: AuthenticatedRequest) {
    const user = req.user;
    
    const runs = await this.prisma.order.findMany({
      where: {
        tenantId: user.tenantId,
        deliveryDriverId: user.id, // drivers use sub/id as driverId
        status: 'out_for_delivery',
      },
      include: {
        deliveryAddress: true,
        items: true,
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    return runs;
  }

  @Patch('runs/:id/complete')
  async completeRun(@Req() req: AuthenticatedRequest, @Param('id') orderId: string) {
    const user = req.user;

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        tenantId: user.tenantId,
        deliveryDriverId: user.id,
        status: 'out_for_delivery'
      }
    });

    if (!order) {
      throw new NotFoundException('Delivery not found or not currently active for you.');
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: order.id },
      data: { status: 'completed' }
    });

    return updatedOrder;
  }
}
