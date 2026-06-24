const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const sessionId = '664019e5-fa1d-417b-80a7-f44025592f9d'; 
  
  console.log('Creating message with undefined externalId...');
  const msg = await prisma.chatMessage.create({
    data: {
      session: { connect: { id: sessionId } },
      direction: 'outbound',
      senderType: 'human',
      content: 'Teste 3',
      messageType: 'text',
      externalStatus: 'sent',
      metadata: { whatsapp: { sent: true } }
    }
  });
  console.log('Success:', msg.id);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
