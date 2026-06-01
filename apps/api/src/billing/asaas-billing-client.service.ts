import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';

const DEFAULT_ASAAS_SANDBOX_BASE_URL = 'https://api-sandbox.asaas.com/v3';

export type AsaasBillingCustomerRequest = {
  name: string;
  cpfCnpj: string;
  email?: string;
  mobilePhone?: string;
  externalReference: string;
  notificationDisabled: boolean;
};

export type AsaasBillingCustomerResponse = {
  id: string;
  name?: string;
  email?: string;
  cpfCnpj?: string;
  externalReference?: string | null;
};

export type AsaasBillingCustomerListResponse = {
  data?: AsaasBillingCustomerResponse[];
};

export type AsaasBillingPaymentRequest = {
  customer: string;
  billingType: 'UNDEFINED';
  value: number;
  dueDate: string;
  description: string;
  externalReference: string;
};

export type AsaasBillingPaymentResponse = {
  id: string;
  status: string;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  paymentLink?: string | null;
  value?: number;
  dueDate?: string;
  externalReference?: string | null;
};

@Injectable()
export class AsaasBillingClientService {
  private readonly logger = new Logger(AsaasBillingClientService.name);

  async findCustomerByExternalReference(externalReference: string): Promise<AsaasBillingCustomerResponse | null> {
    const client = this.createClient();
    try {
      const response = await client.get<AsaasBillingCustomerListResponse>('/customers', {
        headers: this.authHeaders(),
        params: {
          externalReference,
          limit: 1,
        },
      });
      return response.data.data?.[0] ?? null;
    } catch (error) {
      throw this.toSafeException(error, 'consulta de cliente');
    }
  }

  async createCustomer(input: AsaasBillingCustomerRequest): Promise<AsaasBillingCustomerResponse> {
    const client = this.createClient();
    try {
      const response = await client.post<AsaasBillingCustomerResponse>('/customers', input, {
        headers: this.authHeaders(),
      });
      return response.data;
    } catch (error) {
      throw this.toSafeException(error, 'cliente');
    }
  }

  async createPayment(input: AsaasBillingPaymentRequest): Promise<AsaasBillingPaymentResponse> {
    const client = this.createClient();
    try {
      const response = await client.post<AsaasBillingPaymentResponse>('/payments', input, {
        headers: this.authHeaders(),
      });
      return response.data;
    } catch (error) {
      throw this.toSafeException(error, 'cobranca');
    }
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey());
  }

  baseUrl(): string {
    return process.env.ASAAS_BILLING_BASE_URL?.trim() || DEFAULT_ASAAS_SANDBOX_BASE_URL;
  }

  private createClient(): AxiosInstance {
    const baseURL = this.baseUrl();
    if (!baseURL.startsWith(DEFAULT_ASAAS_SANDBOX_BASE_URL)) {
      throw new BadRequestException('ASAAS_BILLING_BASE_URL precisa apontar para o ambiente sandbox nesta fase.');
    }
    if (!this.apiKey()) {
      throw new BadRequestException('ASAAS_BILLING_API_KEY nao configurada para billing SaaS sandbox.');
    }

    return axios.create({
      baseURL,
      timeout: 12000,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'GestorDeliverySaasBilling/1.0',
      },
    });
  }

  private authHeaders(): { access_token: string } {
    return { access_token: this.apiKey() };
  }

  private apiKey(): string {
    return process.env.ASAAS_BILLING_API_KEY?.trim() ?? '';
  }

  private toSafeException(error: unknown, entity: string): Error {
    if (!axios.isAxiosError(error)) {
      this.logger.error(`Asaas billing ${entity} error: ${error instanceof Error ? error.message : 'unknown'}`);
      return new ServiceUnavailableException(`Falha segura ao criar ${entity} no Asaas sandbox.`);
    }

    const status = error.response?.status;
    const description = this.extractAsaasErrorDescription(error);
    this.logger.error(`Asaas billing ${entity} error status=${status ?? 'unknown'} description=${description}`);
    if (status === 400) {
      return new BadRequestException(`Asaas sandbox recusou ${entity}: ${description}`);
    }
    return new ServiceUnavailableException(`Falha segura ao criar ${entity} no Asaas sandbox.`);
  }

  private extractAsaasErrorDescription(error: AxiosError<unknown>): string {
    const data = error.response?.data;
    if (this.isRecord(data)) {
      const errors = data.errors;
      if (Array.isArray(errors)) {
        const first = errors.find((entry) => this.isRecord(entry) && typeof entry.description === 'string');
        if (this.isRecord(first) && typeof first.description === 'string') {
          return first.description;
        }
      }
    }
    return error.message;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
