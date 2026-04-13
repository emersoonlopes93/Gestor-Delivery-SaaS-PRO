import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

export type RequestWithRequestId = Request & { requestId?: string };

export function requestIdMiddleware(req: RequestWithRequestId, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();

  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  next();
}
