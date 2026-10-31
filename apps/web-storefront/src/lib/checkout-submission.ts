import { canonicalizeOrderSubmission, type CreateOrderDTO } from '@gestor/types';

const VERSIONED_KEY_PREFIX = 'v1';

function digestToBase64Url(digest: ArrayBuffer): string {
  const binary = Array.from(new Uint8Array(digest), (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function createCheckoutIdempotencyKey(
  attemptId: string,
  payload: CreateOrderDTO,
): Promise<string> {
  const canonicalPayload = canonicalizeOrderSubmission(payload);
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalPayload),
  );

  return `${VERSIONED_KEY_PREFIX}.${attemptId}.${digestToBase64Url(digest)}`;
}

export class CheckoutSubmitGuard {
  private inFlight = false;
  private completed = false;

  tryStart(): boolean {
    if (this.inFlight || this.completed) return false;
    this.inFlight = true;
    return true;
  }

  fail(): void {
    if (!this.completed) this.inFlight = false;
  }

  succeed(): void {
    this.completed = true;
    this.inFlight = false;
  }
}

export function isAmbiguousCheckoutError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return true;
  return !('status' in error) || typeof error.status !== 'number';
}
