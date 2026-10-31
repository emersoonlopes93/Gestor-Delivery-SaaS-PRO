import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { normalizeMarketingPhone } from '../../common/utils/marketing-opt-out.util';

type ReminderStep = '30m' | '2h' | '24h';

const REMINDER_MINUTES: Record<ReminderStep, number> = {
  '30m': 30,
  '2h': 120,
  '24h': 1440,
};

@Injectable()
export class AbandonedCartService {
  private readonly logger = new Logger('AbandonedCartService');

  constructor(private readonly prisma: PrismaService) {}

  async getDueCarts(tenantId: string) {
    const sessions = await this.prisma.chatSession.findMany({
      where: {
        tenantId,
        closedAt: null,
        cartData: { not: Prisma.JsonNull },
        state: { in: ['building_cart', 'collecting_address', 'awaiting_confirmation'] },
      },
      orderBy: { lastMessageAt: 'asc' },
      take: 100,
    });

    const phones = sessions.map((session) => normalizeMarketingPhone(session.customerPhone)).filter(Boolean);
    const optOuts = phones.length
      ? await this.prisma.customerOptOut.findMany({
          where: { tenantId, phone: { in: phones } },
          select: { phone: true },
        })
      : [];
    const optedOutPhones = new Set(optOuts.map((optOut) => optOut.phone));

    return sessions
      .map((session) => {
        const step = this.nextReminderStep(session.lastMessageAt, session.metadata);
        if (!step) return null;
        return {
          sessionId: session.id,
          customerId: session.customerId,
          phone: session.customerPhone,
          displayName: session.displayName,
          lastMessageAt: session.lastMessageAt,
          step,
          minutesInactive: Math.floor((Date.now() - session.lastMessageAt.getTime()) / 60_000),
          optedOut: optedOutPhones.has(normalizeMarketingPhone(session.customerPhone)),
        };
      })
      .filter((cart): cart is NonNullable<typeof cart> => Boolean(cart && !cart.optedOut));
  }

