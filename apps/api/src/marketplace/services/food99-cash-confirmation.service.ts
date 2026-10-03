import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MarketplaceOperationStatus, MarketplaceOperationType, MarketplaceProvider, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { Food99ApiError } from '../providers/food99-api.error';
import { Food99HttpClientService } from './food99-http-client.service';

@Injectable()
export class Food99CashConfirmationService {
  constructor(private readonly prisma: PrismaService, private readonly client: Food99HttpClientService) {}

  async confirm(tenantId: string, marketplaceOrderId: string): Promise<{ accepted: true; duplicate: boolean }> {
    const order = await this.prisma.marketplaceOrder.findFirst({
      where: { id: marketplaceOrderId, tenantId, provider: MarketplaceProvider.FOOD_99 },
      include: { connection: true },
    });
    if (!order) throw new NotFoundException('Pedido 99Food nao encontrado.');
    this.assertEligibility(order.rawPayload, order.statusExternal);

    const idempotencyKey = `food99:pay-confirm:${order.id}`;
    let operation: { id: string; status: MarketplaceOperationStatus; correlationId: string } | null = null;
    try {
      operation = await this.prisma.marketplaceOperation.create({
        data: {
          tenantId,
          connectionId: order.connectionId,
          marketplaceOrderId: order.id,
          provider: MarketplaceProvider.FOOD_99,
          externalOrderId: order.externalOrderId,
          operation: MarketplaceOperationType.PAY_CONFIRM,
          status: MarketplaceOperationStatus.PROCESSING,
          idempotencyKey,
          correlationId: randomUUID(),
          firstAttemptAt: new Date(),
          lastAttemptAt: new Date(),
          attempts: 1,
        },
        select: { id: true, status: true, correlationId: true },
      });
      const response = await this.client.confirmCashPayment(order.connection, order.externalOrderId, operation.correlationId);
      await this.prisma.marketplaceOperation.update({
        where: { id: operation.id },
        data: { status: MarketplaceOperationStatus.SUCCEEDED, acceptedAt: new Date(), completedAt: new Date(), httpStatus: response.httpStatus, lastError: null },
      });
      return { accepted: true, duplicate: false };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = await this.prisma.marketplaceOperation.findFirst({
          where: { tenantId, idempotencyKey, operation: MarketplaceOperationType.PAY_CONFIRM },
          select: { status: true },
        });
        if (existing?.status === MarketplaceOperationStatus.SUCCEEDED) return { accepted: true, duplicate: true };
        throw new ConflictException('A confirmacao de pagamento ja esta em processamento ou requer revisao.');
      }
      if (operation) {
        await this.prisma.marketplaceOperation.updateMany({
          where: { id: operation.id, tenantId, status: MarketplaceOperationStatus.PROCESSING },
          data: { status: MarketplaceOperationStatus.FAILED, completedAt: new Date(), lastError: error instanceof Error ? error.message.slice(0, 500) : 'pay_confirm_failed', providerCode: error instanceof Food99ApiError ? error.providerCode ?? null : null },
        });
      }
      throw error;
    }
  }

  private assertEligibility(rawPayload: Prisma.JsonValue, externalStatus: string | null): void {
    const record = asRecord(rawPayload);
    const payType = numberValue(record?.pay_type);
    const deliveryType = numberValue(record?.delivery_type);
    if (payType !== 2) throw new BadRequestException('A confirmacao de pagamento e permitida somente para pedido em dinheiro.');
    if (deliveryType !== 1) throw new BadRequestException('A confirmacao de pagamento e permitida somente para entrega da 99Food.');
    if (externalStatus !== '200') throw new BadRequestException('A 99Food permite confirmar este pagamento somente quando o pedido esta aceito.');
  }
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    || (typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === 'P2002');
}
