export type ChatState = 'greeting' | 'browsing_menu' | 'checkout' | 'payment' | 'handoff_human' | 'closed';

export type MessageDirection = 'inbound' | 'outbound';

export interface ChatSession {
  id: string;
  tenantId: string;
  customerPhone: string;
  state: ChatState;
  cartData?: unknown;
  lastMessageAt: string;
  handoffActive: boolean;
  handoffReason?: string;
  handoffAt?: string;
  handoffOperator?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  direction: MessageDirection;
  content: string;
  messageType: string;
  externalId?: string;
  toolCalls?: unknown;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMessageDto {
  sessionId: string;
  direction: MessageDirection;
  content: string;
  messageType?: string;
  externalId?: string;
  toolCalls?: unknown;
  metadata?: Record<string, unknown>;
}

export interface ChatSessionListItem {
  id: string;
  customerPhone: string;
  state: ChatState;
  lastMessageAt: string;
  lastMessage: string | null;
  handoffActive: boolean;
  // Campos para UI (calculados)
  name?: string;
  status?: 'handoff' | 'bot';
  time?: string;
}
