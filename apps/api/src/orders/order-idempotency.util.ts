import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { canonicalizeOrderSubmission, type CreateOrderDTO } from '@gestor/types';

const VERSIONED_KEY_PATTERN = /^v1\.[A-Za-z0-9-]{1,40}\.([A-Za-z0-9_-]{43})$/;

export function fingerprintOrderSubmission(dto: CreateOrderDTO): string {
  return createHash('sha256')
    .update(canonicalizeOrderSubmission(dto))
    .digest('base64url');
}

export function assertOrderIdempotencyPayload(dto: CreateOrderDTO): void {
  if (!dto.idempotencyKey.startsWith('v1.')) return;

  const match = VERSIONED_KEY_PATTERN.exec(dto.idempotencyKey);
  if (!match || match[1] !== fingerprintOrderSubmission(dto)) {
    throw new ConflictException(
      'A chave de idempotência não corresponde ao conteúdo desta tentativa de pedido.',
    );
  }
}

export function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error !== null
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'P2002';
}