  async dispatchDueReminders(tenantId: string, limit = 20) {
    const dueCarts = (await this.getDueCarts(tenantId)).slice(0, limit);
    const results: Array<{ sessionId: string; step: ReminderStep; queued: boolean; error?: string }> = [];

    for (const cart of dueCarts) {
      const message = this.messageForStep(cart.step);
      try {
        const metric = await this.createDispatchMetric(
          tenantId,
          cart.phone,
          cart.customerId,
          `Carrinho abandonado ${cart.step}`,
          message,
          cart.sessionId,
          cart.step,
        );
        if (metric) {
          // Marca no chat_session que já foi criado para não recriar no proximo loop
          await this.markReminderSent(cart.sessionId, cart.step);
          results.push({ sessionId: cart.sessionId, step: cart.step, queued: true });
        } else {
          results.push({ sessionId: cart.sessionId, step: cart.step, queued: false, error: 'Customer not found' });
        }
      } catch (error) {
        const messageError = error instanceof Error ? error.message : 'unknown_error';
        this.logger.warn(`abandoned_cart_reminder_failed tenantId=${tenantId} sessionId=${cart.sessionId} error=${messageError}`);
        results.push({ sessionId: cart.sessionId, step: cart.step, queued: false, error: messageError });
      }
    }

    if (results.length) {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userType: 'system',
          action: 'abandoned_cart_reminders_queued',
          resource: 'chat_session',
          details: { results } as Prisma.JsonObject,
        },
      });
    }

    return { processed: results.length, results };
  }

  private nextReminderStep(lastMessageAt: Date, metadata: Prisma.JsonValue | null): ReminderStep | null {
    const minutesInactive = Math.floor((Date.now() - lastMessageAt.getTime()) / 60_000);
    const sent = this.getSentSteps(metadata);
    const orderedSteps: ReminderStep[] = ['30m', '2h', '24h'];
    return orderedSteps.find((step) => minutesInactive >= REMINDER_MINUTES[step] && !sent.has(step)) ?? null;
  }

  private getSentSteps(metadata: Prisma.JsonValue | null): Set<ReminderStep> {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return new Set();
    const raw = (metadata as { abandonedCartReminders?: unknown }).abandonedCartReminders;
    if (!Array.isArray(raw)) return new Set();
    return new Set(raw.filter((step): step is ReminderStep => step === '30m' || step === '2h' || step === '24h'));
  }

  private async markReminderSent(sessionId: string, step: ReminderStep) {
    const session = await this.prisma.chatSession.findUnique({ where: { id: sessionId }, select: { metadata: true } });
    const base =
      session?.metadata && typeof session.metadata === 'object' && !Array.isArray(session.metadata)
        ? (session.metadata as Prisma.JsonObject)
        : {};
    const sent = Array.from(this.getSentSteps(session?.metadata ?? null));
    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        metadata: {
          ...base,
          abandonedCartReminders: Array.from(new Set([...sent, step])),
          abandonedCartLastReminderAt: new Date().toISOString(),
        },
      },
    });
  }

  private messageForStep(step: ReminderStep) {
    if (step === '30m') return 'Seu pedido ainda esta no carrinho. Posso te ajudar a finalizar?';
    if (step === '2h') return 'Seu carrinho ficou salvo por aqui. Quer concluir agora?';
    return 'Ultimo lembrete: seu carrinho ainda pode virar pedido hoje. Quer retomar?';
  }

  /**
   * Cria (ou recupera idempotente) o par Campaign/CampaignDispatch para um lembrete de carrinho.
   *
   * Idempotência: antes de criar, verifica se já existe uma campanha para a mesma
   * combinação tenantId + sessionId + step (gravada em segmentRules). Se existir,
   * retorna os IDs do registro existente sem criar duplicata — tornando a operação
   * segura mesmo que o processo reinicie entre a criação e o markReminderSent.
   */
  private async createDispatchMetric(
    tenantId: string,
    phone: string,
    customerId: string | null,
    name: string,
    messageTemplate: string,
    sessionId: string,
    step: ReminderStep,
  ): Promise<{ campaignId: string; dispatchId: string } | null> {
    const customer = customerId
      ? await this.prisma.customer.findFirst({ where: { id: customerId, tenantId }, select: { id: true } })
      : await this.prisma.customer.findFirst({ where: { tenantId, phone }, select: { id: true } });

    if (!customer) return null;

    // Idempotência: verificar se já existe campanha para essa sessão e step
    const existingCampaign = await this.prisma.campaign.findFirst({
      where: {
        tenantId,
        objective: 'abandoned_cart',
        name,
        segmentRules: {
          path: ['sessionId'],
          equals: sessionId,
        },
      },
      include: {
        dispatches: { select: { id: true }, take: 1 },
      },
    });

    if (existingCampaign) {
      const existingDispatch = existingCampaign.dispatches[0];
      if (existingDispatch) {
        this.logger.log(
          `abandoned_cart_idempotent sessionId=${sessionId} step=${step} campaignId=${existingCampaign.id} — reutilizando dispatch existente`,
        );
        return { campaignId: existingCampaign.id, dispatchId: existingDispatch.id };
      }
    }

    const campaign = await this.prisma.campaign.create({
      data: {
        tenantId,
        name,
        objective: 'abandoned_cart',
        status: 'processing',
        messageTemplate,
        // sessionId e step gravados em segmentRules para permitir lookup idempotente
        segmentRules: {
          specificCustomers: [customer.id],
          source: 'abandoned_cart',
          sessionId,
          step,
        } as Prisma.JsonObject,
        totalAudience: 1,
        maxDispatches: 1,
        startedAt: new Date(),
      },
    });

    const dispatch = await this.prisma.campaignDispatch.create({
      data: {
        campaignId: campaign.id,
        customerId: customer.id,
        phone,
        status: 'queued',
        idempotencyKey: `campaign:${campaign.id}:dispatch:${randomUUID()}`,
      },
    });

    return { campaignId: campaign.id, dispatchId: dispatch.id };
  }
}
