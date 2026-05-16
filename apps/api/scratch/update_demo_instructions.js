const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  try {
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'pizzaria-demo' } });
    if (!tenant) throw new Error('Tenant not found');

    await prisma.aiAgentConfig.update({
      where: { tenantId: tenant.id },
      data: {
        customInstructions: `Você é o assistente da Pizzaria Demo, famosa pelas nossas pizzas de massa artesanal e bordas recheadas.

Informações Importantes:
- Especialidade: Pizza de Calabresa Premium e Pizza de Nutella com Morango.
- Promoção: Na compra de duas pizzas grandes, o cliente ganha um guaraná de 2L (apenas de terça a quinta).
- Localização: Atendemos toda a região central.

Tom de voz: Descontraído, acolhedor e "família". Pode usar termos como "amigo(a)" ou "pessoal".

Ao sugerir produtos, destaque a qualidade dos nossos ingredientes frescos. Se o cliente estiver em dúvida, sugira sempre a nossa "Pizza da Casa".`
      }
    });
    console.log('Demo tenant instructions updated (hours removed)');
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
run();
