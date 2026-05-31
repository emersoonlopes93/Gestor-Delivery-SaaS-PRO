import type { AiOrderDraft } from '../services/conversation.service';

/**
 * Valida o orderDraft e retorna a lista de campos obrigatórios faltantes.
 *
 * Campos sempre obrigatórios:
 *   - items (ao menos 1 item)
 *   - customerName
 *   - customerPhone
 *   - fulfillmentType
 *   - payment.method
 *
 * Se delivery:
 *   - deliveryAddress.street
 *   - deliveryAddress.number
 *   - deliveryAddress.neighborhood
 *   - deliveryAddress.city
 *
 * Se payment.method === 'cash':
 *   - payment.changeFor OU changeConfirmed
 *
 * Se schedulingRequired:
 *   - scheduledFor
 */
export function validateOrderDraft(
  draft: AiOrderDraft,
  options?: { schedulingRequired?: boolean },
): string[] {
  const missing: string[] = [];

  // --- Campos sempre obrigatórios ---
  if (!draft.items || draft.items.length === 0) {
    missing.push('items');
  }

  if (!draft.customerName || draft.customerName.trim() === '') {
    missing.push('customerName');
  }

  if (!draft.customerPhone || draft.customerPhone.trim() === '') {
    missing.push('customerPhone');
  }

  if (!draft.fulfillmentType) {
    missing.push('fulfillmentType');
  }

  if (!draft.payment?.method) {
    missing.push('payment.method');
  }

  // --- Campos de delivery ---
  if (draft.fulfillmentType === 'delivery') {
    if (!draft.deliveryAddress?.street || draft.deliveryAddress.street.trim() === '') {
      missing.push('deliveryAddress.street');
    }
    if (!draft.deliveryAddress?.number || draft.deliveryAddress.number.trim() === '') {
      missing.push('deliveryAddress.number');
    }
    if (!draft.deliveryAddress?.neighborhood || draft.deliveryAddress.neighborhood.trim() === '') {
      missing.push('deliveryAddress.neighborhood');
    }
    if (!draft.deliveryAddress?.city || draft.deliveryAddress.city.trim() === '') {
      missing.push('deliveryAddress.city');
    }
  }

  // --- Troco se dinheiro ---
  if (draft.payment?.method === 'cash') {
    // changeFor pode ser 0 (sem troco), mas null indica que não foi perguntado ainda
    if (draft.payment.changeFor === null && !draft.changeConfirmed) {
      missing.push('payment.changeFor');
    }
  }

  // --- Agendamento obrigatório (loja fechada) ---
  if (options?.schedulingRequired && !draft.scheduledFor) {
    missing.push('scheduledFor');
  }

  return missing;
}

/**
 * Formata o orderDraft como bloco legível para o LLM.
 * Retorna null se o draft estiver completamente vazio.
 */
