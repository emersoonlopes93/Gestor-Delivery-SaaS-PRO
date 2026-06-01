import { BadRequestException, Injectable } from '@nestjs/common';
import { BillingGatewayMode, PaymentProvider } from '@prisma/client';
import {
  BillingPaymentCreateInput,
  BillingPaymentCreateResult,
  BillingPaymentGateway,
} from './billing-payment-gateway.interface';
import { ManualBillingPaymentProvider } from './manual-billing-payment.provider';
import { MockBillingPaymentProvider } from './mock-billing-payment.provider';

export type BillingPaymentRuntimeConfig = {
  paymentsEnabled: boolean;
  provider: PaymentProvider;
  mode: BillingGatewayMode | 'disabled';
  productionAllowed: boolean;
  supportedProviders: PaymentProvider[];
};

@Injectable()
export class BillingPaymentGatewayService {
  constructor(
    private readonly manualProvider: ManualBillingPaymentProvider,
    private readonly mockProvider: MockBillingPaymentProvider,
  ) {}

  getRuntimeConfig(): BillingPaymentRuntimeConfig {
    return {
      paymentsEnabled: process.env.BILLING_PAYMENTS_ENABLED === 'true',
      provider: this.parseProvider(process.env.BILLING_GATEWAY_PROVIDER ?? 'manual'),
      mode: this.parseMode(process.env.BILLING_GATEWAY_MODE ?? 'disabled'),
      productionAllowed: process.env.NODE_ENV === 'production',
      supportedProviders: [PaymentProvider.manual, PaymentProvider.mock],
    };
  }

  async createPaymentForInvoice(input: BillingPaymentCreateInput): Promise<BillingPaymentCreateResult> {
    this.assertPaymentsEnabled(input.provider, input.mode);
    return this.resolveProvider(input.provider).createPaymentForInvoice(input);
  }

  async getPaymentStatus(provider: PaymentProvider, providerPaymentId: string) {
    return this.resolveProvider(provider).getPaymentStatus(providerPaymentId);
  }

  assertPaymentsEnabled(provider: PaymentProvider, mode: BillingGatewayMode): void {
    const config = this.getRuntimeConfig();
    if (!config.paymentsEnabled) {
      throw new BadRequestException('Billing payments estao desativados por feature flag.');
    }
    if (!config.supportedProviders.includes(provider)) {
      throw new BadRequestException(`Provider de billing nao suportado nesta fase: ${provider}.`);
    }
    if (config.provider !== provider) {
      throw new BadRequestException(`Provider solicitado (${provider}) difere de BILLING_GATEWAY_PROVIDER (${config.provider}).`);
    }
    if (config.mode === 'disabled') {
      throw new BadRequestException('BILLING_GATEWAY_MODE precisa ser manual, sandbox ou production.');
    }
    if (config.mode !== mode) {
      throw new BadRequestException(`Modo solicitado (${mode}) difere de BILLING_GATEWAY_MODE (${config.mode}).`);
    }
    if (mode === BillingGatewayMode.production && process.env.NODE_ENV !== 'production') {
      throw new BadRequestException("BILLING_GATEWAY_MODE='production' so e permitido com NODE_ENV='production'.");
    }
    if (provider === PaymentProvider.mock && mode !== BillingGatewayMode.sandbox) {
      throw new BadRequestException("Provider mock so pode operar em BILLING_GATEWAY_MODE='sandbox'.");
    }
    if (provider === PaymentProvider.manual && mode !== BillingGatewayMode.manual) {
      throw new BadRequestException("Provider manual exige BILLING_GATEWAY_MODE='manual'.");
    }
  }

  private resolveProvider(provider: PaymentProvider): BillingPaymentGateway {
    if (provider === PaymentProvider.manual) return this.manualProvider;
    if (provider === PaymentProvider.mock) return this.mockProvider;
    throw new BadRequestException(`Provider de billing nao implementado nesta fase: ${provider}.`);
  }

  private parseProvider(value: string): PaymentProvider {
    if (value === PaymentProvider.mock) return PaymentProvider.mock;
    if (value === PaymentProvider.manual) return PaymentProvider.manual;
    if (value === PaymentProvider.asaas) return PaymentProvider.asaas;
    if (value === PaymentProvider.mercado_pago) return PaymentProvider.mercado_pago;
    if (value === PaymentProvider.stripe) return PaymentProvider.stripe;
    return PaymentProvider.manual;
  }

  private parseMode(value: string): BillingGatewayMode | 'disabled' {
    if (value === BillingGatewayMode.manual) return BillingGatewayMode.manual;
    if (value === BillingGatewayMode.sandbox) return BillingGatewayMode.sandbox;
    if (value === BillingGatewayMode.production) return BillingGatewayMode.production;
    return 'disabled';
  }
}
