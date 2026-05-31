import 'reflect-metadata';
import { writeFileSync } from 'fs';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { ConversationService } from '../src/ai-agent/services/conversation.service';
import { OrdersController } from '../src/orders/orders.controller';
import { PrismaService } from '../src/database/prisma.service';
import { WhatsAppWebhookController } from '../src/whatsapp-channel/controllers/whatsapp-webhook.controller';
import { WhatsAppSenderService } from '../src/whatsapp-channel/services/whatsapp-sender.service';

type DraftSnapshot = Awaited<ReturnType<ConversationService['getSessionAiMemory']>>['orderDraft'];

interface StepSnapshot {
  step: number;
  inbound: string;
  toolCalls: Array<{ name: string; arguments: unknown }>;
  outbound: string[];
  draft: DraftSnapshot | null;
  logs: string[];
}

const MAIN_MESSAGES = [
  'Oi boa noite',
  'Quero 2 pizza de calabresa',
  'Sim',
  'Emerson Lopes',
  'Delivery',
  'Dinheiro',
  'Rua José Moraes de Aguiar, 1626',
  'Conjunto Mazzeo',
  'Mongaguá',
  'Pode ser',
  '100',
  'Isso',
];

const REQUIRED_LOGS = [
  '[AI_DRAFT] loaded',
  '[AI_DRAFT] item_added',
  '[AI_DRAFT] customer_name_set',
  '[AI_DRAFT] fulfillment_set delivery',
  '[AI_DRAFT] address_updated',
  '[AI_DRAFT] payment_set cash',
  '[AI_DRAFT] change_for_set',
  '[AI_DRAFT] missing_fields',
  '[AI_DRAFT] ready_to_confirm',
  '[AI_TIME] context_injected',
  '[AI_SCHEDULING] store_closed scheduling_offered',
  '[AI_ORDER] confirmation_requested',
  '[AI_ORDER] create_order_start',
  '[AI_ORDER] create_order_success',
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function installLogCapture() {
  const logs: string[] = [];
  const proto = Logger.prototype as Logger & {
    log: (message: unknown, context?: string) => void;
    warn: (message: unknown, context?: string) => void;
    error: (message: unknown, trace?: string, context?: string) => void;
  };

  const originalLog = proto.log;
  const originalWarn = proto.warn;
  const originalError = proto.error;

  proto.log = function patchedLog(message: unknown, context?: string) {
    logs.push(String(message));
    return originalLog.call(this, message, context);
  };
  proto.warn = function patchedWarn(message: unknown, context?: string) {
    logs.push(String(message));
    return originalWarn.call(this, message, context);
  };
  proto.error = function patchedError(message: unknown, trace?: string, context?: string) {
    logs.push(String(message));
    return originalError.call(this, message, trace, context);
  };

  return { logs };
}

function compactDraft(draft: DraftSnapshot | null) {
  if (!draft) return null;
  return {
    items: draft.items.map((item) => ({
      name: item.name ?? item.productName ?? item.productId,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    customerName: draft.customerName,
    customerPhone: draft.customerPhone,
    fulfillmentType: draft.fulfillmentType,
    deliveryAddress: draft.deliveryAddress,
    payment: draft.payment,
    subtotal: draft.subtotal,
    total: draft.total,
    scheduledFor: draft.scheduledFor,
    missingFields: draft.missingFields,
    readyToConfirm: draft.readyToConfirm,
  };
}

function getToolCalls(messages: Array<{ toolCalls: Prisma.JsonValue | null }>) {
  const calls: Array<{ name: string; arguments: unknown }> = [];
  for (const message of messages) {
    if (!Array.isArray(message.toolCalls)) continue;
    for (const raw of message.toolCalls) {
      if (!raw || typeof raw !== 'object') continue;
      const call = raw as Record<string, unknown>;
      calls.push({
        name: String(call.name ?? ''),
        arguments: call.arguments ?? {},
      });
    }
  }
  return calls.filter((call) => call.name);
}

async function configureTenant(prisma: PrismaService, tenantSlug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) {
    throw new Error(`Tenant '${tenantSlug}' não encontrado. Rode o seed ou informe E2E_TENANT_SLUG.`);
  }

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
  await prisma.tenantModuleAccess.upsert({
    where: { tenantId_module: { tenantId: tenant.id, module: 'orders' } },
    create: { tenantId: tenant.id, module: 'orders', enabled: true },
    update: { enabled: true },
  });

  await prisma.aiAgentConfig.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      useGlobalDefaults: false,
      isEnabled: true,
      agentName: 'Atendente Runtime',
      tone: 'amigável',
      greetingMessage: 'Olá! Como posso ajudar?',
      debounceMs: 300,
      simulateTyping: false,
      memoryEnabled: true,
      rememberCustomerName: true,
      rememberAddresses: true,
      rememberLastOrder: true,
    },
    update: {
      useGlobalDefaults: false,
      isEnabled: true,
      debounceMs: 300,
      simulateTyping: false,
      memoryEnabled: true,
      rememberCustomerName: true,
      rememberAddresses: true,
      rememberLastOrder: true,
    },
  });

  await prisma.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, isStorePaused: false },
    update: { isStorePaused: false },
  });

  const dayOfWeek = new Date().getDay();
  await prisma.tenantOperatingHours.upsert({
    where: { tenantId_dayOfWeek: { tenantId: tenant.id, dayOfWeek } },
    create: { tenantId: tenant.id, dayOfWeek, isOpen: true, openTime: '00:00', closeTime: '23:59' },
    update: { isOpen: true, openTime: '00:00', closeTime: '23:59' },
  });

  const category = await prisma.productCategory.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'e2e-pizzas-runtime' } },
    create: { tenantId: tenant.id, name: 'Pizzas Runtime', slug: 'e2e-pizzas-runtime', isActive: true, order: -100 },
    update: { isActive: true, deletedAt: null },
  });

  const existingPizza = await prisma.product.findFirst({
    where: {
      tenantId: tenant.id,
      name: 'Pizza de Calabresa',
      slug: { not: 'pizza-de-calabresa-runtime' },
      deletedAt: null,
      isActive: true,
      isAvailable: true,
      sellableOnline: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  let pizza = existingPizza;
  if (existingPizza) {
    await prisma.product.updateMany({
      where: { tenantId: tenant.id, slug: 'pizza-de-calabresa-runtime' },
      data: { isActive: false, isAvailable: false, sellableOnline: false },
    });
  } else {
    pizza = await prisma.product.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: 'pizza-de-calabresa-runtime' } },
      create: {
        tenantId: tenant.id,
        categoryId: category.id,
        name: 'Pizza de Calabresa',
        slug: 'pizza-de-calabresa-runtime',
        shortDescription: 'Pizza de calabresa para validação runtime do agente WhatsApp',
        basePrice: new Prisma.Decimal(49.9),
        isActive: true,
        isAvailable: true,
        sellableOnline: true,
        order: -100,
      },
      update: {
        categoryId: category.id,
        name: 'Pizza de Calabresa',
        shortDescription: 'Pizza de calabresa para validação runtime do agente WhatsApp',
        basePrice: new Prisma.Decimal(49.9),
        isActive: true,
        isAvailable: true,
        sellableOnline: true,
        deletedAt: null,
        order: -100,
      },
    });
  }

  if (!pizza) {
    throw new Error('Não foi possível preparar Pizza de Calabresa para o teste.');
  }

  const e2eComplementGroups = await prisma.productComplementGroup.findMany({
    where: { tenantId: tenant.id, name: { contains: 'E2E Test' } },
    select: { id: true },
  });
  for (const group of e2eComplementGroups) {
    await prisma.productComplementGroupLink.deleteMany({ where: { complementGroupId: group.id } });
    await prisma.productComplementItem.deleteMany({ where: { groupId: group.id } });
    await prisma.productComplementGroup.delete({ where: { id: group.id } });
  }

  await prisma.whatsAppInstance.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      instanceName: 'runtime-e2e-instance',
      evolutionInstanceId: 'runtime-e2e-instance',
      providerType: 'evolution_go',
      status: 'connected',
      apiUrl: 'http://localhost:8000',
      apiKey: 'mock-key',
    },
    update: {
      evolutionInstanceId: 'runtime-e2e-instance',
      status: 'connected',
      webhookSecret: null,
    },
  });

  return { tenant, pizza };
}

