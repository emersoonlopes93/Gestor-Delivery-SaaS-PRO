import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppSenderService } from '../../whatsapp-channel/services/whatsapp-sender.service';

type ReminderStep = '30m' | '2h' | '24h';

const REMINDER_MINUTES: Record<ReminderStep, number> = {
  '30m': 30,
  '2h': 120,
  '24h': 1440,
};

@Injectable()
export class AbandonedCartService {
  private readonly logger = new Logger('AbandonedCartService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappSender: WhatsAppSenderService,
  ) {}

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

    const phones = sessions.map((session) => session.customerPhone).filter(Boolean);
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
          optedOut: optedOutPhones.has(session.customerPhone),
        };
      })
      .filter((cart): cart is NonNullable<typeof cart> => Boolean(cart && !cart.optedOut));
  }

  async dispatchDueReminders(tenantId: string, limit = 20) {
    const dueCarts = (await this.getDueCarts(tenantId)).slice(0, limit);
    const results: Array<{ sessionId: string; step: ReminderStep; sent: boolean; error?: string }> = [];

    for (const cart of dueCarts) {
      const message = this.messageForStep(cart.step);
      const metric = await this.createDispatchMetric(tenantId, cart.phone, cart.customerId, `Carrinho abandonado ${cart.step}`, message);
      try {
        const antiSpam = await this.checkAntiSpam(tenantId, cart.phone, metric?.dispatchId);
        if (!antiSpam.allowed) {
          if (metric) {
            await this.prisma.$transaction([
              this.prisma.campaignDispatch.update({
                where: { id: metric.dispatchId },
                data: { status: antiSpam.reason === 'opt-out' ? 'opt_out' : 'failed', failReason: antiSpam.reason },
              }),
              this.prisma.campaign.update({
                where: { id: metric.campaignId },
                data: {
                  status: 'completed',
                  completedAt: new Date(),
                  ...(antiSpam.reason === 'opt-out' ? { totalOptOut: { increment: 1 } } : {}),
                },
              }),
            ]);
          }
          results.push({ sessionId: cart.sessionId, step: cart.step, sent: false, error: antiSpam.reason });
          continue;
        }

        await this.whatsappSender.sendText(tenantId, { to: cart.phone, text: message });
        if (metric) {
          await this.prisma.$transaction([
            this.prisma.campaignDispatch.update({
              where: { id: metric.dispatchId },
              data: { status: 'sent', sentAt: new Date() },
            }),
            this.prisma.campaign.update({
              where: { id: metric.campaignId },
              data: { status: 'completed', completedAt: new Date(), totalSent: { increment: 1 } },
            }),
          ]);
        }
        await this.markReminderSent(cart.sessionId, cart.step);
        results.push({ sessionId: cart.sessionId, step: cart.step, sent: true });
      } catch (error) {
        const messageError = error instanceof Error ? error.message : 'unknown_error';
        if (metric) {
          await this.prisma.campaignDispatch.update({
            where: { id: metric.dispatchId },
            data: { status: 'failed', failReason: messageError },
          });
          await this.prisma.campaign.update({
            where: { id: metric.campaignId },
            data: { status: 'completed', completedAt: new Date() },
          });
        }
        this.logger.warn(`abandoned_cart_reminder_failed tenantId=${tenantId} sessionId=${cart.sessionId} error=${messageError}`);
        results.push({ sessionId: cart.sessionId, step: cart.step, sent: false, error: messageError });
      }
    }

    if (results.length) {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userType: 'system',
          action: 'abandoned_cart_reminders_dispatched',
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

  private async createDispatchMetric(
    tenantId: string,
    phone: string,
    customerId: string | null,
    name: string,
    messageTemplate: string,
  ): Promise<{ campaignId: string; dispatchId: string } | null> {
    const customer = customerId
      ? await this.prisma.customer.findFirst({ where: { id: customerId, tenantId }, select: { id: true } })
      : await this.prisma.customer.findFirst({ where: { tenantId, phone }, select: { id: true } });

    if (!customer) return null;

    const campaign = await this.prisma.campaign.create({
      data: {
        tenantId,
        name,
        objective: 'abandoned_cart',
        status: 'running',
        messageTemplate,
        segmentRules: { specificCustomers: [customer.id], source: 'abandoned_cart' } as Prisma.JsonObject,
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
        status: 'processing',
      },
    });

    return { campaignId: campaign.id, dispatchId: dispatch.id };
  }

  private async checkAntiSpam(tenantId: string, phone: string, dispatchId?: string) {
    const optOut = await this.prisma.customerOptOut.findUnique({ where: { tenantId_phone: { tenantId, phone } } });
    if (optOut) return { allowed: false, reason: 'opt-out' };

    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { automationCooldownHours: true, automationMaxMessagesPerDay: true },
    });
    const cooldownHours = settings?.automationCooldownHours ?? 24;
    const maxPerDay = settings?.automationMaxMessagesPerDay ?? 1;
    const cooldownSince = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
    const daySince = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const baseWhere: Prisma.CampaignDispatchWhereInput = {
      ...(dispatchId ? { id: { not: dispatchId } } : {}),
      phone,
      status: { in: ['sent', 'delivered', 'read', 'replied'] },
      campaign: { tenantId },
    };

    const [recentSent, sentToday] = await Promise.all([
      this.prisma.campaignDispatch.findFirst({
        where: { ...baseWhere, sentAt: { gte: cooldownSince } },
        select: { id: true },
      }),
      this.prisma.campaignDispatch.count({
        where: { ...baseWhere, sentAt: { gte: daySince } },
      }),
    ]);

    if (recentSent) return { allowed: false, reason: `cooldown_${cooldownHours}h` };
    if (sentToday >= maxPerDay) return { allowed: false, reason: `max_frequency_${maxPerDay}_per_day` };
    return { allowed: true };
  }
}
