/**
 * Normaliza número/JID para envio via Evolution-Go.
 * Aceita: dígitos, JID completo ou número com sufixo @s.whatsapp.net
 */
export function normalizeWhatsAppSendNumber(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return trimmed;

  if (trimmed.includes('@')) {
    return trimmed.split('@')[0].replace(/\D/g, '');
  }

  return trimmed.replace(/\D/g, '');
}
