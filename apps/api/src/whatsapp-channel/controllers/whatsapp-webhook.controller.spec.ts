import { WhatsAppWebhookController } from './whatsapp-webhook.controller';

describe('WhatsAppWebhookController authentication and opt-out durability', () => {
  const prisma = { whatsAppInstance: { findUnique: jest.fn() }, customerOptOut: { upsert: jest.fn(), update: jest.fn() }, chatMessage: { findUnique: jest.fn(), update: jest.fn() } };
  const provider = { parseWebhook: jest.fn() };
  const controller = new WhatsAppWebhookController(prisma as never, { getProvider: jest.fn(() => provider) } as never, {} as never, {} as never, { handleInboundMessage: jest.fn() } as never);
  const payload = { event: 'messages.upsert', instanceId: 'instance-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.whatsAppInstance.findUnique.mockResolvedValue({ tenantId: 'tenant-1', providerType: 'evolution_go', webhookSecret: 'secret' });
    provider.parseWebhook.mockReturnValue({ type: 'message', tenantId: 'tenant-1', from: '5511999999999@s.whatsapp.net', content: 'sair', externalId: 'event-1', isFromMe: false });
    prisma.customerOptOut.upsert.mockResolvedValue({ id: 'optout' });
    prisma.chatMessage.findUnique.mockResolvedValue({ id: 'message-1', sessionId: 'session-1', session: { tenantId: 'tenant-1' } });
    prisma.chatMessage.update.mockResolvedValue({});
  });

  it('accepts only the correct configured secret and persists a tenant-scoped opt-out idempotently', async () => {
    await expect(controller.handleWebhook(payload, 'secret')).resolves.toEqual({ received: true, processed: true });
    expect(prisma.customerOptOut.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId_phone: { tenantId: 'tenant-1', phone: '5511999999999' } } }));
  });

  it.each([undefined, 'wrong'])('rejects a missing or invalid secret without exposing instance state', async (secret) => {
    await expect(controller.handleWebhook(payload, secret)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects an instance without a configured secret', async () => {
    prisma.whatsAppInstance.findUnique.mockResolvedValueOnce({ tenantId: 'tenant-1', providerType: 'evolution_go', webhookSecret: null });
    await expect(controller.handleWebhook(payload, 'secret')).rejects.toMatchObject({ status: 401 });
  });

  it('returns 5xx when opt-out persistence fails so the provider can retry', async () => {
    prisma.customerOptOut.upsert.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(controller.handleWebhook(payload, 'secret')).rejects.toMatchObject({ status: 503 });
  });
});
