export type StoreOperationalStatus = 'open' | 'closed' | 'paused';

export interface StoreStatusSnapshot {
  storeStatus: StoreOperationalStatus;
  message: string;
  nextOpenAt: string | null;
  reason?: string;
  /** Indica se a loja aceita pedidos agendados quando fechada */
  acceptsScheduling: boolean;
  /** Indica se é a primeira mensagem da sessão (força aviso de loja fechada) */
  isFirstMessage?: boolean;
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
    isStorePaused: snapshot.storeStatus === 'paused',
    message: snapshot.message,
    nextOpenAt: snapshot.nextOpenAt,
    reason: snapshot.reason ?? null,
    acceptsScheduling: snapshot.acceptsScheduling,
  });

  let behaviorHints: string;

  if (snapshot.storeStatus === 'open') {
    behaviorHints =
      'A loja está aberta: pode conduzir pedidos normalmente após validar itens e pagamento com as tools.';
  } else if (snapshot.storeStatus === 'paused') {
    behaviorHints =
      'A loja está PAUSADA: informe a pausa, não incentive pedido imediato; ofereça transferir_atendimento_humano se necessário.';
  } else {
    // Fechada
    const schedulingHint = snapshot.acceptsScheduling
      ? ' Se o cliente quiser, ofereça montar pedido para agendamento e use consultar_slots_agendamento para verificar horários disponíveis — nunca invente horários.'
      : ' Não aceita agendamentos no momento.';
    behaviorHints =
      `A loja está FECHADA: informe que está fechada${snapshot.nextOpenAt ? ` e que abre em ${snapshot.nextOpenAt}` : ''}.${schedulingHint}`;
  }

  // Instrução crítica de primeira mensagem
  let firstMessageInstruction = '';
  if (snapshot.isFirstMessage && snapshot.storeStatus !== 'open') {
    const schedulingOffer = snapshot.acceptsScheduling
      ? ' Posso montar seu pedido para agendamento?'
      : '';
    const nextOpening = snapshot.nextOpenAt ? ` ${snapshot.nextOpenAt}.` : '.';
    firstMessageInstruction = `\n\n### INSTRUÇÃO CRÍTICA DE ABERTURA (primeira resposta)\nSua PRIMEIRA resposta OBRIGATORIAMENTE deve:\n1. Informar que a loja está fechada/pausada no momento.\n2. Informar o próximo horário de abertura: ${nextOpening}\n3. ${snapshot.acceptsScheduling ? `Oferecer agendamento: "${schedulingOffer.trim()}"` : 'Oferecer ajudar com dúvidas ou chamar atendente.'}\nExemplo: "Boa noite! No momento estamos fechados. Abrimos ${snapshot.nextOpenAt ?? 'em breve'}.${schedulingOffer}"`;
  }

  return [
    '## Status operacional da loja (fonte: sistema — não ignore)',
    '```json',
    jsonBlock,
    '```',
    behaviorHints,
    firstMessageInstruction,
  ].filter(Boolean).join('\n');
}
