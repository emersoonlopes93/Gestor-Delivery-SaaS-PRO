import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    tenantId: string;
    email: string;
    role: string;
    [key: string]: unknown; // Permite outros campos injetados pelo Passport/JWT
  };
}
