/**
 * Mapeamento opcional tool → módulo do tenant.
 * Tools sem entrada aqui permanecem disponíveis (compatibilidade).
 */
export const AI_TOOL_MODULE_REQUIREMENTS: Partial<Record<string, string>> = {
  consultar_slots_agendamento: 'orders',
  aplicar_cupom_desconto: 'crm',
  consultar_fidelidade: 'crm',
  consultar_ofertas_checkout: 'crm',
};
