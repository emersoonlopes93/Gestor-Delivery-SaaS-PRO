import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AsaasCustomerResponse, AsaasSubscriptionResponse, AsaasDeleteResponse } from './dto/asaas.dto';

export interface AsaasCustomerInput {
  name: string;
  email: string;
  cpfCnpj: string;
  phone?: string;
  mobilePhone?: string;
}

export interface AsaasSubscriptionInput {
  customer: string;
  billingType: 'CREDIT_CARD' | 'BOLETO' | 'PIX';
  value: number;
  nextDueDate: string;
  cycle: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY';
  description?: string;
}

@Injectable()
export class AsaasService {
  private readonly logger = new Logger('AsaasService');
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.apiUrl = process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3';
    this.apiKey = process.env.ASAAS_API_KEY || '';
  }

  private get headers() {
    return {
      access_token: this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  async createCustomer(data: AsaasCustomerInput): Promise<AsaasCustomerResponse> {
    if (!this.apiKey) {
      this.logger.warn('ASAAS_API_KEY not configured. Mocking customer creation.');
      return { 
        id: `cus_mock_${Date.now()}`,
        name: data.name,
        email: data.email,
        cpfCnpj: data.cpfCnpj
      };
    }

    try {
      const response = await axios.post<AsaasCustomerResponse>(`${this.apiUrl}/customers`, data, { headers: this.headers });
      return response.data;
    } catch (error: unknown) {
      const description = axios.isAxiosError(error)
        ? (error.response?.data && typeof error.response.data === 'object' && 'errors' in error.response.data
            ? String((error.response.data as { errors?: Array<{ description?: unknown }> }).errors?.[0]?.description ?? '')
            : '')
        : '';
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error creating Asaas customer: ${description || message}`);
      throw new Error('Falha ao criar cliente no gateway de pagamento (Asaas).');
    }
  }

  async createSubscription(data: AsaasSubscriptionInput): Promise<AsaasSubscriptionResponse> {
    if (!this.apiKey) {
      this.logger.warn('ASAAS_API_KEY not configured. Mocking subscription creation.');
      return { 
        id: `sub_mock_${Date.now()}`,
        status: 'ACTIVE',
        value: data.value,
        nextDueDate: data.nextDueDate
      };
    }

    try {
      const response = await axios.post<AsaasSubscriptionResponse>(`${this.apiUrl}/subscriptions`, data, { headers: this.headers });
      return response.data;
    } catch (error: unknown) {
      const description = axios.isAxiosError(error)
        ? (error.response?.data && typeof error.response.data === 'object' && 'errors' in error.response.data
            ? String((error.response.data as { errors?: Array<{ description?: unknown }> }).errors?.[0]?.description ?? '')
            : '')
        : '';
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error creating Asaas subscription: ${description || message}`);
      throw new Error('Falha ao criar assinatura no gateway de pagamento (Asaas).');
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<AsaasDeleteResponse> {
    if (!this.apiKey || subscriptionId.startsWith('sub_mock')) {
      return { deleted: true, id: subscriptionId };
    }

    try {
      const response = await axios.delete<AsaasDeleteResponse>(`${this.apiUrl}/subscriptions/${subscriptionId}`, { headers: this.headers });
      return response.data;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error canceling Asaas subscription: ${message}`);
      throw new Error('Falha ao cancelar assinatura no Asaas.');
    }
  }
}
