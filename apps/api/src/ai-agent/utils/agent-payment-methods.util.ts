export type AgentPaymentMethodType =
  | 'pix'
  | 'cash'
  | 'credit_card'
  | 'debit_card'
  | 'mercado_pago'
  | 'other';

export type AgentPixMode = 'gateway' | 'manual' | 'disabled';

export interface AgentPaymentMethodInfo {
  type: AgentPaymentMethodType;
  enabled: boolean;
  label: string;
  mode?: AgentPixMode;
  requiresChange?: boolean;
}

export interface AgentPaymentMethodsResult {
  methods: AgentPaymentMethodInfo[];
  notes: string;
  pixAutomaticAvailable: boolean;
}

const METHOD_LABELS: Record<string, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  mercado_pago: 'Mercado Pago (online)',
};

function normalizeMethodKey(raw: string): AgentPaymentMethodType {
  const key = raw.trim().toLowerCase();
  if (key === 'pix') return 'pix';
  if (key === 'cash' || key === 'dinheiro') return 'cash';
  if (key === 'credit_card' || key === 'credito' || key === 'cartao_credito') {
    return 'credit_card';
  }
  if (key === 'debit_card' || key === 'debito' || key === 'cartao_debito') {
    return 'debit_card';
  }
  if (key === 'mercado_pago' || key === 'mercadopago') return 'mercado_pago';
  return 'other';
}

export function parseTenantPaymentMethodKeys(raw: unknown): string[] {
  if (!raw) {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item));
  }
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch {
      return [raw];
    }
    return [raw];
  }
  if (typeof raw === 'object' && raw !== null) {
    return Object.keys(raw as Record<string, unknown>);
  }
  return [];
}

export function buildAgentPaymentMethodsResult(input: {
  paymentMethodsRaw: unknown;
  pixKey: string | null;
  mercadoPagoAccessToken: string | null;
}): AgentPaymentMethodsResult {
  const keys = parseTenantPaymentMethodKeys(input.paymentMethodsRaw);
  const uniqueTypes = new Set<AgentPaymentMethodType>();
  const methods: AgentPaymentMethodInfo[] = [];

  let pixAutomaticAvailable = false;

  for (const key of keys) {
    const type = normalizeMethodKey(key);
    if (uniqueTypes.has(type)) {
      continue;
    }
    uniqueTypes.add(type);

    if (type === 'pix') {
      const hasGateway = Boolean(input.mercadoPagoAccessToken?.trim());
      const hasManualKey = Boolean(input.pixKey?.trim());
      const enabled = hasGateway || hasManualKey;
      const mode: AgentPixMode = hasGateway
        ? 'gateway'
        : hasManualKey
          ? 'manual'
          : 'disabled';
      if (hasGateway) {
        pixAutomaticAvailable = true;
      }
      methods.push({
        type: 'pix',
        enabled,
        label: METHOD_LABELS.pix,
        mode,
      });
      continue;
    }

    if (type === 'cash') {
      methods.push({
        type: 'cash',
        enabled: true,
        label: METHOD_LABELS.cash,
        requiresChange: true,
      });
      continue;
    }

    methods.push({
      type,
      enabled: true,
      label: METHOD_LABELS[type] ?? key,
    });
  }

  const notesParts: string[] = [];
  const pixMethod = methods.find((m) => m.type === 'pix' && m.enabled);
  if (pixMethod?.mode === 'gateway') {
    notesParts.push(
      'Pix automático via gateway: após criar_pedido, o pagamento pode ser gerado pelo sistema (ferramenta futura gerar_pix_pedido).',
    );
  } else if (pixMethod?.mode === 'manual') {
    notesParts.push(
      'Pix manual: não informe chave Pix ao cliente; a loja enviará os dados ou combinará o pagamento após o pedido.',
    );
  } else if (keys.some((k) => normalizeMethodKey(k) === 'pix')) {
    notesParts.push('Pix listado mas sem chave ou gateway configurado — não invente dados de pagamento.');
  }

  const cashMethod = methods.find((m) => m.type === 'cash' && m.enabled);
  if (cashMethod) {
    notesParts.push('Dinheiro: pergunte se o cliente precisa de troco e qual valor ao finalizar o pedido.');
  }

  if (methods.length === 0) {
    notesParts.push('Nenhuma forma de pagamento configurada para esta loja.');
  }

  return {
    methods,
    notes: notesParts.join(' '),
    pixAutomaticAvailable,
  };
}
