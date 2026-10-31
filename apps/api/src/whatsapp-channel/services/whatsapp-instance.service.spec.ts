import { ForbiddenException } from '@nestjs/common';
import { WhatsAppInstanceService } from './whatsapp-instance.service';

const instance = { id: 'instance-1', tenantId: 'tenant-1', providerType: 'evolution_go', instanceName: 'instance', evolutionInstanceId: null, apiUrl: 'http://provider', apiKey: 'key' };

function subject(environment: string | undefined, allow: string | undefined) {
  const prisma = { whatsAppInstance: { findUnique: jest.fn().mockResolvedValue(instance), delete: jest.fn().mockResolvedValue(instance) } };
  const provider = { deleteInstance: jest.fn().mockResolvedValue(undefined) };
  const registry = { getProvider: jest.fn().mockReturnValue(provider) };
  const config = { get: jest.fn((key: string) => key === 'NODE_ENV' ? environment : allow) };
  return { service: new WhatsAppInstanceService(prisma as never, registry as never, config as never), prisma, provider };
}

describe('WhatsAppInstanceService dev reset environment guard', () => {
  it.each([['production', 'true'], ['staging', 'true'], [undefined, 'true'], ['development', undefined], ['test', 'false']])
  ('blocks %s without an explicit development/test allow flag', async (environment, allow) => {
    const { service, prisma, provider } = subject(environment, allow);
    await expect(service.devResetInstance('tenant-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.whatsAppInstance.findUnique).not.toHaveBeenCalled();
    expect(provider.deleteInstance).not.toHaveBeenCalled();
  });

  it.each(['development', 'test'])('preserves the reset flow in allowed %s', async (environment) => {
    const { service, prisma, provider } = subject(environment, 'true');
    await service.devResetInstance('tenant-1');
    expect(provider.deleteInstance).toHaveBeenCalledWith('http://provider', 'key', 'instance');
    expect(prisma.whatsAppInstance.delete).toHaveBeenCalledWith({ where: { id: 'instance-1' } });
  });
});
