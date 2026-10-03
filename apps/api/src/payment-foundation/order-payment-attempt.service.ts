import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderPaymentAttempt,
  OrderPaymentAttemptStatus,
  PaymentProvider,
  PaymentProviderConnectionStatus,
  OnlinePaymentActivationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PlatformFeePolicyService } from './platform-fee-policy.service';

const ALLOWED_STATUS_TRANSITIONS: Record<OrderPaymentAttemptStatus, OrderPaymentAttemptStatus[]> = {
  CREATED: [
    OrderPaymentAttemptStatus.PENDING,
    OrderPaymentAttemptStatus.FAILED,
    OrderPaymentAttemptStatus.CANCELED,
  ],
  PENDING: [
    OrderPaymentAttemptStatus.PAID,
    OrderPaymentAttemptStatus.FAILED,
    OrderPaymentAttemptStatus.EXPIRED,
    OrderPaymentAttemptStatus.CANCELED,
  ],
  PAID: [OrderPaymentAttemptStatus.PARTIALLY_REFUNDED, OrderPaymentAttemptStatus.REFUNDED],
  FAILED: [],
  EXPIRED: [],
  CANCELED: [],
  REFUNDED: [],
  PARTIALLY_REFUNDED: [OrderPaymentAttemptStatus.REFUNDED],
};

