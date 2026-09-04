import { Injectable } from '@nestjs/common';
import { MarketplaceConnection, MarketplaceProvider } from '@prisma/client';
import { createHash, timingSafeEqual } from 'crypto';
import type { MarketplaceProviderAdapter } from './marketplace-provider.interface';
import type {
  ExternalMarketplaceOrder,
  MarketplacePollAcknowledgment,
  NormalizedMarketplaceOrder,
  NormalizedMarketplaceOrderItem,
  ParsedMarketplaceEvent,
} from '../marketplace.types';
import { Food99HttpClientService } from '../services/food99-http-client.service';
import { MarketplaceCredentialService } from '../services/marketplace-credential.service';

@Injectable()
export class Food99Provider implements MarketplaceProviderAdapter {
  readonly provider = MarketplaceProvider.FOOD_99;

  constructor(
    private readonly client: Food99HttpClientService,
    private readonly credentials: MarketplaceCredentialService,
  ) {}

  async validateWebhook(input: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: Buffer | string;
    body: unknown;
  }): Promise<boolean> {
    let clientSecret: string;
    try {
      clientSecret = this.credentials.getFood99AppCredentials().clientSecret;
    } catch {
      return false;
    }
    const signature = this.header(input.headers, 'didi-header-sign');
    if (!signature || !/^[a-f0-9]{32}$/i.test(signature)) return false;
    const rawBody = typeof input.rawBody === 'string' ? Buffer.from(input.rawBody) : input.rawBody;
    const expected = createHash('md5')
      .update(rawBody)
      .update(clientSecret, 'utf8')
      .digest();
    const supplied = Buffer.from(signature, 'hex');
    return supplied.length === expected.length && timingSafeEqual(expected, supplied);
  }

  async parseWebhookEvent(input: {
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
  }): Promise<ParsedMarketplaceEvent> {
    const payload = this.asRecord(input.body) ?? {};
    return this.parseEvent(payload, this.header(input.headers, 'x-app-merchantid'));
  }

  async parsePollingEvent(body: Record<string, unknown>): Promise<ParsedMarketplaceEvent> {
    return this.parseEvent(body, null);
  }

  pollEvents(input: {
    connection: MarketplaceConnection;
    merchantIds: string[];
    correlationId: string;
  }): Promise<Record<string, unknown>[]> {
    return this.client.pollEvents(input.connection, input.correlationId);
  }

  acknowledgeEvents(input: {
    connection: MarketplaceConnection;
    eventIds: string[];
    events?: MarketplacePollAcknowledgment[];
    correlationId: string;
  }): Promise<{ accepted: true; httpStatus: number }> {
    return this.client.acknowledgeEvents(input.connection, input.events ?? [], input.correlationId);
  }

  fetchOrderDetails(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    eventPayload: Record<string, unknown>;
  }): Promise<ExternalMarketplaceOrder> {
    return this.client.fetchOrderDetails(input.connection, input.externalOrderId, `event:${input.externalOrderId}`);
  }

  fetchCurrentOrder(input: {
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
    const order = this.asRecord(input.externalOrder) ?? {};
    const customer = this.asRecord(order.customer);
    const phone = this.asRecord(customer?.phone);
    const delivery = this.asRecord(order.delivery);
    const address = this.asRecord(delivery?.deliveryAddress);
    const coordinates = this.asRecord(address?.coordinates);
    const total = this.asRecord(order.total);
    const payments = this.asRecord(order.payments);
    const paymentMethods = Array.isArray(payments?.methods) ? payments.methods : [];
    const otherFees = Array.isArray(order.fees)
      ? order.fees
      : Array.isArray(order.otherFees) ? order.otherFees : [];
    const discounts = Array.isArray(order.discounts) ? order.discounts : [];
    const fulfillmentType = this.readString(order, ['type'])?.toUpperCase() === 'TAKEOUT' ? 'pickup' : 'delivery';
    const deliveredBy = this.readString(delivery, ['deliveredBy'])?.toUpperCase();
    const logisticsOwnership = fulfillmentType === 'pickup'
      ? 'not_applicable' as const
      : deliveredBy === 'MERCHANT'
        ? 'merchant' as const
        : deliveredBy === 'MARKETPLACE'
          ? 'provider' as const
          : 'unknown' as const;
    const normalizedItems = (Array.isArray(order.items) ? order.items : []).map((value, index) => (
      this.normalizeItem(value, index)
    ));
    const pending = this.moneyValue(payments?.pending) ?? 0;
    const changeFor = paymentMethods
      .map((method) => this.asRecord(method))
      .map((method) => this.moneyValue(method?.changeFor))
      .find((value): value is number => value !== null) ?? null;

    return {
      provider: MarketplaceProvider.FOOD_99,
      connection: input.connection,
      externalOrderId: this.readString(order, ['id']) ?? 'unknown-order',
      externalDisplayId: this.readString(order, ['displayId']),
      externalStatus: this.readString(order, ['status']),
      externalCreatedAt: this.readDate(order, ['createdAt']),
      preparationStartAt: this.readDate(order, ['preparationStartDateTime']),
      confirmationDeadlineAt: null,
      fulfillmentType,
      logisticsOwnership,
      customerName: this.readString(customer, ['name']) ?? 'Cliente 99Food',
      customerPhone: this.readString(phone, ['number', 'phoneNumber'])
        ?? this.readString(customer, ['phoneNumber'])
        ?? '',
      customerEmail: null,
      notes: this.readString(order, ['extraInfo']),
      paymentMethod: this.paymentMethod(paymentMethods),
      isPrepaid: pending === 0,
      amountDue: pending,
      changeFor,
      itemsSubtotal: this.priceObjectValue(total?.itemsPrice)
        ?? normalizedItems.reduce((sum, item) => this.roundMoney(sum + item.totalPrice), 0),
      discountTotal: this.sumPriceFields(discounts, 'amount'),
      deliveryFee: this.sumFeeType(otherFees, 'DELIVERY_FEE'),
      serviceFee: this.sumFeeType(otherFees, 'SERVICE_FEE'),
      total: this.priceObjectValue(total?.orderAmount),
      scheduledFor: null,
      items: normalizedItems,
      deliveryAddress: address
        ? {
            street: this.readString(address, ['street']) ?? 'Nao informado',
            number: this.readString(address, ['number']) ?? 'S/N',
            complement: this.readString(address, ['complement']),
            neighborhood: this.readString(address, ['district']) ?? 'Nao informado',
            city: this.readString(address, ['city']) ?? 'Nao informado',
            state: this.readString(address, ['state']) ?? 'NA',
            zipCode: this.readString(address, ['postalCode']) ?? '00000000',
            reference: this.readString(address, ['reference']),
            lat: this.numberValue(coordinates?.latitude),
            lng: this.numberValue(coordinates?.longitude),
          }
        : null,
      rawPayload: order,
    };
  }

  confirmOrder(input: { connection: MarketplaceConnection; externalOrderId: string; correlationId: string }) {
    return this.client.confirmOrder(input.connection, input.externalOrderId, input.correlationId);
  }

  readyOrder(input: { connection: MarketplaceConnection; externalOrderId: string; correlationId: string }) {
    return this.client.readyOrder(input.connection, input.externalOrderId, input.correlationId);
  }

  dispatchOrder(input: { connection: MarketplaceConnection; externalOrderId: string; correlationId: string }) {
    return this.client.dispatchOrder(input.connection, input.externalOrderId, input.correlationId);
  }

  deliverOrder(input: { connection: MarketplaceConnection; externalOrderId: string; correlationId: string }) {
    return this.client.deliverOrder(input.connection, input.externalOrderId, input.correlationId);
  }

  pickUpOrder(input: { connection: MarketplaceConnection; externalOrderId: string; correlationId: string }) {
    return this.client.pickUpOrder(input.connection, input.externalOrderId, input.correlationId);
  }

  cancelOrder(input: { connection: MarketplaceConnection; externalOrderId: string; reason: string; correlationId: string }) {
    return this.client.requestCancellation(input.connection, input.externalOrderId, input.reason, input.correlationId);
  }

  acceptCancellation(input: { connection: MarketplaceConnection; externalOrderId: string; correlationId: string }) {
    return this.client.acceptCancellation(input.connection, input.externalOrderId, input.correlationId);
  }

  denyCancellation(input: { connection: MarketplaceConnection; externalOrderId: string; reason: string; correlationId: string }) {
    return this.client.denyCancellation(input.connection, input.externalOrderId, input.reason, input.correlationId);
  }

  private parseEvent(payload: Record<string, unknown>, externalMerchantId: string | null): ParsedMarketplaceEvent {
    return {
      provider: MarketplaceProvider.FOOD_99,
      eventId: this.readString(payload, ['eventId']),
      topic: this.readString(payload, ['eventType']),
      externalMerchantId,
      externalStoreId: null,
      externalOrderId: this.readString(payload, ['orderId']),
      eventCreatedAt: this.readDate(payload, ['createdAt']),
      eventSequence: null,
      orderPayload: null,
      rawPayload: payload,
    };
  }

  private normalizeItem(value: unknown, index: number): NormalizedMarketplaceOrderItem {
    const item = this.asRecord(value) ?? {};
    const quantity = Math.max(1, this.numberValue(item.quantity) ?? 1);
    const unitPrice = this.priceObjectValue(item.unitPrice) ?? 0;
    const options = (Array.isArray(item.options) ? item.options : []).map((optionValue, optionIndex) => {
      const option = this.asRecord(optionValue) ?? {};
      const optionQuantity = Math.max(1, this.numberValue(option.quantity) ?? 1);
      const optionUnitPrice = this.priceObjectValue(option.unitPrice) ?? 0;
      return {
        externalOptionId: this.readString(option, ['id']),
        name: this.readString(option, ['name']) ?? `Opcao ${optionIndex + 1}`,
        quantity: optionQuantity,
        unitPrice: optionUnitPrice,
        totalPrice: this.priceObjectValue(option.totalPrice) ?? this.roundMoney(optionUnitPrice * optionQuantity),
      };
    });
    return {
      externalItemId: this.readString(item, ['id']),
      name: this.readString(item, ['name']) ?? `Item ${index + 1}`,
      quantity,
      unitPrice,
      totalPrice: this.priceObjectValue(item.totalPrice) ?? this.roundMoney(unitPrice * quantity),
      notes: null,
      productId: null,
      options,
    };
  }

  private paymentMethod(methods: unknown[]): NormalizedMarketplaceOrder['paymentMethod'] {
    const methodNames = methods
      .map((value) => this.readString(this.asRecord(value), ['method'])?.toUpperCase())
      .filter((value): value is string => Boolean(value));
    if (methodNames.includes('CASH')) return 'cash';
    if (methodNames.includes('PIX')) return 'pix';
    if (methodNames.includes('DEBIT')) return 'debit_card';
    if (methodNames.includes('CREDIT')) return 'credit_card';
    return 'other';
  }

  private sumFeeType(values: unknown[], type: string): number {
    return this.roundMoney(values.reduce<number>((sum, value) => {
      const fee = this.asRecord(value);
      return this.readString(fee, ['type'])?.toUpperCase() === type
        ? sum + (this.priceObjectValue(fee?.price) ?? this.priceObjectValue(fee?.amount) ?? 0)
        : sum;
    }, 0));
  }

  private sumPriceFields(values: unknown[], field: string): number {
    return this.roundMoney(values.reduce<number>((sum, value) => {
      const record = this.asRecord(value);
      return sum + (this.priceObjectValue(record?.[field]) ?? 0);
    }, 0));
  }

  private priceObjectValue(value: unknown): number | null {
    const price = this.asRecord(value);
    return price ? this.moneyValue(price.value) : this.moneyValue(value);
  }

  private moneyValue(value: unknown): number | null {
    const number = this.numberValue(value);
    return number === null ? null : this.roundMoney(number);
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private numberValue(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private readString(record: Record<string, unknown> | null, keys: string[]): string | null {
    if (!record) return null;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  }

  private readDate(record: Record<string, unknown> | null, keys: string[]): Date | null {
    const value = this.readString(record, keys);
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private header(headers: Record<string, string | string[] | undefined>, name: string): string | null {
    const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
    const value = entry?.[1];
    return (Array.isArray(value) ? value[0] : value)?.trim() || null;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }
}
