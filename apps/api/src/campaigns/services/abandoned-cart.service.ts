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
      try {
        await this.whatsappSender.sendText(tenantId, { to: cart.phone, text: message });
        await this.markReminderSent(cart.sessionId, cart.step);
        results.push({ sessionId: cart.sessionId, step: cart.step, sent: true });
      } catch (error) {
        const messageError = error instanceof Error ? error.message : 'unknown_error';
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
}
