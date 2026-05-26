import { WhatsAppInstanceService } from '../src/whatsapp-channel/services/whatsapp-instance.service';
import { WhatsAppInstanceStatus, WhatsAppProviderType } from '@prisma/client';

declare const process: { exitCode?: number };

type TestResult = {
  name: string;
  passed: boolean;
  detail: string;
};

const results: TestResult[] = [];

function assert(name: string, condition: boolean, detail: string) {
  results.push({ name, passed: condition, detail });
  console.log(condition ? `  OK  ${name}` : `  ERR ${name}: ${detail}`);
}

async function main() {
  const tenantId = 't1';
  let mockDbInstance: any = {
    id: 'inst-1',
    tenantId,
    providerType: 'evolution_go' as WhatsAppProviderType,
    instanceName: 'gestor_t1_abc',
    apiUrl: 'http://mock-api',
    apiKey: 'mock-key',
    status: 'qr_pending' as WhatsAppInstanceStatus,
    qrCode: 'data:image/png;base64,mockqr...',
    phoneNumber: null,
    evolutionInstanceId: null,
  };

  const prismaMock: any = {
    systemConfig: {
      findUnique: async () => ({
        id: 'global',
        defaultWhatsAppProvider: 'evolution_go',
        evolutionUrl: 'http://mock-api',
        evolutionGlobalToken: 'mock-key',
      }),
    },
    whatsAppInstance: {
      findUnique: async () => mockDbInstance,
      update: async (args: any) => {
        mockDbInstance = { ...mockDbInstance, ...args.data };
        return mockDbInstance;
      },
    },
  };

  // Mock provider connection status responses
  let providerState = 'qr_pending';
  let providerQr: string | undefined = undefined; // Returns no QR on polling
  let providerPhone: string | undefined = undefined;

  const mockProvider: any = {
    getConnectionStatus: async () => ({
      connected: providerState === 'connected',
      state: providerState,
      phoneNumber: providerPhone,
      qrCode: providerQr,
    }),
  };

  const providerRegistryMock: any = {
    getProvider: () => mockProvider,
  };

  const service = new WhatsAppInstanceService(prismaMock, providerRegistryMock);

  // Test Case 1: Status polling preserves qrCode when provider returns qr_pending/no-QR
  providerState = 'qr_pending';
  providerQr = undefined;
  mockDbInstance.status = 'qr_pending';
  mockDbInstance.qrCode = 'saved-qr-code';

  await service.getStatus(tenantId);
  assert(
    'Status polling preserves qrCode when provider returns qr_pending without QR',
    mockDbInstance.qrCode === 'saved-qr-code' && mockDbInstance.status === 'qr_pending',
    `qrCode=${mockDbInstance.qrCode} status=${mockDbInstance.status}`,
  );

  // Test Case 2: Status polling clears qrCode when status changes to connected
  providerState = 'connected';
  providerPhone = '5511999999999';
  await service.getStatus(tenantId);
  assert(
    'Status polling clears qrCode when status becomes connected',
    mockDbInstance.qrCode === null && mockDbInstance.status === 'connected',
    `qrCode=${mockDbInstance.qrCode} status=${mockDbInstance.status}`,
  );

  // Test Case 3: Anti-resurrection: if local is disconnected, do NOT resurrect to qr_pending
  mockDbInstance.status = 'disconnected';
  mockDbInstance.qrCode = null;
  providerState = 'qr_pending';
  providerPhone = undefined;

  await service.getStatus(tenantId);
  assert(
    'Anti-resurrection: local status disconnected is NOT resurrected to qr_pending',
    mockDbInstance.status === 'disconnected',
    `status=${mockDbInstance.status}`,
  );

  const failed = results.filter((r) => !r.passed);
  console.log(`\nResults: ${results.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(`Test script crashed: ${String(err)}`);
  process.exitCode = 1;
});
