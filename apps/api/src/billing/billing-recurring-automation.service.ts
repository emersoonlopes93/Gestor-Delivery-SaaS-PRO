import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { BillingCycleStatus, BillingGatewayMode, InvoiceStatus, PaymentAttemptStatus, PaymentProvider } from '@prisma/client';
import type { Queue } from 'bullmq';
import { PrismaService } from '../database/prisma.service';
import { BillingCycleService } from './billing-cycle.service';
import { BillingPaymentAttemptService } from './billing-payment-attempt.service';
import { BillingPaymentGatewayService } from './billing-payment-gateway.service';
import {
  BILLING_AUTOMATION_QUEUE,
  BILLING_AUTOMATION_RUN_JOB,
  billingAutomationBatchLimit,
  billingAutomationCadenceMs,
  isBillingAutomationEnabled,
} from './billing-automation.constants';

export type BillingAutomationOutcome = 'processed' | 'skipped' | 'blocked' | 'retryable_error' | 'requires_manual_reconciliation';
export type BillingAutomationResult = { cycleId: string; tenantId: string; outcome: BillingAutomationOutcome; reason: string };
export type BillingAutomationBatchResult = { dryRun: boolean; inspected: number; results: BillingAutomationResult[] };

@Injectable()
export class BillingRecurringAutomationService implements OnModuleInit {
  private readonly logger = new Logger(BillingRecurringAutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cycleService: BillingCycleService,
    private readonly attempts: BillingPaymentAttemptService,
    private readonly gateway: BillingPaymentGatewayService,
    @Optional() @InjectQueue(BILLING_AUTOMATION_QUEUE) private readonly queue?: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.canRun() || !this.queue) return;
    await this.queue.add(BILLING_AUTOMATION_RUN_JOB, { schemaVersion: 1 }, {
      jobId: BILLING_AUTOMATION_RUN_JOB,
      repeat: { every: billingAutomationCadenceMs() },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    });
    this.logger.log({ message: 'billing_automation_scheduler_registered', jobId: BILLING_AUTOMATION_RUN_JOB });
  }

  async runBatch(input: { now?: Date; limit?: number; dryRun?: boolean } = {}): Promise<BillingAutomationBatchResult> {
    const now = input.now ?? new Date();
    const limit = input.limit ?? billingAutomationBatchLimit();
    const dryRun = input.dryRun === true;
    if (!this.canRun()) {
      return { dryRun, inspected: 0, results: [{ cycleId: '', tenantId: '', outcome: 'blocked', reason: 'automation_disabled_or_unsafe_environment' }] };
    }

    const cycles = await this.prisma.billingCycleRecord.findMany({
      where: {
        endedAt: { not: null, lte: now },
        status: { in: [BillingCycleStatus.open, BillingCycleStatus.closed] },
        subscription: { status: 'active' },
      },
      include: { subscription: true },
      orderBy: [{ endedAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    const results: BillingAutomationResult[] = [];
    for (const cycle of cycles) results.push(await this.processCycle(cycle, now, dryRun));
    return { dryRun, inspected: cycles.length, results };
  }

  private async processCycle(
    cycle: { id: string; tenantId: string; endedAt: Date | null; status: BillingCycleStatus; subscription: { id: string; billingPlanId: string; status: string } },
    now: Date,
    dryRun: boolean,
  ): Promise<BillingAutomationResult> {
    if (!cycle.endedAt || cycle.endedAt > now || cycle.subscription.status !== 'active') {
      return { cycleId: cycle.id, tenantId: cycle.tenantId, outcome: 'skipped', reason: 'ineligible_cycle_or_subscription' };
    }
    const existingInvoice = await this.prisma.invoice.findFirst({
      where: { tenantId: cycle.tenantId, subscriptionId: cycle.subscription.id, cycleId: cycle.id },
      select: { id: true, status: true },
    });
    const terminalInvoiceStatuses: InvoiceStatus[] = [InvoiceStatus.paid, InvoiceStatus.void, InvoiceStatus.failed];
    if (existingInvoice && terminalInvoiceStatuses.includes(existingInvoice.status)) {
      return { cycleId: cycle.id, tenantId: cycle.tenantId, outcome: 'skipped', reason: `invoice_${existingInvoice.status}` };
    }
    if (dryRun) return { cycleId: cycle.id, tenantId: cycle.tenantId, outcome: 'processed', reason: 'eligible_no_writes' };

    try {
      const closed = await this.cycleService.closeCycleAndCreateDraftInvoice({
        tenantId: cycle.tenantId,
        subscriptionId: cycle.subscription.id,
        cycleId: cycle.id,
        planId: cycle.subscription.billingPlanId,
      });
      const runtime = this.gateway.getRuntimeConfig();
      if (runtime.gatewayStatus !== 'sandbox_ready' || runtime.mode !== BillingGatewayMode.sandbox) {
        return { cycleId: cycle.id, tenantId: cycle.tenantId, outcome: 'processed', reason: 'invoice_draft_created_no_automatic_external_attempt' };
      }
      const uncertain = await this.prisma.paymentAttempt.findFirst({
        where: { invoiceId: closed.invoice.id, status: PaymentAttemptStatus.processing },
        select: { id: true },
      });
      if (uncertain) return { cycleId: cycle.id, tenantId: cycle.tenantId, outcome: 'requires_manual_reconciliation', reason: 'existing_processing_attempt' };
      await this.attempts.createAttemptForInvoice({
        invoiceId: closed.invoice.id,
        tenantId: cycle.tenantId,
        provider: runtime.provider as PaymentProvider,
        mode: BillingGatewayMode.sandbox,
        idempotencyKey: `billing-recurring:${cycle.id}:${runtime.provider}:sandbox`,
      });
      return { cycleId: cycle.id, tenantId: cycle.tenantId, outcome: 'processed', reason: 'invoice_and_sandbox_attempt_processed' };
    } catch (error: unknown) {
      this.logger.warn({ message: 'billing_automation_cycle_failed', cycleId: cycle.id, tenantId: cycle.tenantId, reason: error instanceof Error ? error.message.slice(0, 200) : 'unknown' });
      return { cycleId: cycle.id, tenantId: cycle.tenantId, outcome: 'retryable_error', reason: 'cycle_processing_failed' };
    }
  }

  private canRun(): boolean {
    if (!isBillingAutomationEnabled()) return false;
    const runtime = this.gateway.getRuntimeConfig();
    return runtime.paymentsEnabled && ['manual_ready', 'sandbox_ready'].includes(runtime.gatewayStatus);
  }
}
