import { Injectable } from '@nestjs/common';
import { isBillingAutomationEnabled, isBillingAutomationQueueEnabled } from './billing-automation.constants';
import { BillingPaymentGatewayService, BillingPaymentRuntimeConfig } from './billing-payment-gateway.service';

export type BillingOperationalReadinessState =
  | 'disabled'
  | 'manual'
  | 'sandbox'
  | 'live_not_authorized'
  | 'invalid_configuration'
  | 'external_contract_pending';

export type BillingOperationalReadiness = {
  state: BillingOperationalReadinessState;
  reason: string;
  realChargeEnabled: false;
  automaticBillingActive: false;
  productionAllowed: false;
  automation: {
    queueConfigured: boolean;
    requested: boolean;
    killSwitchEnabled: boolean;
    executionAllowed: boolean;
  };
  reconciliation: {
    unknownOutcomePolicy: 'requires_manual_reconciliation';
    automaticReplayAllowed: false;
    providerEvidenceRequired: true;
  };
  liveAuthorization: {
    status: 'external_contract_pending';
    requirements: string[];
  };
};

@Injectable()
export class BillingOperationalReadinessService {
  constructor(private readonly gatewayService: BillingPaymentGatewayService) {}

  getReadiness(environment = process.env): BillingOperationalReadiness {
    const runtime = this.gatewayService.getRuntimeConfig();
    const automation = this.getAutomationState(environment);
    const state = this.resolveState(runtime);

    return {
      state,
      reason: this.resolveReason(state, runtime),
      realChargeEnabled: false,
      automaticBillingActive: false,
      productionAllowed: false,
      automation,
      reconciliation: {
        unknownOutcomePolicy: 'requires_manual_reconciliation',
        automaticReplayAllowed: false,
        providerEvidenceRequired: true,
      },
      liveAuthorization: {
        status: 'external_contract_pending',
        requirements: [
          'Contrato oficial e versionado do provider para producao.',
          'Credenciais e webhook segregados por ambiente e homologados.',
          'Aprovacao financeira, juridica e operacional explicita.',
          'Sandbox E2E, reconciliacao e rollback operacional aprovados.',
        ],
      },
    };
  }

  private getAutomationState(environment: NodeJS.ProcessEnv): BillingOperationalReadiness['automation'] {
    return {
      queueConfigured: isBillingAutomationQueueEnabled(environment),
      requested: environment.BILLING_AUTOMATION_ENABLED === 'true',
      killSwitchEnabled: environment.BILLING_AUTOMATION_KILL_SWITCH === 'true',
      executionAllowed: isBillingAutomationEnabled(environment),
    };
  }

  private resolveState(runtime: BillingPaymentRuntimeConfig): BillingOperationalReadinessState {
    if (runtime.mode === 'production') return 'live_not_authorized';
    if (runtime.gatewayStatus === 'disabled') return 'disabled';
    if (runtime.gatewayStatus === 'manual_ready') return 'manual';
    if (runtime.gatewayStatus === 'sandbox_ready') return 'sandbox';
    return 'invalid_configuration';
  }

  private resolveReason(state: BillingOperationalReadinessState, runtime: BillingPaymentRuntimeConfig): string {
    if (state === 'live_not_authorized') {
      return 'Cobranca real permanece bloqueada: C5-C nao autoriza modo production nem chamadas live.';
    }
    return runtime.gatewayStatusReason
      ?? 'Readiness indisponivel sem configuracao verificavel do gateway.';
  }
}
