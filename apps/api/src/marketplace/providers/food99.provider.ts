import { Injectable } from '@nestjs/common';
import { MarketplaceConnection, MarketplaceDeliveryOwnership, MarketplaceProvider } from '@prisma/client';
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
    rawBody?: Buffer | string;
    body: unknown;
  }): Promise<ParsedMarketplaceEvent> {
    const payload = this.parseNativeWebhookPayload(input.rawBody, input.body);
    const data = this.asRecord(payload.data);
    const orderInfo = this.asRecord(data?.order_info);
    const shop = this.asRecord(orderInfo?.shop);
    const appId = this.readIdentifier(payload, ['app_id']);
    const appShopId = this.readIdentifier(payload, ['app_shop_id']);
    const eventType = this.readString(payload, ['type']);
    const timestamp = this.readIdentifier(payload, ['timestamp']);
    const externalOrderId = this.readIdentifier(data, ['order_id']);
    const externalMerchantId = this.readIdentifier(shop, ['shop_id']);
    const eventId = appId && appShopId && eventType && timestamp && externalOrderId
      ? `food99:${createHash('sha256')
        .update(JSON.stringify([appId, appShopId, eventType, timestamp, externalOrderId]))
        .digest('hex')}`
      : null;
    return {
      provider: MarketplaceProvider.FOOD_99,
      eventId,
      topic: eventType,
      externalMerchantId,
      externalStoreId: appShopId,
      externalOrderId,
      eventCreatedAt: this.unixTimestamp(timestamp),
      eventSequence: null,
      orderPayload: null,
      rawPayload: payload,
    };
  }

  async parsePollingEvent(body: Record<string, unknown>): Promise<ParsedMarketplaceEvent> {
    return this.parseOpenDeliveryEvent(body);
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

  async fetchOrderDetails(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    eventPayload: Record<string, unknown>;
  }): Promise<ExternalMarketplaceOrder> {
    const remote = await this.client.fetchOrderDetails(input.connection, input.externalOrderId, `event:${input.externalOrderId}`);
    const remoteOrder = this.extractNativeOrder(remote);
    const webhookOrder = this.extractNativeOrder(input.eventPayload);
    if (!remoteOrder) return webhookOrder ?? remote;
    if (!webhookOrder) return remoteOrder;

    const remoteAddress = this.asRecord(remoteOrder.receive_address);
    const webhookAddress = this.asRecord(webhookOrder.receive_address);
    const remotePrice = this.asRecord(remoteOrder.price);
    const webhookPrice = this.asRecord(webhookOrder.price);
    return {
      ...webhookOrder,
      ...remoteOrder,
      receive_address: { ...webhookAddress, ...remoteAddress },
      price: { ...webhookPrice, ...remotePrice },
      order_items: Array.isArray(remoteOrder.order_items) && remoteOrder.order_items.length > 0
        ? remoteOrder.order_items
        : webhookOrder.order_items,
    };
  }

  async fetchCurrentOrder(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    correlationId: string;
  }): Promise<ExternalMarketplaceOrder> {
    const remote = await this.client.fetchOrderDetails(input.connection, input.externalOrderId, input.correlationId);
    return this.extractNativeOrder(remote) ?? remote;
  }

  async normalizeOrder(input: {
    connection: MarketplaceConnection;
    externalOrder: ExternalMarketplaceOrder;
  }): Promise<NormalizedMarketplaceOrder> {
    const snapshot = this.recordFromUnknown(input.externalOrder) ?? {};
    // Native 99Food orderNew embeds the detail response in data.order_info.
    // The detail endpoint itself returns the same shape. Keep the Open Delivery
    // fallback below only for polling compatibility, not as the native contract.
    const nativeOrder = this.extractNativeOrder(snapshot);
    if (nativeOrder) return this.normalizeNativeOrder(input.connection, nativeOrder);

    const order = snapshot;
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
      deliveryOwnership: MarketplaceDeliveryOwnership.UNKNOWN,
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

  private parseOpenDeliveryEvent(payload: Record<string, unknown>): ParsedMarketplaceEvent {
    return {
      provider: MarketplaceProvider.FOOD_99,
      eventId: this.readString(payload, ['eventId']),
      topic: this.readString(payload, ['eventType']),
      externalMerchantId: null,
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

  private normalizeNativeOrder(
    connection: MarketplaceConnection,
    order: Record<string, unknown>,
  ): NormalizedMarketplaceOrder {
    const price = this.asRecord(order.price);
    const address = this.asRecord(order.receive_address);
    const deliveryType = this.numberValue(order.delivery_type);
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    const normalizedItems = items.map((item, index) => this.normalizeNativeItem(item, index));
    const customerPaid = this.minorMoney(price?.customer_need_paying_money);
    const itemDiscount = this.minorMoney(price?.items_discount) ?? 0;
    const deliveryDiscount = this.minorMoney(price?.delivery_discount) ?? 0;
    const otherFees = this.asRecord(price?.others_fees);
    const couponDiscount = this.minorMoney(otherFees?.coupon_discount) ?? 0;
    const orderPrice = this.minorMoney(price?.order_price);
    const realPrice = this.minorMoney(price?.real_price);
    const itemsSubtotal = orderPrice
      ?? normalizedItems.reduce((sum, item) => this.roundMoney(sum + item.totalPrice), 0);

    return {
      provider: MarketplaceProvider.FOOD_99,
      connection,
      externalOrderId: this.readIdentifier(order, ['order_id']) ?? 'unknown-order',
      externalDisplayId: this.readIdentifier(order, ['order_index']),
      externalStatus: this.readIdentifier(order, ['status']),
      externalCreatedAt: this.unixTimestamp(this.readIdentifier(order, ['create_time'])),
      preparationStartAt: this.unixTimestamp(this.readIdentifier(order, ['shop_confirm_time'])),
      confirmationDeadlineAt: null,
      fulfillmentType: 'delivery',
      deliveryOwnership: deliveryType === 1
        ? MarketplaceDeliveryOwnership.PROVIDER
        : deliveryType === 2
          ? MarketplaceDeliveryOwnership.MERCHANT
          : MarketplaceDeliveryOwnership.UNKNOWN,
      customerName: this.readString(address, ['name']) ?? 'Cliente 99Food',
      customerPhone: this.readString(address, ['phone', 'virtual_phone_number']) ?? '',
      customerEmail: null,
      notes: this.readString(order, ['remark']),
      paymentMethod: 'other',
      isPrepaid: customerPaid !== null,
      amountDue: 0,
      changeFor: this.minorMoney(order.change_for),
      // The documented price values are integer centavos. `order_price` is kept
      // as the operational sale value; customer_need_paying_money is the amount
      // paid on 99Food. No restaurant receivable is inferred.
      itemsSubtotal,
      discountTotal: this.roundMoney(itemDiscount + deliveryDiscount + couponDiscount),
      deliveryFee: this.minorMoney(price?.delivery_price) ?? 0,
      serviceFee: this.minorMoney(otherFees?.service_price) ?? 0,
      total: customerPaid ?? realPrice ?? itemsSubtotal,
      scheduledFor: null,
      items: normalizedItems,
      deliveryAddress: address
        ? {
            street: this.readString(address, ['street_name', 'poi_address']) ?? 'Nao informado',
            number: this.readString(address, ['street_number', 'house_number']) ?? 'S/N',
            complement: this.readString(address, ['complement']),
            neighborhood: this.readString(address, ['district']) ?? 'Nao informado',
            city: this.readString(address, ['city']) ?? 'Nao informado',
            state: this.readString(address, ['state']) ?? 'NA',
            zipCode: this.readString(address, ['postalCode']) ?? '00000000',
            reference: this.readString(address, ['reference']),
            lat: this.numberValue(address.poi_lat),
            lng: this.numberValue(address.poi_lng),
          }
        : null,
      rawPayload: order,
    };
  }

  private normalizeNativeItem(value: unknown, index: number): NormalizedMarketplaceOrderItem {
    const item = this.asRecord(value) ?? {};
    const quantity = Math.max(1, this.numberValue(item.amount) ?? 1);
    const unitPrice = this.minorMoney(item.sku_price) ?? 0;
    const totalPrice = this.minorMoney(item.total_price) ?? this.roundMoney(unitPrice * quantity);
    return {
      externalItemId: this.readIdentifier(item, ['item_id', 'app_item_id']),
      name: this.readString(item, ['name']) ?? `Item ${index + 1}`,
      quantity,
      unitPrice,
      totalPrice,
      notes: this.readString(item, ['remark']),
      productId: null,
      options: this.normalizeNativeSubItems(item.sub_item_list),
    };
  }

  private normalizeNativeSubItems(value: unknown): NormalizedMarketplaceOrderItem['options'] {
    if (!Array.isArray(value)) return [];
    const options: NonNullable<NormalizedMarketplaceOrderItem['options']> = [];
    for (const entry of value) {
      const item = this.asRecord(entry) ?? {};
      const quantity = Math.max(1, this.numberValue(item.amount) ?? 1);
      const unitPrice = this.minorMoney(item.sku_price) ?? 0;
      options.push({
        externalOptionId: this.readString(item, ['app_item_id', 'app_content_id']),
        name: this.readString(item, ['name']) ?? 'Complemento',
        quantity,
        unitPrice,
        totalPrice: this.minorMoney(item.total_price) ?? this.roundMoney(unitPrice * quantity),
      });
      options.push(...this.normalizeNativeSubItems(item.sub_item_list));
    }
    return options;
  }

  private extractNativeOrder(value: unknown, depth = 0): Record<string, unknown> | null {
    if (depth > 4) return null;
    if (Array.isArray(value)) {
      for (const entry of value) {
        const order = this.extractNativeOrder(entry, depth + 1);
        if (order) return order;
      }
      return null;
    }
    const record = this.recordFromUnknown(value);
    if (!record) return null;
    if (this.readIdentifier(record, ['order_id'])) return record;
    for (const key of ['order_info', 'order', 'order_detail', 'detail', 'data']) {
      const order = this.extractNativeOrder(record[key], depth + 1);
      if (order) return order;
    }
    return null;
  }

  private recordFromUnknown(value: unknown): Record<string, unknown> | null {
    const record = this.asRecord(value);
    if (record) return record;
    if (typeof value !== 'string' || !value.trim().startsWith('{')) return null;
    try {
      const identifiersPreserved = value.replace(
        /("(?:app_id|order_id|shop_id|uid)"\s*:\s*)(-?\d{16,})/g,
        '$1"$2"',
      );
      return this.asRecord(JSON.parse(identifiersPreserved) as unknown);
    } catch {
      return null;
    }
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

  private minorMoney(value: unknown): number | null {
    const number = this.numberValue(value);
    return number === null ? null : this.roundMoney(number / 100);
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

  private readIdentifier(record: Record<string, unknown> | null, keys: string[]): string | null {
    if (!record) return null;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
    }
    return null;
  }

  private unixTimestamp(value: string | null): Date | null {
    if (!value || !/^\d+$/.test(value)) return null;
    const seconds = Number(value);
    if (!Number.isSafeInteger(seconds)) return null;
    const date = new Date(seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private parseNativeWebhookPayload(
    rawBody: Buffer | string | undefined,
    fallbackBody: unknown,
  ): Record<string, unknown> {
    if (rawBody !== undefined) {
      const source = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
      try {
        const identifiersPreserved = source.replace(
          /("(?:app_id|order_id|shop_id)"\s*:\s*)(-?\d+)/g,
          '$1"$2"',
        );
        const parsed: unknown = JSON.parse(identifiersPreserved);
        const record = this.asRecord(parsed);
        if (record) return record;
      } catch {
        // The signed payload remains fail-closed at connection resolution when its JSON is invalid.
      }
    }
    return this.asRecord(fallbackBody) ?? {};
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