export function buildOrderDraftPromptBlock(draft: AiOrderDraft): string | null {
  const hasItems = draft.items && draft.items.length > 0;
  const hasAnyData =
    hasItems ||
    draft.customerName ||
    draft.fulfillmentType ||
    draft.payment?.method ||
    draft.deliveryAddress?.street;

  if (!hasAnyData) {
    return null;
  }

  const lines: string[] = ['## CURRENT_ORDER_DRAFT (fonte de verdade do pedido em andamento)'];

  // Itens
  if (hasItems) {
    const itemLines = draft.items.map((item) => {
      const name = item.name || item.productId || 'Produto';
      const unitPrice = typeof item.unitPrice === 'number' ? ` (R$${item.unitPrice.toFixed(2)} cada)` : '';
      return `  - ${item.quantity}x ${name}${unitPrice}${item.notes ? ` [obs: ${item.notes}]` : ''}`;
    });
    lines.push(`- Itens:\n${itemLines.join('\n')}`);
    if (typeof draft.subtotal === 'number') {
      lines.push(`- Subtotal: R$${draft.subtotal.toFixed(2)}`);
    }
  } else {
    lines.push('- Itens: (nenhum ainda)');
  }

  // Cliente
  lines.push(`- Cliente: ${draft.customerName ?? '(não informado)'}`);
  lines.push(`- Telefone: ${draft.customerPhone ?? '(não informado)'}`);

  // Tipo de entrega
  const fulfillmentLabel =
    draft.fulfillmentType === 'delivery'
      ? 'Entrega (delivery)'
      : draft.fulfillmentType === 'pickup'
        ? 'Retirada no balcão (pickup)'
        : '(não definido)';
  lines.push(`- Tipo de entrega: ${fulfillmentLabel}`);

  // Endereço (só para delivery)
  if (draft.fulfillmentType === 'delivery') {
    const addr = draft.deliveryAddress;
    if (addr?.street) {
      const parts = [
        addr.street,
        addr.number,
        addr.neighborhood ? `- ${addr.neighborhood}` : null,
        addr.city,
        addr.state,
      ].filter(Boolean);
      lines.push(`- Endereço: ${parts.join(', ')}`);
    } else {
      lines.push('- Endereço: (não informado)');
    }
    if (typeof draft.deliveryFee === 'number') {
      lines.push(`- Taxa de entrega: R$${draft.deliveryFee.toFixed(2)}`);
    }
  }

  // Pagamento
  if (draft.payment?.method) {
    const methodLabel: Record<string, string> = {
      cash: 'Dinheiro',
      pix: 'Pix',
      credit_card: 'Cartão de crédito',
      debit_card: 'Cartão de débito',
    };
    lines.push(`- Pagamento: ${methodLabel[draft.payment.method] ?? draft.payment.method}`);
    if (draft.payment.method === 'cash') {
      if (typeof draft.payment.changeFor === 'number') {
        lines.push(
          draft.payment.changeFor === 0
            ? '- Troco: não precisa'
            : `- Troco para: R$${draft.payment.changeFor.toFixed(2)}`,
        );
      } else {
        lines.push('- Troco: (não perguntado)');
      }
    }
  } else {
    lines.push('- Pagamento: (não informado)');
  }

  // Total
  if (typeof draft.total === 'number') {
    lines.push(`- Total: R$${draft.total.toFixed(2)}`);
  }

  // Agendamento
  if (draft.scheduledFor) {
    lines.push(`- Agendado para: ${draft.scheduledFor}`);
  }

  // MissingFields
  const missing = draft.missingFields ?? [];
  if (missing.length > 0) {
    lines.push(`- Campos faltantes: ${missing.join(', ')}`);
    lines.push('- Pronto para confirmar: não');
  } else if (hasItems) {
    lines.push('- Campos faltantes: nenhum');
    lines.push('- Pronto para confirmar: sim');
  }

  lines.push('');
  lines.push('### REGRAS OBRIGATÓRIAS sobre este draft:');
  lines.push('1. Se items não estiver vazio, NUNCA diga que não sabe os itens do pedido.');
  lines.push('2. NUNCA pergunte novamente campos que já estão preenchidos acima.');
  lines.push('3. Se fulfillmentType=delivery, NÃO mude para pickup sem frase explícita do cliente como "vou retirar no balcão".');
  lines.push('4. Se cliente informou endereço, manter fulfillmentType=delivery.');
  lines.push('5. Se "Campos faltantes" não estiver vazio, pergunte APENAS o próximo campo listado.');
  lines.push('6. Se "Campos faltantes" estiver vazio, mostre o resumo final e peça confirmação explícita.');
  lines.push('7. Só chame criar_pedido após confirmação explícita: "sim", "pode", "confirmo", "isso", "correto" ou similar.');
  lines.push('8. Use as tools adicionar_item_pedido, definir_entrega_retirada, definir_endereco_entrega, definir_forma_pagamento para atualizar o draft — não dependa apenas do histórico de texto.');

  return lines.join('\n');
}