async function cleanupPhone(prisma: PrismaService, tenantId: string, phone: string) {
  const cleanPhone = phone.replace(/\D/g, '');
  const sessions = await prisma.chatSession.findMany({ where: { tenantId, customerPhone: cleanPhone } });
  for (const session of sessions) {
    await prisma.chatMessage.deleteMany({ where: { sessionId: session.id } });
  }
  await prisma.chatSession.deleteMany({ where: { tenantId, customerPhone: cleanPhone } });
  await prisma.order.deleteMany({ where: { tenantId, customerPhone: cleanPhone } });
}

function buildWebhookPayload(text: string, phone: string, pushName = 'Emerson') {
  const id = `RUNTIME-E2E-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    event: 'message',
    instanceId: 'runtime-e2e-instance',
    data: {
      Info: {
        Chat: `${phone}@s.whatsapp.net`,
        Sender: `${phone}@s.whatsapp.net`,
        ID: id,
        PushName: pushName,
        IsFromMe: false,
      },
      Message: { conversation: text },
    },
  };
}

async function findSession(prisma: PrismaService, tenantId: string, phone: string) {
  return prisma.chatSession.findFirst({
    where: { tenantId, customerPhone: phone.replace(/\D/g, '') },
    orderBy: { updatedAt: 'desc' },
  });
}

async function snapshotStep(input: {
  prisma: PrismaService;
  conversation: ConversationService;
  tenantId: string;
  phone: string;
  step: number;
  inbound: string;
  messageCursor: Date;
  outboundCursor: number;
  logs: string[];
  logCursor: number;
  sentMessages: Array<{ to: string; text: string }>;
}): Promise<StepSnapshot> {
  const session = await findSession(input.prisma, input.tenantId, input.phone);
  const messages = session
    ? await input.prisma.chatMessage.findMany({
        where: {
          sessionId: session.id,
          messageType: 'tool_call',
          createdAt: { gt: input.messageCursor },
        },
        orderBy: { createdAt: 'asc' },
        select: { toolCalls: true },
      })
    : [];
  const draft = session ? (await input.conversation.getSessionAiMemory(session.id)).orderDraft : null;

  return {
    step: input.step,
    inbound: input.inbound,
    toolCalls: getToolCalls(messages),
    outbound: input.sentMessages.slice(input.outboundCursor).map((m) => m.text),
    draft,
    logs: input.logs.slice(input.logCursor),
  };
}

async function sendAndCapture(input: {
  webhook: WhatsAppWebhookController;
  prisma: PrismaService;
  conversation: ConversationService;
  tenantId: string;
  phone: string;
  text: string;
  step: number;
  logs: string[];
  sentMessages: Array<{ to: string; text: string }>;
  waitMs: number;
}) {
  const messageCursor = new Date();
  const outboundCursor = input.sentMessages.length;
  const logCursor = input.logs.length;

  await input.webhook.handleWebhook(buildWebhookPayload(input.text, input.phone));
  await sleep(input.waitMs);

  return snapshotStep({
    prisma: input.prisma,
    conversation: input.conversation,
    tenantId: input.tenantId,
    phone: input.phone,
    step: input.step,
    inbound: input.text,
    messageCursor,
    outboundCursor,
    logs: input.logs,
    logCursor,
    sentMessages: input.sentMessages,
  });
}

function containsAll(text: string, needles: string[]) {
  return needles.every((needle) => text.toLowerCase().includes(needle.toLowerCase()));
}

async function main() {
  const { logs } = installLogCapture();
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const webhook = app.get(WhatsAppWebhookController);
  const sender = app.get(WhatsAppSenderService);
  const conversation = app.get(ConversationService);
  const ordersController = app.get(OrdersController);
  const sentMessages: Array<{ to: string; text: string }> = [];

  sender.sendText = async (_tenantId, input) => {
    const text = input.text ?? '';
    sentMessages.push({ to: input.to, text });
    console.log(`[MOCK_SENDER] ${input.to}: ${text.replace(/\s+/g, ' ').slice(0, 500)}`);
    return { success: true, messageId: `runtime-${Date.now()}` };
  };
  sender.sendPresence = async () => undefined;

  try {
    const tenantSlug = process.env.E2E_TENANT_SLUG ?? 'pizzaria-demo';
    const { tenant, pizza } = await configureTenant(prisma, tenantSlug);
    const phone = '5513999991626';
    await cleanupPhone(prisma, tenant.id, phone);

    console.log(`\n[RUNTIME] tenant=${tenant.name} slug=${tenant.slug}`);
    console.log(`[RUNTIME] product=${pizza.name} id=${pizza.id} price=${pizza.basePrice}`);

    const snapshots: StepSnapshot[] = [];
    const waitMs = Number(process.env.E2E_TURN_WAIT_MS ?? 15000);
    for (let i = 0; i < MAIN_MESSAGES.length; i += 1) {
      const snapshot = await sendAndCapture({
        webhook,
        prisma,
        conversation,
        tenantId: tenant.id,
        phone,
        text: MAIN_MESSAGES[i],
        step: i + 1,
        logs,
        sentMessages,
        waitMs,
      });
      snapshots.push(snapshot);
      console.log(`[DRAFT_AFTER_STEP_${snapshot.step}] ${JSON.stringify(compactDraft(snapshot.draft))}`);
      console.log(`[TOOLS_AFTER_STEP_${snapshot.step}] ${snapshot.toolCalls.map((t) => t.name).join(',') || 'none'}`);
    }

    await sleep(Number(process.env.E2E_FINAL_WAIT_MS ?? 25000));

    const cleanPhone = phone.replace(/\D/g, '');
    const order = await prisma.order.findFirst({
      where: { tenantId: tenant.id, customerPhone: cleanPhone },
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        deliveryAddress: true,
        timeline: true,
      },
    });

    const req = { user: { tenantId: tenant.id } } as never;
    const ordersList = await ordersController.listOrders(req, 1, 20, undefined, undefined, undefined, undefined);
    const board = await ordersController.getBoardOrders(req, undefined);
    const orderInList = Boolean(order && ordersList.items.some((item) => item.id === order.id));
    const orderInBoard = Boolean(order && board.some((item) => item.id === order.id));

    const allToolCalls = snapshots.flatMap((s) => s.toolCalls);
    const finalDraftBeforeClear = [...snapshots].reverse().find((s) => s.draft?.readyToConfirm)?.draft ?? snapshots.at(-1)?.draft ?? null;
    const draftAfterItem = snapshots.find((s) => s.draft?.items?.length)?.draft ?? null;
    const missingCounts = snapshots.map((s) => s.draft?.missingFields?.length ?? null);
    const itemAskedAgain = sentMessages
      .slice(2)
      .some((m) => /qual|quais|itens|pedido/i.test(m.text) && /item|pizza|sabor|produto/i.test(m.text));

    await cleanupPhone(prisma, tenant.id, '5513999991627');
    const dayOfWeek = new Date().getDay();
    await prisma.tenantOperatingHours.update({
      where: { tenantId_dayOfWeek: { tenantId: tenant.id, dayOfWeek } },
      data: { isOpen: false, openTime: '10:00', closeTime: '11:00' },
    });

    const closedStartLog = logs.length;
    const closedOutboundStart = sentMessages.length;
    const closedGreeting = await sendAndCapture({
      webhook,
      prisma,
      conversation,
      tenantId: tenant.id,
      phone: '5513999991627',
      text: 'Oi boa noite',
      step: 1,
      logs,
      sentMessages,
      waitMs,
    });
    const closedSchedule = await sendAndCapture({
      webhook,
      prisma,
      conversation,
      tenantId: tenant.id,
      phone: '5513999991627',
      text: 'Quero agendar para amanhã',
      step: 2,
      logs,
      sentMessages,
      waitMs,
    });

    await prisma.tenantOperatingHours.update({
      where: { tenantId_dayOfWeek: { tenantId: tenant.id, dayOfWeek } },
      data: { isOpen: true, openTime: '00:00', closeTime: '23:59' },
    });

    const closedOutbound = sentMessages.slice(closedOutboundStart).map((m) => m.text).join('\n');
    const closedLogs = logs.slice(closedStartLog);
    const scheduleToolCall = [...closedGreeting.toolCalls, ...closedSchedule.toolCalls].find((t) => t.name === 'consultar_slots_agendamento');

    const allLogs = logs.join('\n');
    const checks = {
      adicionarItemChamado: allToolCalls.some((t) => t.name === 'adicionar_item_pedido'),
      draftItemSalvo: Boolean(
        draftAfterItem?.items?.[0] &&
          containsAll(draftAfterItem.items[0].name ?? draftAfterItem.items[0].productName ?? '', ['Pizza', 'Calabresa']) &&
          draftAfterItem.items[0].quantity === 2,
      ),
      fulfillmentDeliveryChamado: allToolCalls.some((t) => t.name === 'definir_entrega_retirada' && (t.arguments as { tipo?: string }).tipo === 'delivery'),
      deliveryNaoVirouPickup: snapshots.every((s) => s.draft?.fulfillmentType !== 'pickup'),
      nomeSalvo: snapshots.some((s) => s.draft?.customerName === 'Emerson Lopes'),
      enderecoSalvo: snapshots.some((s) =>
        s.draft?.deliveryAddress.street?.includes('José Moraes de Aguiar') &&
        s.draft.deliveryAddress.number === '1626' &&
        s.draft.deliveryAddress.neighborhood?.toLowerCase().includes('mazzeo') &&
        s.draft.deliveryAddress.city?.toLowerCase().includes('mongagu'),
      ),
      pagamentoDinheiro: snapshots.some((s) => s.draft?.payment.method === 'cash'),
      troco100: snapshots.some((s) => s.draft?.payment.changeFor === 100),
      currentDraftInjetado: snapshots.filter((s) => s.logs.some((l) => l.includes('[AI_DRAFT] loaded'))).length >= 2,
      missingFieldsDiminuiu: missingCounts.some((count) => count !== null && count > 0) && snapshots.some((s) => s.draft?.missingFields.length === 0),
      resumoFinalQuandoCompleto: Boolean(finalDraftBeforeClear?.readyToConfirm),
      naoPediuItensNovamente: !itemAskedAgain,
      lojaFechadaAvisada: closedLogs.some((l) => l.includes('[AI_SCHEDULING] store_closed scheduling_offered')) &&
        /fechad|agend/i.test(closedOutbound),
      dataHoraTimezone: allLogs.includes('[AI_TIME] context_injected') && allLogs.includes('tz=America/Sao_Paulo'),
      agendamentoSemAlucinacao: !scheduleToolCall || Boolean((scheduleToolCall.arguments as { data?: string }).data),
      criacaoPedido: Boolean(order),
      pedidoGetOrders: orderInList,
      pedidoBoard: orderInBoard,
      listaPedidos: orderInList,
      kanban: orderInBoard,
      requiredLogs: REQUIRED_LOGS.filter((needle) => allLogs.includes(needle)),
      missingRequiredLogs: REQUIRED_LOGS.filter((needle) => !allLogs.includes(needle)),
    };

    const result = {
      mainConversation: snapshots.map((s) => ({
        step: s.step,
        inbound: s.inbound,
        toolCalls: s.toolCalls,
        outbound: s.outbound,
        draft: compactDraft(s.draft),
        aiLogs: s.logs.filter((l) => l.includes('[AI_')),
      })),
      order: order
        ? {
            id: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
            sourceChannel: order.sourceChannel,
            fulfillmentType: order.fulfillmentType,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            paymentMethod: order.paymentMethod,
            changeFor: order.changeFor ? Number(order.changeFor) : null,
            total: Number(order.total),
            items: order.items.map((item) => ({
              name: item.snapshotName,
              quantity: item.quantity,
              productId: item.productId,
            })),
            address: order.deliveryAddress,
            timelineCount: order.timeline.length,
          }
        : null,
      managerVisibility: {
        getOrders: orderInList,
        operationBoard: orderInBoard,
        listaPedidos: orderInList,
        kanban: orderInBoard,
      },
      closedStoreSchedulingProbe: {
        outbound: sentMessages.slice(closedOutboundStart).map((m) => m.text),
        logs: closedLogs.filter((l) => l.includes('[AI_')),
        slotToolCall: scheduleToolCall ?? null,
      },
      checks,
    };
    const reportPath = 'runtime-ai-whatsapp-validation-report.json';
    writeFileSync(reportPath, JSON.stringify(result, null, 2));

    console.log('\n=== RUNTIME_VALIDATION_SUMMARY ===');
    console.log(JSON.stringify({
      reportPath,
      order: result.order,
      managerVisibility: result.managerVisibility,
      checks,
      stepSummary: result.mainConversation.map((s) => ({
        step: s.step,
        inbound: s.inbound,
        toolCalls: s.toolCalls.map((tool) => tool.name),
        outbound: s.outbound.map((text) => text.replace(/\s+/g, ' ').slice(0, 180)),
        draft: s.draft,
      })),
      closedStoreSchedulingProbe: {
        outbound: result.closedStoreSchedulingProbe.outbound.map((text) => text.replace(/\s+/g, ' ').slice(0, 180)),
        slotToolCall: result.closedStoreSchedulingProbe.slotToolCall,
      },
    }, null, 2));

    const failed = Object.entries(checks)
      .filter(([key, value]) => key !== 'requiredLogs' && key !== 'missingRequiredLogs')
      .filter(([, value]) => value !== true);

    if (failed.length > 0 || checks.missingRequiredLogs.length > 0) {
      console.error(`\n[RUNTIME] FAIL checks=${failed.map(([key]) => key).join(',') || 'none'} missingLogs=${checks.missingRequiredLogs.join(',') || 'none'}`);
      process.exitCode = 1;
    } else {
      console.log('\n[RUNTIME] PASS');
    }
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

main().catch((error) => {
  console.error('[RUNTIME] CRASH', error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
