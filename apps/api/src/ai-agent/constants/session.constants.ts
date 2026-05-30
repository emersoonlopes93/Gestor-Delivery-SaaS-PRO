/**
 * Constantes para gerenciamento de sessões de chat.
 * Tipagem segura sem uso de enums para melhor compatibilidade com Prisma.
 */

// Estados da sessão
export const CHAT_STATE = {
  GREETING: 'greeting',
  BROWSING_MENU: 'browsing_menu',
  BUILDING_CART: 'building_cart',
  CHECKOUT: 'checkout',
  HANDOFF_HUMAN: 'handoff_human',
  CLOSED: 'closed',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;

export type ChatStateType = (typeof CHAT_STATE)[keyof typeof CHAT_STATE];

// Motivos de encerramento de sessão
export const SESSION_CLOSE_REASON = {
  CUSTOMER_EXIT: 'customer_exit',
  TIMEOUT: 'timeout',
  HUMAN_CLOSED: 'human_closed',
  ORDER_COMPLETED: 'order_completed',
  ADMIN_CLOSED: 'admin_closed',
  SYSTEM_RESET: 'system_reset',
  HANDOFF_EXPIRED: 'handoff_expired',
} as const;

export type SessionCloseReasonType = (typeof SESSION_CLOSE_REASON)[keyof typeof SESSION_CLOSE_REASON];

// Comandos que o cliente pode usar
export const EXIT_COMMANDS = [
  '#sair',
  'sair',
  'encerrar',
  'encerrar atendimento',
  'cancelar atendimento',
  '#exit',
  'exit',
];

// Estados que indicam sessão ativa
export const ACTIVE_SESSION_STATES: ChatStateType[] = [
  'greeting',
  'browsing_menu',
  'building_cart',
  'checkout',
];

// Estados que indicam sessão encerrada
export const TERMINAL_SESSION_STATES: ChatStateType[] = ['closed', 'expired', 'cancelled'];

// Tempo padrão de timeout em minutos
export const DEFAULT_SESSION_TIMEOUT_MIN = 120;

/**
 * Detecta se a mensagem é um comando de saída.
 * Case-insensitive, ignora espaçamento extra.
 */
export function isExitCommand(content: string, exitCommands?: string[]): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }

  const normalized = content.trim().toLowerCase();
  const commands = exitCommands ?? EXIT_COMMANDS;

  return commands.some((cmd) => normalized === cmd.toLowerCase() || normalized.startsWith(cmd.toLowerCase() + ' '));
}

/**
 * Mensagens padrão do sistema para diferentes cenários.
 */
export const SYSTEM_MESSAGES = {
  EXIT_CONFIRMED:
    'Atendimento encerrado conforme solicitado. Quando quiser, é só mandar uma nova mensagem 😊',
  SESSION_EXPIRED:
    'Sessão expirada por inatividade. Envie uma nova mensagem para iniciar um novo atendimento.',
  HANDOFF_EXPIRED:
    'Atendimento com humano expirado. Envie uma mensagem para continuar com um novo atendimento.',
  SESSION_CLOSED: 'Conversa encerrada',
} as const;
