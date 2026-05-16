const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const globalBasePrompt = `Você é um assistente de atendimento inteligente e proativo para um sistema de delivery de comida. 
Seu objetivo principal é ajudar o cliente a escolher produtos do cardápio, esclarecer dúvidas sobre os itens (ingredientes, preços, tamanhos) e guiar o cliente até a finalização do pedido.

Diretrizes de comportamento:
1. Seja sempre educado, prestativo e utilize um tom de voz condizente com o restaurante.
2. Se o cliente perguntar algo que você não sabe ou não está no cardápio, informe gentilmente e ofereça ajuda com o que está disponível.
3. Utilize as ferramentas (tools) disponíveis para consultar o cardápio, verificar taxas de entrega e criar o pedido quando o cliente estiver pronto.
4. Responda sempre em Português do Brasil.
5. Mantenha as respostas concisas e fáceis de ler no WhatsApp, usando emojis de forma moderada.
6. Se o cliente demonstrar insatisfação ou pedir para falar com um humano, use a ferramenta de handoff imediatamente.
7. Nunca invente preços ou produtos que não constam na consulta ao cardápio.`;

  const demoCustomInstructions = `Você é o assistente da Pizzaria Demo, famosa pelas nossas pizzas de massa artesanal e bordas recheadas.

Informações Importantes:
- Especialidade: Pizza de Calabresa Premium e Pizza de Nutella com Morango.
- Horário de Funcionamento: Terça a Domingo, das 18h às 23:30h.
- Promoção: Na compra de duas pizzas grandes, o cliente ganha um guaraná de 2L (apenas de terça a quinta).
- Localização: Atendemos toda a região central.

Tom de voz: Descontraído, acolhedor e "família". Pode usar termos como "amigo(a)" ou "pessoal".

Ao sugerir produtos, destaque a qualidade dos nossos ingredientes frescos. Se o cliente estiver em dúvida, sugira sempre a nossa "Pizza da Casa".`;

  console.log('Updating SystemConfig (Global Base Prompt)...');
  await prisma.systemConfig.upsert({
    where: { id: 'global' },
    update: { baseAiPrompt: globalBasePrompt },
    create: { id: 'global', baseAiPrompt: globalBasePrompt }
  });

  console.log('Finding Pizzaria Demo tenant...');
  const demoTenant = await prisma.tenant.findUnique({
    where: { slug: 'pizzaria-demo' }
  });

  if (demoTenant) {
    console.log(`Updating AiAgentConfig for tenant ${demoTenant.name}...`);
    await prisma.aiAgentConfig.upsert({
      where: { tenantId: demoTenant.id },
      update: { 
        customInstructions: demoCustomInstructions,
        isEnabled: true,
        agentName: 'Guto',
        greetingMessage: 'Olá! Eu sou o Guto, seu assistente da Pizzaria Demo. Como posso deixar sua noite mais gostosa hoje?'
      },
      create: { 
        tenantId: demoTenant.id,
        customInstructions: demoCustomInstructions,
        isEnabled: true,
        agentName: 'Guto',
        greetingMessage: 'Olá! Eu sou o Guto, seu assistente da Pizzaria Demo. Como posso deixar sua noite mais gostosa hoje?'
      }
    });
  } else {
    console.log('Pizzaria Demo tenant not found.');
  }

  console.log('Configuration complete!');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
