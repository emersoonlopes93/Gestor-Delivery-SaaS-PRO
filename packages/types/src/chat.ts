export type ChatState =
  | 'greeting'
  | 'browsing_menu'
  | 'building_cart'
  | 'collecting_address'
  | 'awaiting_confirmation'
  | 'order_created'
  | 'handoff_human'
  | 'closed'
  | 'expired';

export type MessageDirection = 'inbound' | 'outbound';

export type MessageSenderType = 'customer' | 'ai' | 'human' | 'system';

export type MessageExternalStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface ChatSession {
  id: string;
  tenantId: string;
  customerPhone: string;
  customerId?: string;
  displayName?: string;
  channel: string;
  remoteJid?: string;
  state: ChatState;
  cartData?: unknown;
  lastCustomerMessageAt?: string;
  lastAgentMessageAt?: string;
  lastMessageAt: string;
  expiresAt?: string;
  unreadCount: number;
  closedAt?: string;
  closeReason?: string;
  metadata?: unknown;
  handoffActive: boolean;
  handoffReason?: string;
  handoffOperator?: string;
  handoffAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  direction: MessageDirection;
  senderType: MessageSenderType;
  content: string;
  messageType: string;
  externalId?: string;
  externalStatus: MessageExternalStatus;
  timestamp?: string;
  toolCalls?: unknown;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMessageDto {
  sessionId: string;
  direction: MessageDirection;
  senderType?: MessageSenderType;
  content: string;
  messageType?: string;
  externalId?: string;
  externalStatus?: MessageExternalStatus;
  timestamp?: string;
  toolCalls?: unknown;
  metadata?: Record<string, unknown>;
}

export interface AiToolFailureSummary {
  toolName: string;
  count: number;
  lastAt: string;
  lastErrorCode?: string;
  lastSignatureHash?: string;
  isRecent: boolean;
  wouldBlock: boolean;
}

export interface ChatSessionListItem {
  id: string;
  customerPhone: string;
  displayName?: string;
  state: ChatState;
  lastMessageAt: string;
  lastMessage: string | null;
  handoffActive: boolean;
  unreadCount?: number;
  aiAttentionRequired?: boolean;
  aiBlockedTools?: string[];
  aiLastFailureAt?: string | null;
  aiToolFailures?: AiToolFailureSummary[];
  // Campos para UI (calculados)
  name?: string;
  status?: 'handoff' | 'bot';
  time?: string;
}
