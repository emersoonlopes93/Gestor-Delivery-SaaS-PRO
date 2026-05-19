import { z } from 'zod';

export const MercadoPagoWebhookSchema = z.object({
  action: z.string(),
  api_version: z.string(),
  data: z.object({
    id: z.union([z.string(), z.number()]).transform(val => val.toString()),
  }),
  date_created: z.string(),
  id: z.union([z.string(), z.number()]).transform(val => val.toString()),
  live_mode: z.boolean().or(z.string()).transform(val => val === true || val === 'true'),
  type: z.string(),
  user_id: z.union([z.string(), z.number()]).transform(val => val.toString()),
});

export type MercadoPagoWebhook = z.infer<typeof MercadoPagoWebhookSchema>;

export const MercadoPagoPaymentSchema = z.object({
  id: z.number().or(z.string()).transform(val => val.toString()),
  status: z.enum(['approved', 'cancelled', 'rejected', 'in_process', 'pending', 'refunded', 'charged_back']),
  status_detail: z.string(),
  external_reference: z.string().nullable().optional(),
  transaction_amount: z.number(),
  installments: z.number().optional(),
  payment_method_id: z.string(),
  payer: z.object({
    email: z.string(),
    id: z.string().optional(),
  }),
  point_of_interaction: z.object({
    transaction_data: z.object({
      qr_code: z.string().optional(),
      qr_code_base64: z.string().optional(),
      ticket_url: z.string().optional(),
    }).optional(),
  }).optional(),
});

export type MercadoPagoPayment = z.infer<typeof MercadoPagoPaymentSchema>;
