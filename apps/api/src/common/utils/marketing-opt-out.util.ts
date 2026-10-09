import { normalizeWhatsAppSendNumber } from './whatsapp-number.util';

const OPT_OUT_KEYWORDS = new Set(['sair', 'parar', 'stop', 'cancelar', 'unsubscribe']);

export function normalizeMarketingPhone(phone: string): string {
  return normalizeWhatsAppSendNumber(phone);
}

export function isMarketingOptOutMessage(content: string): boolean {
  const normalized = content
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
  return OPT_OUT_KEYWORDS.has(normalized);
}
