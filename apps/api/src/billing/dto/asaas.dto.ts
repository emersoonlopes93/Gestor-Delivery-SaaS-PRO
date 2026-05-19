import { z } from 'zod';

/**
 * Schemas para validação de payloads externos (Asaas)
 */

export const AsaasSubscriptionSchema = z.object({
  id: z.string(),
  nextDueDate: z.string().optional().nullable(),
  status: z.string().optional(),
  value: z.number().optional(),
});

export const AsaasWebhookSchema = z.object({
  event: z.string(),
  subscription: AsaasSubscriptionSchema.optional(),
  payment: z.object({
    id: z.string(),
    status: z.string(),
    value: z.number(),
    netValue: z.number().optional(),
    description: z.string().optional().nullable(),
    externalReference: z.string().optional().nullable(),
  }).optional(),
});

export const AsaasCustomerSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  cpfCnpj: z.string(),
});

/**
 * DTOs para uso interno
 */

export interface AsaasCustomerResponse {
  id: string;
  name: string;
  email: string;
  cpfCnpj: string;
}

export interface AsaasSubscriptionResponse {
  id: string;
  status: string;
  value: number;
  nextDueDate?: string | null;
}

export interface AsaasDeleteResponse {
  deleted: boolean;
  id: string;
}
