import { randomBytes } from 'crypto';

/**
 * Gera um token público de tracking seguro e não-enumerável.
 * Formato: 16 caracteres alfanuméricos (base64url sem padding).
 */
export function generatePublicTrackingToken(): string {
  const bytes = randomBytes(12); // 96 bits de entropia
  return bytes
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 16);
}
