import { BadRequestException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';

describe('OnboardingService', () => {
  it('does not allow a client to mark the first-order milestone manually', async () => {
    const prisma = {
      tenantOnboarding: {
        upsert: jest.fn(),
      },
    };
    const service = new OnboardingService(prisma as never);

    await expect(service.updateStep('tenant-a', 'firstOrder')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tenantOnboarding.upsert).not.toHaveBeenCalled();
  });
});
