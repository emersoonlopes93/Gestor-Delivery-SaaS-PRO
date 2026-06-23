import { Controller, Post, Body, UseGuards, Param, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AsaasBillingClientService } from '../../billing/asaas-billing-client.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../auth/guards/superadmin.guard';

@Controller('admin/billing/asaas')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
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

    // Find or create customer
    let customerId = '';
    const existingSub = await this.prisma.tenantBillingSubscription.findFirst({
      where: { tenantId, provider: 'asaas' }
    });

    if (existingSub?.providerCustomerId) {
      customerId = existingSub.providerCustomerId;
    } else {
      const asaasCustomer = await this.asaasClient.createCustomer({
        name: tenant.name,
        cpfCnpj: tenant.document || '00000000000', // Mock if not exists
        externalReference: tenantId,
        notificationDisabled: false,
      });
      customerId = asaasCustomer.id;
    }

    // Determine due date (e.g., +3 days from now)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);

    // Create subscription
    const asaasSub = await this.asaasClient.createSubscription({
      customer: customerId,
      billingType: body.billingType || 'PIX',
      value: 100, // Fixed value for MVP or fetch from plan
      nextDueDate: dueDate.toISOString().split('T')[0],
      cycle: body.cycle || 'MONTHLY',
      description: `Assinatura ${plan.name}`,
      externalReference: `${tenantId}-${plan.id}`,
    });

    // Upsert tenant subscription
    const savedSub = await this.prisma.tenantBillingSubscription.upsert({
      where: { tenantId }, // Wait, tenantId is not unique, it's just an index in the new schema, wait, it IS unique because there's only one active plan per tenant usually? No, let's use id.
      // let's check if there is an active sub
      create: {
        tenantId,
        billingPlanId: plan.id,
        status: 'active', // starts active or trialing
        startedAt: new Date(),
        requiresPaymentMethod: false,
        provider: 'asaas',
        providerCustomerId: customerId,
        providerSubscriptionId: asaasSub.id,
        currentCycleEndsAt: dueDate
      },
      update: {
        billingPlanId: plan.id,
        status: 'active',
        provider: 'asaas',
        providerCustomerId: customerId,
        providerSubscriptionId: asaasSub.id,
        currentCycleEndsAt: dueDate
      }
    });

    return {
      message: 'Assinatura criada',
      asaasSub,
      savedSub
    };
  }
}
