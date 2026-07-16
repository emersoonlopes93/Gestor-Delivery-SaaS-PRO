import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketplaceConnection, MarketplaceProvider } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { MarketplaceProviderAdapter } from './marketplace-provider.interface';
import { ExternalMarketplaceOrder, NormalizedMarketplaceOrder, ParsedMarketplaceEvent } from '../marketplace.types';
import { IfoodHttpClientService } from '../services/ifood-http-client.service';
import { MarketplaceCredentialService } from '../services/marketplace-credential.service';

@Injectable()
export class IfoodProvider implements MarketplaceProviderAdapter {
  provider = MarketplaceProvider.IFOOD;

  constructor(
    private readonly client: IfoodHttpClientService,
    private readonly credentials: MarketplaceCredentialService,
    private readonly config: ConfigService,
  ) {}

  async validateWebhook(input: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: Buffer | string;
    body: unknown;
  }): Promise<boolean> {
    const smokeHeader = input.headers['x-marketplace-smoke'];
    const smokeRequested = (Array.isArray(smokeHeader) ? smokeHeader[0] : smokeHeader)?.toLowerCase() === 'true';
    if (smokeRequested) {
      return this.isSmokeModeEnabled();
    }

    let clientSecret: string;
    try {
      clientSecret = this.credentials.getIfoodClientCredentials().clientSecret;
    } catch {
      return false;
    }
    const headerValue = input.headers['x-ifood-signature'];
    const signature = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
    const rawBody = typeof input.rawBody === 'string' ? Buffer.from(input.rawBody) : input.rawBody;
    const expected = createHmac('sha256', clientSecret).update(rawBody).digest();
    return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
  }

  async parseWebhookEvent(input: {
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
  }): Promise<ParsedMarketplaceEvent> {
    const payload = this.asRecord(input.body);
    const nestedOrder = this.asRecord(this.asRecord(payload.data)?.order);
    const orderPayload = this.asRecord(payload.order) ?? nestedOrder ?? payload;
    return {
      provider: MarketplaceProvider.IFOOD,
      eventId: this.readString(payload, ['id', 'eventId', 'event_id']),
      topic: this.readString(payload, ['fullCode', 'code', 'topic', 'type', 'eventType']),
      externalMerchantId: this.readString(payload, ['merchantId', 'merchant_id']),
      externalStoreId: this.readString(payload, ['storeId', 'store_id']),
      externalOrderId: this.readString(orderPayload, ['id', 'orderId', 'order_id', 'displayId']),
      eventCreatedAt: this.readDate(payload, ['createdAt', 'created_at']),
      eventSequence: this.readBigInt(payload, ['sequence', 'sequenceNumber', 'sequence_number']),
      orderPayload,
      rawPayload: payload,
    };
  }

  async parsePollingEvent(body: Record<string, unknown>): Promise<ParsedMarketplaceEvent> {
    return this.parseWebhookEvent({ headers: {}, body });
  }

  async pollEvents(input: {
    connection: MarketplaceConnection;
    merchantId: string;
    correlationId: string;
    filters?: { categories?: string; types?: string; groups?: string };
  }): Promise<Record<string, unknown>[]> {
    return this.client.pollEvents(input.connection, input.merchantId, input.correlationId, input.filters);
  }

  async acknowledgeEvents(input: {
    connection: MarketplaceConnection;
    eventIds: string[];
    correlationId: string;
  }): Promise<{ accepted: true; httpStatus: number }> {
    return this.client.acknowledgeEvents(input.connection, input.eventIds, input.correlationId);
  }

  async fetchOrderDetails(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    eventPayload: Record<string, unknown>;
  }): Promise<ExternalMarketplaceOrder> {
    const payloadOrder = this.asRecord(input.eventPayload.order) ?? input.eventPayload;
    return {
      ...payloadOrder,
      id: this.readString(payloadOrder, ['id', 'orderId', 'order_id']) ?? input.externalOrderId,
    };
  }

  async fetchCurrentOrder(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    correlationId: string;
  }): Promise<ExternalMarketplaceOrder> {
    return this.client.fetchOrderDetails(input.connection, input.externalOrderId, input.correlationId);
  }

  async normalizeOrder(input: {
    connection: MarketplaceConnection;
    externalOrder: ExternalMarketplaceOrder;
  }): Promise<NormalizedMarketplaceOrder> {
    const order = this.asRecord(input.externalOrder);
    const customer = this.asRecord(order.customer);
    const delivery = this.asRecord(order.deliveryAddress) ?? this.asRecord(order.delivery_address) ?? this.asRecord(order.address);
    const items = Array.isArray(order.items) ? order.items : [];
    const orderTiming = this.readString(order, ['orderTiming', 'order_timing']);
    const externalCreatedAt = this.readDate(order, ['createdAt', 'created_at']);
    const preparationStartAt = this.readDate(order, ['preparationStartDateTime', 'preparation_start_date_time']);
    const deadlineBase = orderTiming?.toUpperCase() === 'SCHEDULED'
      ? preparationStartAt
      : externalCreatedAt;
    const normalizedItems = items.map((item, index) => {
      const record = this.asRecord(item) ?? {};
      const quantity = Math.max(1, this.toNumber(record.quantity) || 1);
      const unitPrice = this.toNumber(record.unitPrice) || this.toNumber(record.price) || 0;
      const totalPrice = this.toNumber(record.totalPrice) || unitPrice * quantity;
      return {
        externalItemId: this.readString(record, ['id', 'itemId', 'sku']),
        name: this.readString(record, ['name', 'displayName']) ?? `Item ${index + 1}`,
        quantity,
        unitPrice,
        totalPrice,
        notes: this.readString(record, ['notes', 'observation']),
        productId: this.readString(record, ['productId']),
      };
    });

    return {
      provider: MarketplaceProvider.IFOOD,
      connection: input.connection,
      externalOrderId: this.readString(order, ['id', 'orderId', 'order_id']) ?? 'unknown-order',
      externalDisplayId: this.readString(order, ['displayId', 'display_id']),
      externalStatus: this.readString(order, ['status']),
      externalCreatedAt,
      preparationStartAt,
      confirmationDeadlineAt: deadlineBase ? new Date(deadlineBase.getTime() + 8 * 60 * 1000) : null,
      fulfillmentType: this.normalizeFulfillmentType(
        this.readString(order, ['fulfillmentType', 'fulfillment_type', 'serviceType', 'service_type']),
      ),
      customerName: this.readString(customer, ['name']) ?? 'Cliente Marketplace',
      customerPhone: this.readString(customer, ['phone', 'phoneNumber']) ?? '00000000000',
      customerEmail: this.readString(customer, ['email']),
      notes: this.readString(order, ['notes', 'observation']),
      paymentMethod: 'other',
      items: normalizedItems,
      deliveryAddress: delivery
        ? {
            street: this.readString(delivery, ['street']) ?? 'Nao informado',
            number: this.readString(delivery, ['number']) ?? 'S/N',
            complement: this.readString(delivery, ['complement']),
            neighborhood: this.readString(delivery, ['neighborhood']) ?? 'Nao informado',
            city: this.readString(delivery, ['city']) ?? 'Nao informado',
            state: this.readString(delivery, ['state']) ?? 'SP',
            zipCode: this.readString(delivery, ['zipCode', 'zip_code']) ?? '00000000',
            reference: this.readString(delivery, ['reference']),
            lat: this.toNumber(delivery.lat),
            lng: this.toNumber(delivery.lng),
          }
        : null,
      rawPayload: order,
    };
  }

  async confirmOrder(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    correlationId: string;
  }) {
    return this.client.confirmOrder(input.connection, input.externalOrderId, input.correlationId);
  }

  async getCancellationReasons(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    correlationId: string;
  }) {
    return this.client.getCancellationReasons(input.connection, input.externalOrderId, input.correlationId);
  }

  async cancelOrder(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    reason: string;
    correlationId: string;
  }) {
    return this.client.cancelOrder(input.connection, input.externalOrderId, input.reason, input.correlationId);
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }

  private readString(record: Record<string, unknown> | null, keys: string[]): string | null {
    if (!record) return null;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private readDate(record: Record<string, unknown> | null, keys: string[]): Date | null {
    const value = this.readString(record, keys);
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private readBigInt(record: Record<string, unknown> | null, keys: string[]): bigint | null {
    if (!record) return null;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
      if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
    }
    return null;
  }

  private normalizeFulfillmentType(value: string | null): 'delivery' | 'pickup' {
    if (!value) return 'delivery';

    const normalized = value.trim().toLowerCase();
    const compact = normalized.replace(/[^a-z0-9]/g, '');
    if (
      compact.includes('pickup') ||
      compact.includes('takeaway') ||
      compact.includes('takeout') ||
      compact.includes('retirada') ||
      compact.includes('balcao') ||
      compact.includes('counter')
    ) {
      return 'pickup';
    }

    return 'delivery';
  }

  private isSmokeModeEnabled(): boolean {
    return this.config.get<string>('NODE_ENV') !== 'production'
      || this.config.get<string>('MARKETPLACE_SMOKE_ENABLED') === 'true';
  }
}
