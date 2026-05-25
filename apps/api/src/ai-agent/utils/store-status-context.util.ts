export type StoreOperationalStatus = 'open' | 'closed' | 'paused';

export interface StoreStatusSnapshot {
  storeStatus: StoreOperationalStatus;
  message: string;
  nextOpenAt: string | null;
  reason?: string;
}

export function resolveStoreOperationalStatus(input: {
  isStorePaused: boolean;
  isOpen: boolean;
  reason: string;
}): StoreOperationalStatus {
  if (input.isStorePaused) {
    return 'paused';
  }
  if (input.isOpen) {
    return 'open';
  }
  return 'closed';
}

export function buildStoreStatusPromptBlock(snapshot: StoreStatusSnapshot): string {
  const jsonBlock = JSON.stringify({
    storeStatus: snapshot.storeStatus,
    message: snapshot.message,
    nextOpenAt: snapshot.nextOpenAt,
    reason: snapshot.reason ?? null,
  });

  const behaviorHints =
    snapshot.storeStatus === 'open'
      ? 'A loja está aberta: pode conduzir pedidos normalmente após validar itens e pagamento com as tools.'
      : snapshot.storeStatus === 'paused'
        ? 'A loja está PAUSADA: informe a pausa, não incentive pedido imediato; ofereça transferir_atendimento_humano se necessário.'
        : 'A loja está FECHADA: pode responder dúvidas e mostrar cardápio se o cliente pedir, mas NÃO incentive pedido imediato; informe próximo horário se houver.';

  return [
    '## Status operacional da loja (fonte: sistema — não ignore)',
    '```json',
    jsonBlock,
    '```',
    behaviorHints,
  ].join('\n');
}
