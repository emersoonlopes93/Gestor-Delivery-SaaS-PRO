import { Controller, Post, Body, UseGuards, Param, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AsaasBillingClientService } from '../../billing/asaas-billing-client.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';

@Controller('admin/billing/asaas')
@UseGuards(AdminAuthGuard)
export class AsaasAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly asaasClient: AsaasBillingClientService
  ) {}

  @Post('subscriptions/:tenantId')
  async createSubscription(
    @Param('tenantId') tenantId: string,
    @Body() body: { planId: string; cycle: 'MONTHLY' | 'YEARLY'; billingType: 'BOLETO' | 'CREDIT_CARD' | 'PIX' }
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new BadRequestException('Tenant nao encontrado');

    const plan = await this.prisma.billingPlan.findUnique({ where: { id: body.planId } });
    if (!plan) throw new BadRequestException('Plano nao encontrado');

    let customerId = '';
    const existingSub = await this.prisma.tenantBillingSubscription.findFirst({
      where: { tenantId, provider: 'asaas' }
    });

    if (existingSub?.providerCustomerId) {
      customerId = existingSub.providerCustomerId;
    } else {
      const asaasCustomer = await this.asaasClient.createCustomer({
        name: tenant.name,
        cpfCnpj: '00000000000', // CPF/CNPJ mock
        externalReference: tenantId,
        notificationDisabled: false,
      });
      customerId = asaasCustomer.id;
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);

    const asaasSub = await this.asaasClient.createSubscription({
      customer: customerId,
      billingType: body.billingType || 'PIX',
      value: 100, 
      nextDueDate: dueDate.toISOString().split('T')[0],
      cycle: body.cycle || 'MONTHLY',
      description: `Assinatura ${plan.name}`,
      externalReference: `${tenantId}-${plan.id}`,
    });

    let savedSub;
    if (existingSub) {
      savedSub = await this.prisma.tenantBillingSubscription.update({
        where: { id: existingSub.id },
        data: {
          billingPlanId: plan.id,
          status: 'active',
          provider: 'asaas',
          providerCustomerId: customerId,
          providerSubscriptionId: asaasSub.id,
          currentCycleEndsAt: dueDate
        }
      });
    } else {
      savedSub = await this.prisma.tenantBillingSubscription.create({
        data: {
          tenantId,
          billingPlanId: plan.id,
          status: 'active',
          startedAt: new Date(),
          requiresPaymentMethod: false,
          provider: 'asaas',
          providerCustomerId: customerId,
          providerSubscriptionId: asaasSub.id,
          currentCycleEndsAt: dueDate
        }
      });
    }

    return {
      message: 'Assinatura criada',
      asaasSub,
      savedSub
    };
  }
}
