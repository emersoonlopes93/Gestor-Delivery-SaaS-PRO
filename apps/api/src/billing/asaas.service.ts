import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

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

  async createCustomer(data: AsaasCustomerInput) {
    if (!this.apiKey) {
      this.logger.warn('ASAAS_API_KEY not configured. Mocking customer creation.');
      return { id: `cus_mock_${Date.now()}` };
    }

    try {
      const response = await axios.post(`${this.apiUrl}/customers`, data, { headers: this.headers });
      return response.data;
    } catch (error: any) {
      this.logger.error(`Error creating Asaas customer: ${error.response?.data?.errors?.[0]?.description || error.message}`);
      throw new Error('Falha ao criar cliente no gateway de pagamento (Asaas).');
    }
  }

  async createSubscription(data: AsaasSubscriptionInput) {
    if (!this.apiKey) {
      this.logger.warn('ASAAS_API_KEY not configured. Mocking subscription creation.');
      return { id: `sub_mock_${Date.now()}` };
    }

    try {
      const response = await axios.post(`${this.apiUrl}/subscriptions`, data, { headers: this.headers });
      return response.data;
    } catch (error: any) {
      this.logger.error(`Error creating Asaas subscription: ${error.response?.data?.errors?.[0]?.description || error.message}`);
      throw new Error('Falha ao criar assinatura no gateway de pagamento (Asaas).');
    }
  }

  async cancelSubscription(subscriptionId: string) {
    if (!this.apiKey || subscriptionId.startsWith('sub_mock')) {
      return { deleted: true };
    }

    try {
      const response = await axios.delete(`${this.apiUrl}/subscriptions/${subscriptionId}`, { headers: this.headers });
      return response.data;
    } catch (error: any) {
      this.logger.error(`Error canceling Asaas subscription: ${error.message}`);
      throw new Error('Falha ao cancelar assinatura no Asaas.');
    }
  }
}
