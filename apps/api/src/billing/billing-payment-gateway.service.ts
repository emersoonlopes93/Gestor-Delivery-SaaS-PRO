import { BadRequestException, Injectable } from '@nestjs/common';
import { BillingGatewayMode, PaymentProvider } from '@prisma/client';
import {
  BillingPaymentCreateInput,
  BillingPaymentCreateResult,
  BillingPaymentGateway,
} from './billing-payment-gateway.interface';
import { ManualBillingPaymentProvider } from './manual-billing-payment.provider';
import { MockBillingPaymentProvider } from './mock-billing-payment.provider';
import { AsaasBillingPaymentProvider } from './asaas-billing-payment.provider';
import { isAsaasBillingSandboxBaseUrl } from './asaas-billing-client.service';

export type BillingGatewayStatus =
  | 'disabled'
  | 'manual_ready'
  | 'sandbox_ready'
  | 'invalid_configuration';

const C5_SUPPORTED_PROVIDERS: PaymentProvider[] = [
  PaymentProvider.manual,
  PaymentProvider.mock,
  PaymentProvider.asaas,
];

export type BillingPaymentRuntimeConfig = {
  paymentsEnabled: boolean;
  provider: PaymentProvider;
  mode: BillingGatewayMode | 'disabled';
  productionAllowed: boolean;
  supportedProviders: PaymentProvider[];
  gatewayStatus: BillingGatewayStatus;
  gatewayStatusReason: string | null;
};

@Injectable()
export class BillingPaymentGatewayService {
  constructor(
    private readonly manualProvider: ManualBillingPaymentProvider,
    private readonly mockProvider: MockBillingPaymentProvider,
    private readonly asaasProvider: AsaasBillingPaymentProvider,
  ) {}

  getRuntimeConfig(): BillingPaymentRuntimeConfig {
    const paymentsEnabled = process.env.BILLING_PAYMENTS_ENABLED === 'true';
    const providerValue = process.env.BILLING_GATEWAY_PROVIDER ?? 'manual';
    const modeValue = process.env.BILLING_GATEWAY_MODE ?? 'disabled';
    const provider = this.parseProvider(providerValue);
    const mode = this.parseMode(modeValue);
    const capability = this.resolveCapability({
      paymentsEnabled,
      providerValue,
      modeValue,
      provider,
      mode,
    });

    return {
      paymentsEnabled,
      provider,
      mode,
      // NODE_ENV alone must never be represented as permission to create real charges.
      productionAllowed: false,
      supportedProviders: C5_SUPPORTED_PROVIDERS,
      gatewayStatus: capability.status,
      gatewayStatusReason: capability.reason,
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
    if (provider === PaymentProvider.asaas && mode !== BillingGatewayMode.sandbox) {
      throw new BadRequestException("Provider asaas esta liberado somente com BILLING_GATEWAY_MODE='sandbox' nesta fase.");
    }
    if (provider === PaymentProvider.asaas && !process.env.ASAAS_BILLING_API_KEY?.trim()) {
      throw new BadRequestException('ASAAS_BILLING_API_KEY nao configurada para billing SaaS sandbox.');
    }
  }

  private resolveProvider(provider: PaymentProvider): BillingPaymentGateway {
    if (provider === PaymentProvider.manual) return this.manualProvider;
    if (provider === PaymentProvider.mock) return this.mockProvider;
    if (provider === PaymentProvider.asaas) return this.asaasProvider;
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

  private resolveCapability(input: {
    paymentsEnabled: boolean;
    providerValue: string;
    modeValue: string;
    provider: PaymentProvider;
    mode: BillingGatewayMode | 'disabled';
  }): { status: BillingGatewayStatus; reason: string | null } {
    if (!input.paymentsEnabled) {
      return { status: 'disabled', reason: 'Pagamentos por tentativa estao desativados neste ambiente.' };
    }

    if (!C5_SUPPORTED_PROVIDERS.includes(input.provider)
      || input.providerValue !== input.provider) {
      return { status: 'invalid_configuration', reason: 'Provider de billing nao suportado nesta fase.' };
    }

    if (!['manual', 'sandbox', 'production'].includes(input.modeValue) || input.mode === 'disabled') {
      return { status: 'invalid_configuration', reason: 'Modo de billing invalido ou ausente.' };
    }

    if (input.mode === BillingGatewayMode.production) {
      return { status: 'invalid_configuration', reason: 'Cobranca real em producao permanece bloqueada nesta fase.' };
    }

    if (input.provider === PaymentProvider.manual) {
      return input.mode === BillingGatewayMode.manual
        ? { status: 'manual_ready', reason: 'Tentativas podem ser iniciadas administrativamente; cobranca recorrente automatica nao esta habilitada.' }
        : { status: 'invalid_configuration', reason: 'Provider manual exige modo manual.' };
    }

    if (input.provider === PaymentProvider.mock) {
      return input.mode === BillingGatewayMode.sandbox
        ? { status: 'sandbox_ready', reason: 'Gateway mock de sandbox disponivel para testes autorizados; cobranca real permanece bloqueada.' }
        : { status: 'invalid_configuration', reason: 'Provider mock exige modo sandbox.' };
    }

    if (input.provider === PaymentProvider.asaas) {
      if (input.mode !== BillingGatewayMode.sandbox) {
        return { status: 'invalid_configuration', reason: 'Asaas para billing SaaS esta liberado somente em sandbox.' };
      }
      if (!process.env.ASAAS_BILLING_API_KEY?.trim()) {
        return { status: 'invalid_configuration', reason: 'Asaas sandbox indisponivel: credencial sandbox nao configurada.' };
      }
      const baseUrl = process.env.ASAAS_BILLING_BASE_URL?.trim() || 'https://api-sandbox.asaas.com/v3';
      return isAsaasBillingSandboxBaseUrl(baseUrl)
        ? { status: 'sandbox_ready', reason: 'Tentativas sandbox podem ser iniciadas administrativamente; cobranca recorrente automatica nao esta habilitada.' }
        : { status: 'invalid_configuration', reason: 'Asaas sandbox indisponivel: URL fora do ambiente sandbox.' };
    }

    return { status: 'invalid_configuration', reason: 'Configuracao de billing indisponivel.' };
  }
}
