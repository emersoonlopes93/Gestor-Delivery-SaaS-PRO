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

@Controller('delivery/driver')
@UseGuards(DriverAuthGuard)
export class DriverOperationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('active-runs')
  async getActiveRuns(@Req() req: Request) {
    const user = req.user as any;
    
    const runs = await this.prisma.order.findMany({
      where: {
        tenantId: user.tenantId,
        deliveryDriverId: user.sub,
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
  async completeRun(@Req() req: Request, @Param('id') orderId: string) {
    const user = req.user as any;

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        tenantId: user.tenantId,
        deliveryDriverId: user.sub,
        status: 'out_for_delivery'
      }
    });

    if (!order) {
      throw new NotFoundException('Delivery not found or not currently active for you.');
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: order.id },
      data: { status: 'delivered' }
    });

    return updatedOrder;
  }
}
