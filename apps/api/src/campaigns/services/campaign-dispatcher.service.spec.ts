import { CampaignDispatcherService } from './campaign-dispatcher.service';

describe('CampaignDispatcherService', () => {
  const queue = { add: jest.fn(), waitUntilReady: jest.fn() };
  const prisma = {
    campaign: { findMany: jest.fn() },
    campaignDispatch: { findMany: jest.fn(), updateMany: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queue.add.mockResolvedValue({ id: 'queued-job' });
    queue.waitUntilReady.mockResolvedValue(undefined);
    prisma.campaign.findMany.mockResolvedValue([]);
    prisma.campaignDispatch.findMany.mockResolvedValue([]);
    prisma.campaignDispatch.updateMany.mockResolvedValue({ count: 1 });
  });

  const createDispatcher = () =>
    new CampaignDispatcherService(prisma as never, queue as never);

  it('enqueues dispatch jobs with a BullMQ-compatible custom id', async () => {
    const dispatcher = createDispatcher();
    jest.spyOn(dispatcher, 'finalizeCampaign').mockResolvedValue(undefined);
    prisma.campaign.findMany.mockResolvedValue([{
      id: 'campaign-1',
      tenantId: 'tenant-1',
      type: 'whatsapp',
      messageTemplate: 'Hello',
      mediaUrl: null,
      mediaType: null,
    }]);
    prisma.campaignDispatch.findMany.mockResolvedValue([{
      id: 'dispatch-1',
      customerId: 'customer-1',
      phone: '5511999999999',
      customer: { name: 'Customer' },
    }]);

    await dispatcher.feedQueue();

    const options = queue.add.mock.calls[0]?.[2] as { jobId: string };
    expect(queue.add).toHaveBeenCalledWith('dispatch-job', expect.objectContaining({
      campaignId: 'campaign-1',
      dispatchId: 'dispatch-1',
      tenantId: 'tenant-1',
    }), expect.any(Object));
    expect(options.jobId).toMatch(/^campaign-campaign-1-dispatch-dispatch-1-at-\d+$/);
    expect(options.jobId).not.toContain(':');
  });

  it('enqueues status jobs without colon separators', async () => {
    const dispatcher = createDispatcher();
    prisma.campaign.findMany.mockResolvedValue([{
      id: 'campaign-1',
      tenantId: 'tenant-1',
      type: 'whatsapp_status',
      messageTemplate: 'Status',
      mediaUrl: null,
      mediaType: null,
    }]);

    await dispatcher.feedQueue();

    expect(queue.add).toHaveBeenCalledWith('status-job', expect.objectContaining({
      id: 'campaign-1',
      tenantId: 'tenant-1',
      isStatus: true,
    }), expect.objectContaining({ jobId: 'campaign-campaign-1-status' }));
  });

  it('reschedules dispatch jobs with a BullMQ-compatible custom id', async () => {
    const dispatcher = createDispatcher();
    const nextAttemptAt = new Date('2026-08-10T07:00:00.000Z');

    await dispatcher.rescheduleDispatch({
      campaignId: 'campaign-1',
      dispatchId: 'dispatch-1',
      tenantId: 'tenant-1',
    }, nextAttemptAt);

    expect(queue.add).toHaveBeenCalledWith('dispatch-job', expect.any(Object), expect.objectContaining({
      jobId: `campaign-campaign-1-dispatch-dispatch-1-at-${nextAttemptAt.getTime()}`,
    }));
  });
});
