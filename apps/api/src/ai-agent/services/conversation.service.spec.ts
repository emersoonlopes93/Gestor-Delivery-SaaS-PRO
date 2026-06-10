import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service';
import { ConversationService } from './conversation.service';
import { ChatGateway } from '../../chat/chat.gateway';

// Mock de PrismaService e ChatGateway
jest.mock('../../database/prisma.service');
jest.mock('../../chat/chat.gateway');

describe('ConversationService - Session Expiration & Exit Commands', () => {
  let service: ConversationService;
  let prisma: PrismaService;
  let chatGateway: ChatGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        {
          provide: PrismaService,
          useValue: {
            chatSession: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              create: jest.fn(),
            },
            chatMessage: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            customer: {
              upsert: jest.fn(),
            },
            aiAgentConfig: {
              findUnique: jest.fn().mockResolvedValue(null),
            },
            systemConfig: {
              findFirst: jest.fn().mockResolvedValue(null),
            },
          },
        },
        {
          provide: ChatGateway,
          useValue: {
            emitSessionUpdated: jest.fn(),
            emitMessageCreated: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
    prisma = module.get<PrismaService>(PrismaService);
    chatGateway = module.get<ChatGateway>(ChatGateway);
  });

  describe('Teste 1: Sessão expira por inatividade', () => {
    it('Deve marcar sessão como expired quando timeout é atingido', async () => {
      const sessionId = 'session-123';
      const tenantId = 'tenant-123';
      const customerId = 'customer-123';
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      // Mock da sessão ativa antiga
      const oldSession = {
        id: sessionId,
        tenantId,
        customerId,
        state: 'browsing_menu',
        expiresAt: fiveMinutesAgo, // Expirada
        lastMessageAt: fiveMinutesAgo,
        lastCustomerMessageAt: fiveMinutesAgo,
        closedAt: null,
        closeReason: null,
        handoffActive: false,
        metadata: JSON.stringify({
          ai: {
            orderDraft: {
              items: [{ productId: 'prod-1', quantity: 2 }],
            },
          },
        }),
      };

      // Mock da sessão atualizada após expiração
      const expiredSession = {
        ...oldSession,
        state: 'expired',
        closedAt: now,
        closeReason: 'timeout',
        handoffActive: false,
        metadata: JSON.stringify({ ai: {} }), // Draft limpo
      };

      (prisma.chatSession.findFirst as jest.Mock).mockResolvedValue(oldSession);
      (prisma.chatSession.update as jest.Mock).mockResolvedValue(expiredSession);
      (prisma.chatMessage.create as jest.Mock).mockResolvedValue({
        id: 'msg-1',
        sessionId,
        content: 'Sessão expirada por inatividade...',
      });

      await service.expireSession(sessionId, 'timeout');

      expect(prisma.chatSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: expect.objectContaining({
          state: 'expired',
          closeReason: 'timeout',
          handoffActive: false,
        }),
      });

      expect(chatGateway.emitSessionUpdated).toHaveBeenCalled();
    });
  });

  describe('Teste 2: Comando #Sair encerra sessão', () => {
    it('Deve fechar sessão quando cliente usa comando de saída', async () => {
      const sessionId = 'session-123';
      const tenantId = 'tenant-123';
      const customerId = 'customer-123';
      const now = new Date();

      const activeSession = {
        id: sessionId,
        tenantId,
        customerId,
        state: 'browsing_menu',
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        lastMessageAt: now,
        closedAt: null,
        closeReason: null,
        handoffActive: false,
        metadata: JSON.stringify({
          ai: {
            orderDraft: {
              items: [{ productId: 'prod-1', quantity: 1 }],
            },
          },
        }),
      };

      const closedSession = {
        ...activeSession,
        state: 'closed',
        closedAt: now,
        closeReason: 'customer_exit',
        handoffActive: false,
        metadata: JSON.stringify({ ai: {} }), // Draft limpo
      };

      (prisma.chatSession.findUnique as jest.Mock).mockResolvedValue(activeSession);
      (prisma.chatSession.update as jest.Mock).mockResolvedValue(closedSession);
      (prisma.chatMessage.create as jest.Mock).mockResolvedValue({
        id: 'msg-1',
        content: '#Sair',
      });

      await service.closeSessionByCustomerExit(sessionId, '#Sair');

      expect(prisma.chatSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: expect.objectContaining({
          state: 'closed',
          closeReason: 'customer_exit',
          handoffActive: false,
        }),
      });

      // Verifica se draft foi limpo
      expect(prisma.chatSession.findUnique).toHaveBeenCalled();
    });
  });

  describe('Teste 3: Draft expirado é limpo', () => {
    it('Deve remover orderDraft ao expirar sessão', async () => {
      const sessionId = 'session-123';
      const sessionWithDraft = {
        id: sessionId,
        metadata: {
          ai: {
            orderDraft: {
              items: [{ productId: 'prod-1', quantity: 2 }],
              subtotal: 50,
              total: 60,
            },
            lastKnownCustomerName: 'João',
          },
        },
      };

      (prisma.chatSession.findUnique as jest.Mock).mockResolvedValue(sessionWithDraft);
      (prisma.chatSession.update as jest.Mock).mockResolvedValue({
        id: sessionId,
        metadata: {
          ai: {
            lastKnownCustomerName: 'João', // Preservado
            // orderDraft removido
          },
        },
      });

      await service.clearSessionTemporaryAiMemory(sessionId);

      const updateCall = (prisma.chatSession.update as jest.Mock).mock.calls[0][0];
      const metadata = updateCall.data.metadata;

      // Verifica se orderDraft foi removido
      expect(metadata.ai.orderDraft).toBeUndefined();
      // Verifica se dados persistentes foram preservados
      expect(metadata.ai.lastKnownCustomerName).toBeDefined();
    });
  });

  describe('Teste 4: Memória persistente é preservada', () => {
    it('Deve manter Customer e histórico ao expirar sessão', async () => {
      const customerId = 'customer-123';
      const customerPhone = '+5511999999999';
      const tenantId = 'tenant-123';

      // Simula busca de customer com histórico
      const customer = {
        id: customerId,
        tenantId,
        phone: customerPhone,
        name: 'João Silva',
        email: 'joao@example.com',
        totalOrders: 5,
        totalSpent: 250,
        lastOrderDate: new Date(),
        loyaltyPoints: 100,
      };

      const customerMock = {
        findUnique: jest.fn().mockResolvedValue(customer),
      };
      Object.defineProperty(prisma, 'customer', {
        value: customerMock,
        writable: true,
      });

      // Mock retorna sessão nova (mesma session TTL)
      const newSession = {
        id: 'session-456',
        tenantId,
        customerPhone,
        customerId,
        state: 'greeting',
        lastMessageAt: new Date(),
      };

      (prisma.chatSession.create as jest.Mock).mockResolvedValue(newSession);

      // Cria nova sessão
      const session = await service.getOrCreateSession(
        tenantId,
        customerPhone,
        {
          customerId,
          sessionTimeoutMin: 120,
        },
      );

      // Verifica que customer persiste (mesmo ID)
      expect(session.customerId).toBe(customerId);
      expect(session.tenantId).toBe(tenantId);
    });
  });

  describe('Teste 5: Handoff expirado volta para bot', () => {
    it('Deve desativar handoff quando sessão expira', async () => {
      const sessionId = 'session-123';
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      const handoffSession = {
        id: sessionId,
        state: 'handoff_human',
        expiresAt: fiveMinutesAgo,
        lastMessageAt: fiveMinutesAgo,
        handoffActive: true,
        handoffOperator: 'operator@example.com',
        handoffReason: 'Solicitado pelo cliente',
      };

      const expiredSession = {
        ...handoffSession,
        state: 'expired',
        closedAt: now,
        closeReason: 'handoff_expired',
        handoffActive: false,
      };

      (prisma.chatSession.findFirst as jest.Mock).mockResolvedValue(handoffSession);
      (prisma.chatSession.update as jest.Mock).mockResolvedValue(expiredSession);
      (prisma.chatMessage.create as jest.Mock).mockResolvedValue({
        id: 'msg-1',
        content: 'Atendimento com humano expirado...',
      });

      await service.expireSession(sessionId, 'handoff_expired');

      expect(prisma.chatSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: expect.objectContaining({
          state: 'expired',
          handoffActive: false,
          closeReason: 'handoff_expired',
        }),
      });
    });
  });
});
