import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OnlinePaymentActivationStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class OnlinePaymentActivationService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(tenantId: string) {
    return (await this.prisma.onlinePaymentActivation.findUnique({ where: { tenantId } }))
      ?? { tenantId, status: OnlinePaymentActivationStatus.NOT_REQUESTED };
  }

  async requestActivation(input: { tenantId: string; actorUserId: string; termsVersion: string }) {
    const termsVersion = input.termsVersion.trim();
    if (!termsVersion || termsVersion.length > 80) throw new BadRequestException('Payment terms version is invalid.');
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true } });
      if (!tenant) throw new NotFoundException('Tenant not found.');
      const activation = await tx.onlinePaymentActivation.upsert({
        where: { tenantId: input.tenantId },
        update: {},
        create: {
          tenantId: input.tenantId,
          status: OnlinePaymentActivationStatus.PENDING_ONBOARDING,
          requestedAt: now,
          termsAcceptedAt: now,
          termsVersion,
          termsAcceptedByUserId: input.actorUserId,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.actorUserId,
          userType: 'tenant_user',
          action: 'payment.online_activation_requested',
          resource: 'online_payment_activation',
          details: { activationId: activation.id, status: activation.status, termsVersion: activation.termsVersion },
        },
      });
      return activation;
    });
  }

  async updateOnboardingState(tenantId: string, status: OnlinePaymentActivationStatus, failureReason?: string | null) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const activation = await tx.onlinePaymentActivation.update({
        where: { tenantId },
        data: {
          status,
          onboardingStartedAt: status === OnlinePaymentActivationStatus.PENDING_KYC ? now : undefined,
          activatedAt: status === OnlinePaymentActivationStatus.ACTIVE ? now : undefined,
          suspendedAt: status === OnlinePaymentActivationStatus.SUSPENDED ? now : undefined,
          failureReason: failureReason ?? undefined,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: null,
          userType: 'system',
          action: 'payment.online_activation_status_changed',
          resource: 'online_payment_activation',
          details: { activationId: activation.id, status, hasFailureReason: Boolean(failureReason) },
        },
      });
      return activation;
    });
  }
}
