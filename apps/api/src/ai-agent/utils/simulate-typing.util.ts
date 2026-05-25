/**
 * Controle global + tenant para simular digitação.
 * AI_SIMULATE_TYPING=false desliga em todo o sistema (override).
 */
export function shouldSimulateTyping(tenantEnabled: boolean): boolean {
  const env = process.env.AI_SIMULATE_TYPING?.trim().toLowerCase();
  if (env === 'false' || env === '0' || env === 'no') {
    return false;
  }
  return tenantEnabled;
}