@Injectable()
export class OrderPaymentAttemptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformFeePolicyService: PlatformFeePolicyService,
  ) {}

  async createAttempt(input: {
    tenantId: string;
    orderId: string;
    provider: PaymentProvider;
    providerConnectionId?: string | null;
    idempotencyKey: string;
    expiresAt?: Date | null;
    requireOnlinePaymentActivation?: boolean;
  }): Promise<OrderPaymentAttempt> {
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey || idempotencyKey.length > 160) {
      throw new BadRequestException('Payment attempt idempotency key is invalid.');
    }

    const existing = await this.findByIdempotency(input.tenantId, input.orderId, idempotencyKey);
    if (existing) {
      this.assertSameLogicalOperation(existing, input);
      return existing;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: input.orderId, tenantId: input.tenantId },
          select: {
            id: true,
            total: true,
            tenant: {
              select: {
                settings: { select: { currency: true } },
              },
            },
          },
        });
        if (!order) throw new NotFoundException('Order not found for tenant.');

        if (input.providerConnectionId) {
          const connection = await tx.paymentProviderConnection.findFirst({
            where: {
              id: input.providerConnectionId,
              tenantId: input.tenantId,
              provider: input.provider,
              status: PaymentProviderConnectionStatus.CONNECTED,
            },
            select: { id: true },
          });
          if (!connection) {
            throw new NotFoundException('Connected payment provider connection not found for tenant.');
          }
        }

        if (input.requireOnlinePaymentActivation) {
          const activation = await tx.onlinePaymentActivation.findUnique({
            where: { tenantId: input.tenantId },
            select: { status: true },
          });
          if (activation?.status !== OnlinePaymentActivationStatus.ACTIVE) {
            throw new ConflictException('Online payments are not active for this tenant.');
          }
        }

        const effectiveAt = new Date();
        const resolvedFee = await this.platformFeePolicyService.resolveForTenant(
          input.tenantId,
          effectiveAt,
          tx,
        );
        const created = await tx.orderPaymentAttempt.create({
          data: {
            tenantId: input.tenantId,
            orderId: order.id,
            provider: input.provider,
            providerConnectionId: input.providerConnectionId ?? null,
            idempotencyKey,
            amount: order.total,
            currency: order.tenant.settings?.currency ?? 'BRL',
            expiresAt: input.expiresAt ?? null,
            platformFeePolicyId: resolvedFee.policy.id,
            platformFeePolicyVersion: resolvedFee.policy.version,
            platformFeeType: resolvedFee.policy.feeType,
            platformFeeExpectedAmount: resolvedFee.amount,
            platformFeeCurrency: resolvedFee.policy.currency,
            tenantPlanSnapshot: resolvedFee.tenantPlanSnapshot,
            platformFeeEntry: {
              create: {
                tenantId: input.tenantId,
                expectedAmount: resolvedFee.amount,
                currency: resolvedFee.policy.currency,
              },
            },
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: input.tenantId,
            userId: null,
            userType: 'system',
            action: 'payment.platform_fee_snapshotted',
            resource: 'order_payment_attempt',
            details: {
              attemptId: created.id,
              policyId: resolvedFee.policy.id,
              policyVersion: resolvedFee.policy.version,
              expectedAmount: resolvedFee.amount.toFixed(2),
              currency: resolvedFee.policy.currency,
              tenantPlanSnapshot: resolvedFee.tenantPlanSnapshot,
            },
          },
        });
        return created;
      });
    } catch (error) {
      if (!this.isUniqueConstraint(error)) throw error;
      const raced = await this.findByIdempotency(input.tenantId, input.orderId, idempotencyKey);
      if (!raced) throw error;
      this.assertSameLogicalOperation(raced, input);
      return raced;
    }
  }

  async listForOrder(tenantId: string, orderId: string): Promise<OrderPaymentAttempt[]> {
    return this.prisma.orderPaymentAttempt.findMany({
      where: { tenantId, orderId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async attachExternalPayment(input: {
    tenantId: string;
    attemptId: string;
    externalPaymentId: string;
    expiresAt?: Date | null;
  }): Promise<OrderPaymentAttempt> {
    const externalPaymentId = input.externalPaymentId.trim();
    if (!externalPaymentId) throw new BadRequestException('External payment ID is required.');

    const attempt = await this.getForTenant(input.tenantId, input.attemptId);
    if (attempt.externalPaymentId && attempt.externalPaymentId !== externalPaymentId) {
      throw new ConflictException('Payment attempt already belongs to another external payment.');
    }
    if (attempt.status !== OrderPaymentAttemptStatus.CREATED
      && attempt.status !== OrderPaymentAttemptStatus.PENDING) {
      throw new ConflictException('Payment attempt no longer accepts an external payment.');
    }

    return this.prisma.orderPaymentAttempt.update({
      where: { id: attempt.id },
      data: {
        externalPaymentId,
        expiresAt: input.expiresAt,
        status: OrderPaymentAttemptStatus.PENDING,
      },
    });
  }

  async transitionStatus(input: {
    tenantId: string;
    attemptId: string;
    status: OrderPaymentAttemptStatus;
    failureCode?: string | null;
    failureReason?: string | null;
  }): Promise<OrderPaymentAttempt> {
    return (await this.transitionStatusOnce(input)).attempt;
  }

  async transitionStatusOnce(input: {
    tenantId: string;
    attemptId: string;
    status: OrderPaymentAttemptStatus;
    failureCode?: string | null;
    failureReason?: string | null;
  }): Promise<{ attempt: OrderPaymentAttempt; transitioned: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.orderPaymentAttempt.findFirst({ where: { id: input.attemptId, tenantId: input.tenantId } });
      if (!attempt) throw new NotFoundException('Payment attempt not found.');
      if (attempt.status === input.status) return { attempt, transitioned: false };
      if (!ALLOWED_STATUS_TRANSITIONS[attempt.status].includes(input.status)) {
        throw new ConflictException(`Invalid payment attempt transition ${attempt.status}->${input.status}.`);
      }

      const now = new Date();
      const claimed = await tx.orderPaymentAttempt.updateMany({
        where: { id: attempt.id, tenantId: input.tenantId, status: attempt.status },
        data: {
          status: input.status,
          paidAt: input.status === OrderPaymentAttemptStatus.PAID ? now : undefined,
          failedAt: input.status === OrderPaymentAttemptStatus.FAILED ? now : undefined,
          failureCode: input.failureCode,
          failureReason: input.failureReason,
        },
      });
      const current = await tx.orderPaymentAttempt.findFirstOrThrow({ where: { id: attempt.id, tenantId: input.tenantId } });
      if (claimed.count !== 1) {
        if (current.status === input.status) return { attempt: current, transitioned: false };
        throw new ConflictException(`Concurrent payment attempt transition ended in ${current.status}.`);
      }
      if (input.status === OrderPaymentAttemptStatus.PAID && attempt.platformFeePolicyId) {
        const feeClaim = await tx.platformFeeEntry.updateMany({
          where: { tenantId: input.tenantId, orderPaymentAttemptId: attempt.id, state: 'PENDING' },
          data: { state: 'EARNED', earnedAt: now },
        });
        if (feeClaim.count !== 1) throw new ConflictException('Platform Fee could not be earned atomically.');
        await tx.auditLog.create({
          data: {
            tenantId: input.tenantId,
            userId: null,
            userType: 'system',
            action: 'payment.platform_fee_earned',
            resource: 'platform_fee',
            details: { attemptId: attempt.id },
          },
        });
      }
      return { attempt: current, transitioned: true };
    });
  }

  async getForTenant(tenantId: string, attemptId: string): Promise<OrderPaymentAttempt> {
    const attempt = await this.prisma.orderPaymentAttempt.findFirst({
      where: { id: attemptId, tenantId },
    });
    if (!attempt) throw new NotFoundException('Payment attempt not found.');
    return attempt;
  }

  private findByIdempotency(tenantId: string, orderId: string, idempotencyKey: string) {
    return this.prisma.orderPaymentAttempt.findFirst({
      where: { tenantId, orderId, idempotencyKey },
    });
  }

  private assertSameLogicalOperation(
    attempt: OrderPaymentAttempt,
    input: { provider: PaymentProvider; providerConnectionId?: string | null },
  ): void {
    if (attempt.provider !== input.provider
      || attempt.providerConnectionId !== (input.providerConnectionId ?? null)) {
      throw new ConflictException('Payment attempt idempotency key was reused with different provider data.');
    }
  }

  private isUniqueConstraint(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
