import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { WhatsAppWebhookController } from '../src/whatsapp-channel/controllers/whatsapp-webhook.controller';
import { WhatsAppSenderService } from '../src/whatsapp-channel/services/whatsapp-sender.service';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface MockSendTextInput {
  to: string;
  text?: string;
  image?: string;
  caption?: string;
}

async function main() {
  console.log('🧪 Bootstrapping E2E AI Agent Checkout Flow...\n');
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const webhookController = app.get(WhatsAppWebhookController);
  const senderService = app.get(WhatsAppSenderService);

  // 1. Mock the WhatsApp Sender Service to prevent network calls to Evolution-Go
  const sentMessages: Array<{ to: string; text: string }> = [];
  senderService.sendText = async (_tenantId: string, input: MockSendTextInput) => {
    const text = input.text ?? input.caption ?? '';
    console.log(`[MOCK_SENDER] Outbound Text to ${input.to}: "${text}"`);
    sentMessages.push({ to: input.to, text });
    return { success: true, messageId: `mock-msg-${Date.now()}` };
  };

  senderService.sendPresence = async (
    _tenantId: string,
    to: string,
    presence: string,
  ) => {
    console.log(`[MOCK_SENDER] Presence to ${to}: ${presence}`);
  };

  try {
    // 2. Resolve or Seed Test Tenant
    const tenantSlug = process.env.E2E_TENANT_SLUG ?? 'pizzaria-demo';
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });
    if (!tenant) {
      throw new Error(`Test tenant '${tenantSlug}' not found in database. Set E2E_TENANT_SLUG or run database seeds first.`);
    }

    console.log(`✅ Using Tenant: ${tenant.name} (id=${tenant.id})`);

    // 3. Make sure ai_agent and whatsapp modules are enabled
    await prisma.tenantModuleAccess.upsert({
      where: { tenantId_module: { tenantId: tenant.id, module: 'ai_agent' } },
      create: { tenantId: tenant.id, module: 'ai_agent', enabled: true },
      update: { enabled: true },
    });
    await prisma.tenantModuleAccess.upsert({
      where: { tenantId_module: { tenantId: tenant.id, module: 'whatsapp' } },
      create: { tenantId: tenant.id, module: 'whatsapp', enabled: true },
      update: { enabled: true },
    });

    // 4. Ensure AI Agent Config is active with 500ms debounce for quick E2E script
    await prisma.aiAgentConfig.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        useGlobalDefaults: false,
        isEnabled: true,
        agentName: 'Atendente E2E',
        tone: 'amigável',
        greetingMessage: 'Olá, sou o Atendente E2E da Pizzaria Demo. Como posso te ajudar?',
        debounceMs: 500,
        memoryEnabled: true,
        rememberCustomerName: true,
        rememberAddresses: true,
        rememberLastOrder: true,
      },
      update: {
        useGlobalDefaults: false,
        isEnabled: true,
        debounceMs: 500,
        memoryEnabled: true,
      },
    });

    // Garantir que a loja está aberta e com horários de funcionamento válidos
    await prisma.tenantSettings.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, isStorePaused: false },
      update: { isStorePaused: false },
    });

    const currentDay = new Date().getDay();
    await prisma.tenantOperatingHours.upsert({
      where: { tenantId_dayOfWeek: { tenantId: tenant.id, dayOfWeek: currentDay } },
      create: { tenantId: tenant.id, dayOfWeek: currentDay, isOpen: true, openTime: '00:00', closeTime: '23:59' },
      update: { isOpen: true, openTime: '00:00', closeTime: '23:59' },
    });

    // 5. Seed a mock WhatsApp Instance so the webhook controller can resolve the tenant
    const mockInstanceId = 'e2e-evolution-instance';
    await prisma.whatsAppInstance.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        instanceName: 'e2e-instance',
        evolutionInstanceId: mockInstanceId,
        providerType: 'evolution_go',
        status: 'connected',
        apiUrl: 'http://localhost:8000',
        apiKey: 'mock-key',
        webhookSecret: null,
      },
      update: {
        evolutionInstanceId: mockInstanceId,
        status: 'connected',
        webhookSecret: null,
      },
    });

    // 6. Find a real available product from the menu to buy
    const product = await prisma.product.findFirst({
      where: { tenantId: tenant.id, isActive: true, deletedAt: null },
    });
    if (!product) {
      throw new Error(`No active products found for tenant ${tenant.name}. Add catalog seed data first.`);
    }

    console.log(`🍕 Selected product for order: ${product.name} (id=${product.id}, basePrice=${product.basePrice})`);

    // 6b. Seed required complement group "Escolha a Borda" with item "Catupiry"
    //     This ensures the LLM can find real groupId/itemId via consultar_detalhe_produto
    //     and include them in criar_pedido.
    const BORDA_GROUP_NAME = 'Escolha a Borda (E2E Test)';
    const CATUPIRY_ITEM_NAME = 'Catupiry';

    // Remove previous E2E complement group link + group for idempotency
    const prevGroup = await prisma.productComplementGroup.findFirst({
      where: { tenantId: tenant.id, name: BORDA_GROUP_NAME },
    });
    if (prevGroup) {
      await prisma.productComplementGroupLink.deleteMany({ where: { complementGroupId: prevGroup.id } });
      await prisma.productComplementItem.deleteMany({ where: { groupId: prevGroup.id } });
      await prisma.productComplementGroup.delete({ where: { id: prevGroup.id } });
    }

    const complementGroup = await prisma.productComplementGroup.create({
      data: {
        tenantId: tenant.id,
        name: BORDA_GROUP_NAME,
        minSelect: 1,
        maxSelect: 1,
        isRequired: true,
        order: 99,
        items: {
          create: [
            { tenantId: tenant.id, name: CATUPIRY_ITEM_NAME, additionalPrice: 5, isActive: true, order: 0 },
            { tenantId: tenant.id, name: 'Sem Borda', additionalPrice: 0, isActive: true, order: 1 },
          ],
        },
      },
      include: { items: true },
    });

    // Link the complement group to the selected product
    await prisma.productComplementGroupLink.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        complementGroupId: complementGroup.id,
        order: 99,
      },
    });

    const catupiryItem = complementGroup.items.find((i) => i.name === CATUPIRY_ITEM_NAME);
    if (!catupiryItem) throw new Error('Complement item Catupiry not found after seed!');

    console.log(`✅ Complement group seeded: "${BORDA_GROUP_NAME}" (id=${complementGroup.id})`);
    console.log(`   - Catupiry item id: ${catupiryItem.id}`);
    console.log(`   - Group linked to product: ${product.name} (id=${product.id})`);


    const customerPhone = '5511999991234';
    const cleanPhone = customerPhone.replace(/\D/g, '');

    // Cleanup previous sessions for the test phone to avoid state contamination
    const previousSessions = await prisma.chatSession.findMany({
      where: { tenantId: tenant.id, customerPhone: cleanPhone },
    });
    for (const session of previousSessions) {
      await prisma.chatMessage.deleteMany({ where: { sessionId: session.id } });
    }
    await prisma.chatSession.deleteMany({
      where: { tenantId: tenant.id, customerPhone: cleanPhone },
    });

    // Cleanup previous test orders for this phone
    await prisma.order.deleteMany({
      where: { tenantId: tenant.id, customerPhone: cleanPhone },
    });

    console.log('\n🧪 === TEST: Delivery Order Flow ===');


    // 7. Simulating Webhook inbound messages step by step
    // Debounce is 500ms, LLM call + tool call can take ~5-10s each turn
    const DEBOUNCE_WAIT_MS = 3000; // 500ms debounce + 2.5s padding

    const sendMessage = async (text: string, waitMs = DEBOUNCE_WAIT_MS) => {
      console.log(`\n💬 Customer sends: "${text}"`);
      const msgId = `E2E-MSG-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const payload = {
        event: 'message',
        instanceId: mockInstanceId,
        data: {
          Info: {
            Chat: customerPhone + '@s.whatsapp.net',
            Sender: customerPhone + '@s.whatsapp.net',
            ID: msgId,
            PushName: 'Emerson',
            IsFromMe: false,
          },
          Message: {
            conversation: text,
          },
        },
      };

      await webhookController.handleWebhook(payload);
      // Wait for debounce + LLM processing
      await sleep(waitMs);
    };

    // Delivery flow — send all info progressively to test the full conversation
    // Increased wait times: LLM now needs extra round-trips for consultar_detalhe_produto + criar_pedido
    const TURN_WAIT_MS = 8000;
    await sendMessage('Oi, boa tarde! Quero fazer um pedido.', TURN_WAIT_MS);
    await sendMessage(`Quero 2 de ${product.name} com borda de Catupiry, por favor`, TURN_WAIT_MS);
    await sendMessage('Meu nome é Emerson', TURN_WAIT_MS);
    await sendMessage('Entrega na Rua José Moraes de Aguiar, 1626', TURN_WAIT_MS);
    await sendMessage('Bairro Centro, cidade São Paulo', TURN_WAIT_MS);
    await sendMessage('Pagamento em dinheiro, troco para 150', TURN_WAIT_MS);
    await sendMessage('Sim, tudo certo. Pode confirmar o pedido.', 15000);

    console.log('⏳ Waiting 35 seconds for the final AI response and order creation to complete...');
    await sleep(35000);

    // 8. Asserts & Verification
    console.log('\n🔍 Verifying created order database and state...');

    // Find created order
    const order = await prisma.order.findFirst({
      where: {
        tenantId: tenant.id,
        customerPhone: cleanPhone,
      },
      include: {
        items: {
          include: {
            complements: true,
          },
        },
        deliveryAddress: true,
        timeline: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    let testFailed = false;

    if (!order) {
      console.error('❌ E2E FAIL: Order was not found in the database for the test customer phone!');
      console.error('   Check API logs for [AI_ORDER] and [AI_ORDER_ERROR] entries to diagnose the failure.');
      testFailed = true;
    } else {
      console.log('\n✅ Order found successfully in Database!');
      console.log(`   - Order Number: ${order.orderNumber}`);
      console.log(`   - Status: ${order.status}`);
      console.log(`   - FulfillmentType: ${order.fulfillmentType}`);
      console.log(`   - Source Channel: ${order.sourceChannel}`);
      console.log(`   - Total Amount: R$ ${order.total}`);
      console.log(`   - Items Count: ${order.items.length}`);
      console.log(`   - Delivery Street: ${order.deliveryAddress?.street ?? 'N/A'}`);
      console.log(`   - Delivery Neighborhood: ${order.deliveryAddress?.neighborhood ?? 'N/A'}`);
      console.log(`   - Payment Method: ${order.paymentMethod}`);
      console.log(`   - Change For: ${order.changeFor}`);

      // Verify order is in Active Statuses for Kanban
      const kanbanStatuses = ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'ready_for_delivery', 'out_for_delivery'];
      const isKanbanStatus = kanbanStatuses.includes(order.status);
      console.log(`   - Kanban compatible status: ${isKanbanStatus ? 'YES ✅' : 'NO ❌'}`);
      if (!isKanbanStatus) testFailed = true;

      // Verify sourceChannel
      const isWhatsAppOrder = order.sourceChannel === 'whatsapp_ai';
      console.log(`   - Source channel is whatsapp_ai: ${isWhatsAppOrder ? 'YES ✅' : `NO ❌ (got: ${order.sourceChannel})`}`);
      if (!isWhatsAppOrder) testFailed = true;

      // Verify fulfillmentType
      const isDelivery = order.fulfillmentType === 'delivery';
      console.log(`   - FulfillmentType is delivery: ${isDelivery ? 'YES ✅' : `NO ❌ (got: ${order.fulfillmentType})`}`);

      // Verify items and complements
      for (const item of order.items) {
        console.log(`   - Item: ${item.snapshotName} x${item.quantity}`);
        if (item.complements && item.complements.length > 0) {
          for (const comp of item.complements) {
            console.log(`     • Complement: ${comp.snapshotName} (R$ ${comp.snapshotPrice})`);
          }
        } else {
          console.log('     • Complements: NONE');
          if (item.snapshotName.includes('Calabresa')) {
            console.error('   ❌ Pizza de Calabresa has NO complements! Expected required choice validation.');
            testFailed = true;
          }
        }
      }

      // Verify Timeline
      console.log(`   - Timeline entries: ${order.timeline.length}`);
      if (order.timeline.length === 0) {
        console.error('   ❌ Timeline is empty! Expected at least 1 entry.');
        testFailed = true;
      }
      for (const t of order.timeline) {
        console.log(`     • [${t.status}] ${t.note}`);
      }

      // Verify draft is cleared after order creation
      const session = await prisma.chatSession.findFirst({
        where: { tenantId: tenant.id, customerPhone: cleanPhone },
      });
      const rawMetadata = session?.metadata as Record<string, unknown> | null;
      const aiMetadata = (rawMetadata?.['ai'] as Record<string, unknown>) ?? {};
      const draftCleared = aiMetadata['orderDraft'] === undefined;
      console.log(`   - Temporary orderDraft is cleared: ${draftCleared ? 'YES ✅' : 'NO ❌ (draft still exists)'}`);
    }

    // Check last outbound sent message to ensure no technical leak
    if (sentMessages.length > 0) {
      const lastSentMessage = sentMessages[sentMessages.length - 1];
      const hasTechnicalDetails = /tool_outputs|tool_result|tool_call|json|{/i.test(lastSentMessage?.text ?? '');
      console.log(`\n   - Last AI response has technical leaks: ${hasTechnicalDetails ? 'YES ❌ (FAIL)' : 'NO ✅ (PASS)'}`);
      if (hasTechnicalDetails) {
        console.error('❌ E2E FAIL: Output sanitization failed! Technical details leaked to customer.');
        console.error(`   Last message: "${lastSentMessage?.text}"`);
        testFailed = true;
      }
    } else {
      console.warn('⚠️  No outbound messages captured — LLM may not have responded yet. Try increasing DEBOUNCE_WAIT_MS.');
    }

    if (testFailed) {
      console.error('\n💥 AI Agent E2E Order: FAIL');
      process.exit(1);
    } else {
      console.log('\n🎉 AI Agent E2E Order: PASS');
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    console.error('\n💥 E2E Test Crashed:', message);
    if (stack) console.error(stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

main();
