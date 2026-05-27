import { PrismaClient } from '@prisma/client';

/** Módulos habilitados por padrão no tenant demo (inclui IA + WhatsApp). */
export const DEMO_TENANT_MODULES_ENABLED = [
  'catalog',
  'orders',
  'delivery',
  'crm',
  'whatsapp',
  'ai_agent',
] as const;

/**
 * Habilita módulo ai_agent (e whatsapp) + config do agente com isEnabled=true.
 * Usado no seed e em scripts de correção pontual.
 */
export async function seedDemoAiAgentAccess(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  for (const module of DEMO_TENANT_MODULES_ENABLED) {
    await prisma.tenantModuleAccess.upsert({
      where: {
        tenantId_module: { tenantId, module },
      },
      update: { enabled: true },
      create: {
        tenantId,
        module,
        enabled: true,
      },
    });
  }

  await prisma.aiAgentConfig.upsert({
    where: { tenantId },
    update: { isEnabled: true },
    create: {
      tenantId,
      isEnabled: true,
      agentName: 'Assistente Pizzaria Demo',
      tone: 'friendly',
      operatingMode: 'always',
      handoffPolicy: 'on_request',
      maxRetries: 3,
      sessionTimeoutMin: 120,
      dailyMessageLimit: 1000,
      customerCooldownMin: 5,
      simulateTyping: true,
      debounceMs: 10000,
      greetingMessage:
        'Olá! Sou o assistente virtual da Pizzaria Demo. Como posso ajudar?',
      fallbackMessage:
        'Desculpe, não consegui processar agora. Quer falar com um atendente?',
      customInstructions:
        'Atenda em português (BR). Seja conciso e ajude com cardápio, pedidos e entrega.',
      memoryEnabled: true,
      rememberCustomerName: true,
      rememberAddresses: true,
      rememberLastOrder: true,
      rememberPreferences: false,
      allowRepeatLastOrder: true,
      memoryRetentionDays: 180,
    },
  });
}
