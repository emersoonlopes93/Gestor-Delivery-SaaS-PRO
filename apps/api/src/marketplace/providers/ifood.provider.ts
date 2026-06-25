import { Injectable, Logger } from '@nestjs/common';
import { MarketplaceConnection, MarketplaceProvider } from '@prisma/client';
import { MarketplaceProviderAdapter } from './marketplace-provider.interface';
import { ExternalMarketplaceOrder, NormalizedMarketplaceOrder, ParsedMarketplaceEvent } from '../marketplace.types';

@Injectable()
export class IfoodProvider implements MarketplaceProviderAdapter {
  private readonly logger = new Logger(IfoodProvider.name);
  provider = MarketplaceProvider.IFOOD;

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

    const configuredSecret = process.env.MARKETPLACE_IFOOD_WEBHOOK_TOKEN?.trim();
    if (!configuredSecret) return true;

    const headerValue = input.headers['x-ifood-token'] ?? input.headers['x-marketplace-token'];
    const candidate = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    return candidate === configuredSecret;
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
      topic: this.readString(payload, ['topic', 'type', 'eventType']),
      externalMerchantId: this.readString(payload, ['merchantId', 'merchant_id']),
      externalStoreId: this.readString(payload, ['storeId', 'store_id']),
      externalOrderId: this.readString(orderPayload, ['id', 'orderId', 'order_id', 'displayId']),
      orderPayload,
      rawPayload: payload,
    };
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

  async normalizeOrder(input: {
    connection: MarketplaceConnection;
    externalOrder: ExternalMarketplaceOrder;
  }): Promise<NormalizedMarketplaceOrder> {
    const order = this.asRecord(input.externalOrder);
    const customer = this.asRecord(order.customer);
    const delivery = this.asRecord(order.deliveryAddress) ?? this.asRecord(order.delivery_address) ?? this.asRecord(order.address);
    const items = Array.isArray(order.items) ? order.items : [];
    const totalFromPayload = this.toNumber(order.total);
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
  }): Promise<void> {
    this.logger.log(`ifood_confirm_order_stub externalOrderId=${input.externalOrderId} tenantId=${input.connection.tenantId}`);
  }

  async cancelOrder(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    reason?: string;
  }): Promise<void> {
    this.logger.log(`ifood_cancel_order_stub externalOrderId=${input.externalOrderId} tenantId=${input.connection.tenantId} reason=${input.reason ?? 'n/a'}`);
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
    return process.env.NODE_ENV !== 'production' || process.env.MARKETPLACE_SMOKE_ENABLED === 'true';
  }
}
