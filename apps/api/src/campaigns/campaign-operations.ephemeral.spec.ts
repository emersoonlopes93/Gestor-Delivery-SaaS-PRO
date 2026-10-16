import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { CampaignsService } from './services/campaigns.service';
import { CampaignDispatcherService } from './services/campaign-dispatcher.service';
import { CampaignProcessor } from './services/campaign.processor';

const databaseUrl = process.env.CAMPAIGN_INTEGRATION_DATABASE_URL;
const redisUrl = process.env.CAMPAIGN_REDIS_TEST_URL;
const describeEphemeral = databaseUrl && redisUrl ? describe : describe.skip;

describeEphemeral('campaign PostgreSQL, Redis and fake-provider smoke', () => {
  jest.setTimeout(30_000);

  it('segments, excludes opt-out, queues, sends once and records the Inbox flow', async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.DIRECT_URL = databaseUrl;
    const prisma = new PrismaClient();
    const parsedRedis = new URL(redisUrl as string);
    const connection = { host: parsedRedis.hostname, port: Number(parsedRedis.port) };
    const queue = new Queue(`campaign-operations-${Date.now()}`, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 50 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    });
    const fakeMessageId = `fake-provider-message-${Date.now()}`;
    const sender = {
      sendText: jest.fn().mockResolvedValue({ success: true, messageId: fakeMessageId }),
      sendMedia: jest.fn(),
      publishStatus: jest.fn(),
    };
    const campaigns = new CampaignsService(prisma as never);
    const dispatcher = new CampaignDispatcherService(prisma as never, queue);
    const processor = new CampaignProcessor(
      prisma as never,
      sender as never,
      dispatcher,
      { runAllTenants: jest.fn() } as never,
    );
    Object.defineProperty(processor, 'checkAntiSpam', {
      value: jest.fn().mockResolvedValue({ allowed: true }),
    });
    let timeoutSpy: jest.SpiedFunction<typeof setTimeout> | undefined;

    const suffix = Date.now().toString();
    const tenantId = `tenant-campaign-proof-${suffix}`;
    const eligibleCustomerId = `customer-eligible-${suffix}`;
    const optedOutCustomerId = `customer-optout-${suffix}`;

    try {
      await prisma.tenant.create({
        data: { id: tenantId, name: 'Campaign Proof', slug: `campaign-proof-${suffix}` },
      });
      await prisma.customer.createMany({
        data: [
          { id: eligibleCustomerId, tenantId, name: 'Eligible Customer', phone: '5511999990001' },
          { id: optedOutCustomerId, tenantId, name: 'Opted Customer', phone: '5511999990002' },
        ],
      });

      const campaign = await campaigns.createCampaign(tenantId, {
        name: 'Ephemeral campaign proof',
        messageTemplate: 'Ola, {{nome}}',
        segmentRules: { specificCustomers: [eligibleCustomerId, optedOutCustomerId] },
      });
      await prisma.customerOptOut.create({
        data: {
          tenantId,
          customerId: optedOutCustomerId,
          phone: '5511999990002',
          reason: 'ephemeral-proof',
        },
      });
      await campaigns.startCampaign(tenantId, campaign.id);
      await dispatcher.feedQueue();

      const dispatches = await prisma.campaignDispatch.findMany({
        where: { campaignId: campaign.id },
        orderBy: { phone: 'asc' },
      });
      expect(dispatches).toHaveLength(2);
      const eligibleDispatch = dispatches.find((item) => item.customerId === eligibleCustomerId);
      const optedOutDispatch = dispatches.find((item) => item.customerId === optedOutCustomerId);
      expect(eligibleDispatch).toBeDefined();
      expect(optedOutDispatch).toBeDefined();

      const eligibleJob = await queue.getJob(`dispatch-${eligibleDispatch?.id}`);
      const optedOutJob = await queue.getJob(`dispatch-${optedOutDispatch?.id}`);
      expect(eligibleJob).not.toBeNull();
      expect(optedOutJob).not.toBeNull();
      timeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((callback: () => void) => {
        callback();
        return 0;
      }) as typeof setTimeout);
      await expect(processor.process(eligibleJob as never)).resolves.toEqual({
        success: true,
        messageId: fakeMessageId,
      });
      await expect(processor.process(optedOutJob as never)).resolves.toEqual({
        success: false,
        skipped: true,
        reason: 'opt-out',
      });
      await expect(processor.process(eligibleJob as never)).resolves.toEqual({
        success: true,
        skipped: true,
        reason: 'already_processed',
      });
      expect(sender.sendText).toHaveBeenCalledTimes(1);

      const persistedOptOut = await prisma.campaignDispatch.findUniqueOrThrow({
        where: { id: optedOutDispatch?.id },
      });
      expect(persistedOptOut.status).toBe('opt_out');
      expect(persistedOptOut.failReason).toContain('Opt-out');

      const session = await prisma.chatSession.findFirstOrThrow({
        where: { tenantId, customerId: eligibleCustomerId },
      });
      await prisma.chatMessage.create({
        data: {
          sessionId: session.id,
          direction: 'inbound',
          senderType: 'customer',
          content: 'Resposta fake',
          messageType: 'text',
          externalId: `fake-inbound-${suffix}`,
          externalStatus: 'delivered',
          timestamp: new Date(),
        },
      });
      const inbox = await prisma.chatSession.findFirstOrThrow({
        where: { id: session.id, tenantId },
        include: { messages: { orderBy: { timestamp: 'asc' } } },
      });
      expect(inbox.messages.map((message) => message.direction)).toEqual(['outbound', 'inbound']);
      expect(inbox.messages[0]?.metadata).toEqual(expect.objectContaining({
        source: 'campaign',
        campaignId: campaign.id,
        dispatchId: eligibleDispatch?.id,
      }));
    } finally {
      timeoutSpy?.mockRestore();
      await queue.obliterate({ force: true });
      await queue.close();
      await prisma.campaignDispatch.deleteMany({ where: { campaign: { tenantId } } });
      await prisma.campaign.deleteMany({ where: { tenantId } });
      await prisma.customerOptOut.deleteMany({ where: { tenantId } });
      await prisma.chatSession.deleteMany({ where: { tenantId } });
      await prisma.customer.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
      await prisma.$disconnect();
    }
  });
});
