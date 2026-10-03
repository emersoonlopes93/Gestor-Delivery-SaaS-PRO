import type { Job } from 'bullmq';
import { CampaignProcessor, CampaignJobData } from './campaign.processor';

describe('CampaignProcessor delivery invariants', () => {
  const prisma = { campaign: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() }, campaignDispatch: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() }, customerOptOut: { findUnique: jest.fn() }, tenantSettings: { findUnique: jest.fn() } };
  const sender = { sendText: jest.fn(), sendMedia: jest.fn(), publishStatus: jest.fn(), supportsIdempotencyKey: jest.fn() };
  const dispatcher = { feedQueue: jest.fn(), finalizeCampaign: jest.fn(), rescheduleDispatch: jest.fn() };
  const processor = new CampaignProcessor(prisma as never, sender as never, dispatcher as never, { runAllTenants: jest.fn() } as never);
  const data: CampaignJobData = { campaignId: 'campaign-1', dispatchId: 'dispatch-1', tenantId: 'tenant-1', customerId: 'customer-1', phone: '5511999999999', customerName: 'Customer', messageTemplate: 'Hi {{nome}}' };
  const job = () => ({ id: 'job-1', name: 'dispatch-job', data }) as Job<CampaignJobData>;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.campaignDispatch.findFirst.mockResolvedValue({ phone: data.phone, status: 'processing', idempotencyKey: 'campaign:campaign-1:dispatch:dispatch-1', attemptCount: 0, campaign: { status: 'processing' } });
    prisma.campaignDispatch.updateMany.mockResolvedValue({ count: 1 }); prisma.campaignDispatch.update.mockResolvedValue({});
    prisma.customerOptOut.findUnique.mockResolvedValue(null); prisma.tenantSettings.findUnique.mockResolvedValue({ timezone: 'UTC' });
    prisma.campaign.findFirst.mockResolvedValue({ status: 'processing' }); prisma.campaign.update.mockResolvedValue({});
    sender.supportsIdempotencyKey.mockResolvedValue(true); sender.sendText.mockResolvedValue({ success: true, messageId: 'provider-1' }); dispatcher.finalizeCampaign.mockResolvedValue(undefined);
    jest.spyOn(Object.getPrototypeOf(processor) as { nextAllowedAttempt: () => Promise<Date | null> }, 'nextAllowedAttempt').mockResolvedValue(null);
  });

  it('does not call the provider after a queued job is cancelled', async () => {
    prisma.campaignDispatch.findFirst.mockResolvedValueOnce({ phone: data.phone, status: 'processing', idempotencyKey: 'key', attemptCount: 0, campaign: { status: 'cancelled' } });
    await expect(processor.process(job())).resolves.toEqual(expect.objectContaining({ skipped: true, reason: 'cancelled' }));
    expect(sender.sendText).not.toHaveBeenCalled();
  });

  it('passes a stable idempotency key and records provider success', async () => {
    await expect(processor.process(job())).resolves.toEqual(expect.objectContaining({ success: true, messageId: 'provider-1' }));
    expect(sender.sendText).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ idempotencyKey: 'campaign:campaign-1:dispatch:dispatch-1' }));
    expect(prisma.campaignDispatch.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'sent', externalId: 'provider-1' }) }));
  });

  it('throws retryable provider rejections so BullMQ retries', async () => {
    sender.sendText.mockResolvedValueOnce({ success: false, retryable: true, error: 'temporary' });
    await expect(processor.process(job())).rejects.toThrow('temporary');
    expect(prisma.campaignDispatch.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'processing' }) }));
  });

  it('blocks automatic resend where a previous provider outcome is unknown', async () => {
    sender.supportsIdempotencyKey.mockResolvedValueOnce(false);
    prisma.campaignDispatch.findFirst.mockResolvedValueOnce({ phone: data.phone, status: 'processing', idempotencyKey: 'key', attemptCount: 1, campaign: { status: 'processing' } });
    await expect(processor.process(job())).resolves.toEqual(expect.objectContaining({ reason: 'reconciliation_required' }));
    expect(sender.sendText).not.toHaveBeenCalled();
  });
});
