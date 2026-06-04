import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando auditoria no Banco de Dados...');
  
  try {
    const settings = await prisma.schedulingSettings.count();
    console.log(`[OK] scheduling_settings existe. Count: ${settings}`);

    const windows = await prisma.schedulingWindow.count();
    console.log(`[OK] scheduling_windows existe. Count: ${windows}`);

    const slots = await prisma.timeSlot.count();
    console.log(`[OK] time_slots existe. Count: ${slots}`);

    const orders = await prisma.scheduledOrder.count();
    console.log(`[OK] scheduled_orders existe. Count: ${orders}`);

    const allOrders = await prisma.order.count();
    console.log(`[OK] orders existe. Count: ${allOrders}`);

    console.log('✅ Etapa 1 - Banco de Dados concluída com sucesso.');
  } catch (error) {
    console.error('❌ Falha na Etapa 1 - Erro ao acessar as tabelas:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
