import { BadRequestException } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';

describe('CampaignsService tenant and state invariants', () => {
  const prisma = {
    campaign: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    campaignDispatch: {
      updateMany: jest.fn(),
    },
    customerOptOut: { findMany: jest.fn() },
    customer: { findMany: jest.fn() },
  };
  const dispatcher = { assertAvailable: jest.fn().mockResolvedValue(undefined) };
  const service = new CampaignsService(prisma as never, dispatcher as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a cross-tenant campaign start', async () => {
    prisma.campaign.findFirst.mockResolvedValue(null);

    await expect(service.startCampaign('tenant-1', 'campaign-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });

  it('allows only draft or scheduled campaigns to enter processing', async () => {
    prisma.campaign.findFirst.mockResolvedValue({ id: 'campaign-1', tenantId: 'tenant-1', status: 'draft' });
    prisma.campaign.update.mockResolvedValue({ id: 'campaign-1', status: 'processing' });

    await service.startCampaign('tenant-1', 'campaign-1');
    expect(prisma.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'campaign-1' },
      data: expect.objectContaining({ status: 'processing' }),
    }));

    prisma.campaign.findFirst.mockResolvedValue({ id: 'campaign-1', tenantId: 'tenant-1', status: 'cancelled' });
    await expect(service.startCampaign('tenant-1', 'campaign-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cancels only a tenant-owned non-terminal campaign', async () => {
    prisma.campaign.updateMany.mockResolvedValue({ count: 1 });
    await service.cancelCampaign('tenant-1', 'campaign-1');

    expect(prisma.campaign.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'campaign-1',
        tenantId: 'tenant-1',
        status: { in: ['draft', 'scheduled', 'processing', 'queued'] },
      },
      data: expect.objectContaining({ status: 'cancelled' }),
    }));
  });

  it('builds tenant-scoped audience filters for normalized opt-outs', async () => {
    prisma.customerOptOut.findMany.mockResolvedValue([
      { customerId: null, phone: '5511999999999@s.whatsapp.net' },
      { customerId: 'customer-opted-out', phone: '5511888888888' },
    ]);
    prisma.customer.findMany.mockResolvedValue([{ id: 'customer-eligible' }]);

    await expect(service.estimateAudience('tenant-1', {
      specificCustomers: ['customer-eligible', 'customer-opted-out'],
    })).resolves.toEqual({ estimatedAudience: 1 });
    expect(prisma.customerOptOut.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1' },
    }));
    expect(prisma.customer.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        id: {
          in: ['customer-eligible', 'customer-opted-out'],
          notIn: ['customer-opted-out'],
        },
        phone: { notIn: ['5511999999999', '5511888888888'] },
      },
      select: { id: true },
    });
  });
});
