/**
 * Normaliza número/JID para envio via Evolution-Go.
 * Aceita: dígitos, JID completo ou número com sufixo @s.whatsapp.net
 */
export function normalizeWhatsAppSendNumber(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return trimmed;

  // Extrai a parte antes do '@' e antes do ':' (para remover ID de dispositivo como :49)
  const beforeAt = trimmed.split('@')[0];
  const beforeColon = beforeAt.split(':')[0];

  return beforeColon.replace(/\D/g, '');
}
