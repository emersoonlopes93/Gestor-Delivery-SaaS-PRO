import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppSenderService } from '../../whatsapp-channel/services/whatsapp-sender.service';
import { normalizeMarketingPhone } from '../../common/utils/marketing-opt-out.util';
import { applyCampaignTemplate } from '../utils/campaign-template.util';
import { CampaignAutomationService } from './campaign-automation.service';
import { CampaignDispatcherService } from './campaign-dispatcher.service';

const TERMINAL = ['sent', 'delivered', 'read', 'replied', 'opt_out', 'failed', 'cancelled'] as const;
export interface CampaignJobData { campaignId?: string; dispatchId?: string; tenantId?: string; customerId?: string; phone?: string; customerName?: string; messageTemplate?: string; mediaUrl?: string | null; mediaType?: string | null; isStatus?: boolean; isSystemJob?: boolean; }
class RetryableCampaignError extends Error {}

@Processor('campaign-dispatch')
export class CampaignProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignProcessor.name);
  constructor(private readonly prisma: PrismaService, private readonly whatsappSender: WhatsAppSenderService, private readonly dispatcher: CampaignDispatcherService, private readonly automation: CampaignAutomationService) { super(); }

  async process(job: Job<CampaignJobData, { success: boolean; messageId?: string; skipped?: boolean; reason?: string }, string>) {
    if (job.name === 'system-feed-queue') { await this.dispatcher.feedQueue(); return { success: true }; }
    if (job.name === 'system-automation-scan') { await this.automation.runAllTenants(); return { success: true }; }
    const data = job.data;
    if (!data.campaignId || !data.tenantId) throw new Error('Invalid campaign job tenant scope.');
    if (data.isStatus) return this.processStatus(data);
    if (!data.dispatchId || !data.customerId || !data.phone || !data.customerName || !data.messageTemplate) throw new Error('Invalid dispatch job data.');
    return this.processDispatch(data);
  }

  private async processStatus(data: CampaignJobData) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id: data.campaignId, tenantId: data.tenantId }, select: { status: true, tenant: { select: { name: true, slug: true } } } });
    if (!campaign || campaign.status !== 'processing') return { success: true, skipped: true, reason: 'not_processing' };
    const result = await this.whatsappSender.publishStatus(data.tenantId!, { text: applyCampaignTemplate(data.messageTemplate ?? '', { nome: campaign.tenant.name.split(' ')[0], nome_loja: campaign.tenant.name, link_cardapio: `https://${campaign.tenant.slug}.gestordelivery.com` }), mediaUrl: data.mediaUrl ?? undefined, mediaType: data.mediaType ?? undefined });
    if (!result.success) { await this.prisma.campaign.updateMany({ where: { id: data.campaignId, tenantId: data.tenantId, status: 'processing' }, data: { status: 'failed' } }); throw new RetryableCampaignError(result.error ?? 'Status provider rejected delivery.'); }
    await this.prisma.campaign.updateMany({ where: { id: data.campaignId, tenantId: data.tenantId, status: 'processing' }, data: { status: 'completed', completedAt: new Date() } });
    return { success: true, messageId: result.messageId };
  }

  private async processDispatch(data: CampaignJobData) {
    const dispatch = await this.prisma.campaignDispatch.findFirst({ where: { id: data.dispatchId, campaignId: data.campaignId, customerId: data.customerId, campaign: { tenantId: data.tenantId } }, select: { phone: true, status: true, idempotencyKey: true, attemptCount: true, campaign: { select: { status: true } } } });
    if (!dispatch) throw new Error('Invalid tenant-scoped campaign dispatch.');
    if (TERMINAL.includes(dispatch.status as typeof TERMINAL[number])) return { success: true, skipped: true, reason: 'terminal' };
    if (dispatch.campaign.status === 'cancelled') { await this.prisma.campaignDispatch.updateMany({ where: { id: data.dispatchId, status: { in: ['queued', 'processing'] } }, data: { status: 'cancelled', failReason: 'Campaign cancelled before delivery.' } }); return { success: true, skipped: true, reason: 'cancelled' }; }
    if (dispatch.campaign.status !== 'processing') return { success: true, skipped: true, reason: 'not_processing' };
    if (dispatch.status === 'processing' && dispatch.attemptCount > 0 && !(await this.whatsappSender.supportsIdempotencyKey(data.tenantId))) {
      await this.prisma.campaignDispatch.update({ where: { id: data.dispatchId }, data: { status: 'unknown', reconciliationRequired: true, failReason: 'Provider has no idempotency contract; automatic resend blocked.' } });
      await this.dispatcher.finalizeCampaign(data.campaignId, data.tenantId);
      return { success: true, skipped: true, reason: 'reconciliation_required' };
    }
    if (normalizeMarketingPhone(dispatch.phone) !== normalizeMarketingPhone(data.phone)) throw new Error('Campaign dispatch phone mismatch.');
    if (dispatch.status === 'sending') { await this.prisma.campaignDispatch.update({ where: { id: data.dispatchId }, data: { status: 'unknown', reconciliationRequired: true, failReason: 'Provider outcome unknown; automatic resend blocked.' } }); await this.dispatcher.finalizeCampaign(data.campaignId, data.tenantId); return { success: true, skipped: true, reason: 'reconciliation_required' }; }
    const claimed = await this.prisma.campaignDispatch.updateMany({ where: { id: data.dispatchId, status: { in: ['queued', 'processing'] }, campaign: { tenantId: data.tenantId, status: 'processing' } }, data: { status: 'sending', attemptCount: { increment: 1 }, failReason: null } });
    if (claimed.count === 0) return { success: true, skipped: true, reason: 'already_claimed' };
    const optOut = await this.prisma.customerOptOut.findUnique({ where: { tenantId_phone: { tenantId: data.tenantId, phone: normalizeMarketingPhone(dispatch.phone) } } });
    if (optOut) { await this.prisma.campaignDispatch.update({ where: { id: data.dispatchId }, data: { status: 'opt_out', failReason: 'Opt-out: customer requested no marketing.' } }); await this.prisma.campaign.update({ where: { id: data.campaignId }, data: { totalOptOut: { increment: 1 } } }); await this.dispatcher.finalizeCampaign(data.campaignId, data.tenantId); return { success: true, skipped: true, reason: 'opt-out' }; }
    const next = await this.nextAllowedAttempt(data.tenantId);
    if (next) { await this.prisma.campaignDispatch.update({ where: { id: data.dispatchId }, data: { status: 'queued', nextAttemptAt: next } }); await this.dispatcher.rescheduleDispatch(data, next); return { success: true, skipped: true, reason: 'quiet_hours' }; }
    const current = await this.prisma.campaign.findFirst({ where: { id: data.campaignId, tenantId: data.tenantId }, select: { status: true } });
    if (current?.status === 'cancelled') { await this.prisma.campaignDispatch.update({ where: { id: data.dispatchId }, data: { status: 'cancelled', failReason: 'Campaign cancelled before provider call.' } }); return { success: true, skipped: true, reason: 'cancelled' }; }
    try {
      const result = data.mediaUrl ? await this.whatsappSender.sendMedia(data.tenantId, { to: dispatch.phone, type: this.mediaType(data.mediaType), url: data.mediaUrl, caption: applyCampaignTemplate(data.messageTemplate, { nome: data.customerName.split(' ')[0] || 'cliente' }), idempotencyKey: dispatch.idempotencyKey }) : await this.whatsappSender.sendText(data.tenantId, { to: dispatch.phone, text: applyCampaignTemplate(data.messageTemplate, { nome: data.customerName.split(' ')[0] || 'cliente' }), idempotencyKey: dispatch.idempotencyKey });
      if (!result.success) { const retryable = result.retryable === true; await this.prisma.campaignDispatch.update({ where: { id: data.dispatchId }, data: retryable ? { status: 'processing', failReason: result.error ?? 'Retryable provider failure.' } : { status: 'failed', failReason: result.error ?? 'Provider rejected delivery.' } }); if (retryable) throw new RetryableCampaignError(result.error ?? 'Retryable provider failure.'); await this.dispatcher.finalizeCampaign(data.campaignId, data.tenantId); return { success: false, reason: 'provider_terminal_failure' }; }
      await this.prisma.campaignDispatch.update({ where: { id: data.dispatchId }, data: { status: 'sent', sentAt: new Date(), providerAcceptedAt: new Date(), externalId: result.messageId, reconciliationRequired: false } });
      await this.prisma.campaign.update({ where: { id: data.campaignId }, data: { totalSent: { increment: 1 } } });
      await this.dispatcher.finalizeCampaign(data.campaignId, data.tenantId);
      return { success: true, messageId: result.messageId };
    } catch (error: unknown) {
      if (error instanceof RetryableCampaignError) throw error;
      await this.prisma.campaignDispatch.updateMany({ where: { id: data.dispatchId, status: 'sending' }, data: { status: 'processing', failReason: error instanceof Error ? error.message : 'Network error.' } });
      throw new RetryableCampaignError(error instanceof Error ? error.message : 'Network error.');
    }
  }

  private async nextAllowedAttempt(tenantId: string): Promise<Date | null> { const settings = await this.prisma.tenantSettings.findUnique({ where: { tenantId }, select: { timezone: true } }); const timezone = settings?.timezone?.trim() || 'America/Sao_Paulo'; const now = new Date(); if (this.hour(timezone, now) >= 8 && this.hour(timezone, now) < 21) return null; for (let minute = 1; minute <= 1440; minute += 1) { const candidate = new Date(now.getTime() + minute * 60000); const hour = this.hour(timezone, candidate); if (hour >= 8 && hour < 21) return candidate; } throw new Error('Unable to determine next campaign window.'); }
  private hour(timezone: string, instant: Date): number { const value = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hour12: false }).format(instant); const hour = Number.parseInt(value, 10); return hour === 24 ? 0 : hour; }
  private mediaType(value?: string | null): 'image' | 'video' | 'audio' | 'document' { return value === 'video' || value === 'audio' || value === 'document' ? value : 'image'; }
  @OnWorkerEvent('failed') onFailed(job: Job, error: Error) { this.logger.error(`Job ${job.id} failed: ${error.message}`); }
}
