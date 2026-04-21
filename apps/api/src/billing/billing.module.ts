import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, PrismaService, TenantContextService],
  exports: [BillingService],
})
export class BillingModule {}
