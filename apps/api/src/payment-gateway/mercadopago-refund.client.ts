import { Injectable } from '@nestjs/common';
import { PaymentProviderConnectionService } from '../payment-foundation/payment-provider-connection.service';

export type MercadoPagoRefundOutcome = 'SUCCEEDED' | 'PROCESSING' | 'FAILED' | 'UNKNOWN';

export type MercadoPagoRefundResult = {
  outcome: MercadoPagoRefundOutcome;
  providerRefundId: string | null;
  providerStatus: string | null;
  failureCode: string | null;
  failureMessage: string | null;
};

type MercadoPagoRefundResponse = {
  id?: string | number;
  status?: string;
};

@Injectable()
export class MercadoPagoRefundClient {
  constructor(private readonly connectionService: PaymentProviderConnectionService) {}

  async refundPayment(input: {
    tenantId: string;
    providerPaymentId: string;
    idempotencyKey: string;
  }): Promise<MercadoPagoRefundResult> {
    const accessToken = await this.resolveAccessToken(input.tenantId);
    try {
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(input.providerPaymentId)}/refunds`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': input.idempotencyKey,
        },
      });
      return this.fromResponse(response);
    } catch {
      return this.unknown();
    }
  }

  async getRefundStatus(input: {
    tenantId: string;
    providerPaymentId: string;
    providerRefundId: string;
  }): Promise<MercadoPagoRefundResult> {
    const accessToken = await this.resolveAccessToken(input.tenantId);
    try {
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${encodeURIComponent(input.providerPaymentId)}/refunds/${encodeURIComponent(input.providerRefundId)}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      return this.fromResponse(response);
    } catch {
      return this.unknown();
    }
  }

  private async resolveAccessToken(tenantId: string): Promise<string> {
    const connection = await this.connectionService.resolveMercadoPagoCredentials(tenantId);
    if (!connection?.accessToken) {
      throw new Error('Mercado Pago access token is unavailable for refund processing.');
    }
    return connection.accessToken;
  }

  private async fromResponse(response: Response): Promise<MercadoPagoRefundResult> {
    const payload = await this.readPayload(response);
    const providerRefundId = typeof payload?.id === 'string' || typeof payload?.id === 'number'
      ? String(payload.id)
      : null;
    const providerStatus = typeof payload?.status === 'string' ? payload.status : null;

    if (!response.ok) {
      if (response.status >= 400 && response.status < 500) {
        return {
          outcome: 'FAILED',
          providerRefundId,
          providerStatus,
          failureCode: `mercado_pago_http_${response.status}`,
          failureMessage: 'Mercado Pago rejected the refund request.',
        };
      }
      return this.unknown(providerRefundId, providerStatus);
    }

    switch (providerStatus) {
      case 'approved':
      case 'refunded':
        return { outcome: 'SUCCEEDED', providerRefundId, providerStatus, failureCode: null, failureMessage: null };
      case 'in_process':
      case 'pending':
        return { outcome: 'PROCESSING', providerRefundId, providerStatus, failureCode: null, failureMessage: null };
      default:
        return this.unknown(providerRefundId, providerStatus);
    }
  }

  private async readPayload(response: Response): Promise<MercadoPagoRefundResponse | null> {
    try {
      const value: unknown = await response.json();
      return value && typeof value === 'object' && !Array.isArray(value)
        ? value as MercadoPagoRefundResponse
        : null;
    } catch {
      return null;
    }
  }

  private unknown(providerRefundId: string | null = null, providerStatus: string | null = null): MercadoPagoRefundResult {
    return {
      outcome: 'UNKNOWN',
      providerRefundId,
      providerStatus,
      failureCode: null,
      failureMessage: null,
    };
  }
}
