/**
 * Habilita módulo ai_agent + isEnabled no agente para pizzaria-demo (ou tenant informado).
 *
 * Uso:
 *   pnpm --filter @gestor/api exec ts-node -r tsconfig-paths/register scripts/enable-ai-agent-demo.ts
 *   TENANT_SLUG=outro-tenant pnpm --filter @gestor/api exec ts-node -r tsconfig-paths/register scripts/enable-ai-agent-demo.ts
 *   TENANT_ID=uuid pnpm --filter @gestor/api exec ts-node -r tsconfig-paths/register scripts/enable-ai-agent-demo.ts
 */
import { PrismaClient } from '@prisma/client';
import { seedDemoAiAgentAccess } from '../src/seed/demo-ai-agent.seed';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const tenantIdEnv = process.env.TENANT_ID?.trim();
  const tenantSlug = process.env.TENANT_SLUG?.trim() || 'pizzaria-demo';

  const tenant = tenantIdEnv
    ? await prisma.tenant.findUnique({ where: { id: tenantIdEnv } })
    : await prisma.tenant.findFirst({ where: { slug: tenantSlug } });

  if (!tenant) {
    throw new Error(
      `Tenant não encontrado (slug=${tenantSlug}, TENANT_ID=${tenantIdEnv ?? 'n/a'})`,
    );
  }

  console.log(`Tenant: ${tenant.name} (${tenant.slug}) id=${tenant.id}`);

  const before = await prisma.tenantModuleAccess.findMany({
    where: { tenantId: tenant.id, module: { in: ['ai_agent', 'whatsapp'] } },
  });
  console.log('Antes:', before);

  await seedDemoAiAgentAccess(prisma, tenant.id);

  const afterModules = await prisma.tenantModuleAccess.findMany({
    where: { tenantId: tenant.id, module: { in: ['ai_agent', 'whatsapp'] } },
  });
  const aiConfig = await prisma.aiAgentConfig.findUnique({
    where: { tenantId: tenant.id },
  });

  console.log('Depois (módulos):', afterModules);
  console.log('AiAgentConfig:', {
    exists: !!aiConfig,
    isEnabled: aiConfig?.isEnabled,
    agentName: aiConfig?.agentName,
  });

  const aiOk = afterModules.some((m) => m.module === 'ai_agent' && m.enabled);
  if (!aiOk || !aiConfig?.isEnabled) {
    throw new Error('Falha ao habilitar ai_agent ou isEnabled');
  }

  console.log('✅ ai_agent habilitado e isEnabled=true');
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
