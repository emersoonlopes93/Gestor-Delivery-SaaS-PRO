import { Processor, Process } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { BILLING_AUTOMATION_QUEUE, BILLING_AUTOMATION_RUN_JOB } from './billing-automation.constants';
import { BillingRecurringAutomationService } from './billing-recurring-automation.service';

@Processor(BILLING_AUTOMATION_QUEUE)
export class BillingRecurringAutomationProcessor {
  constructor(private readonly automation: BillingRecurringAutomationService) {}

  @Process(BILLING_AUTOMATION_RUN_JOB)
  async process(job: Job<{ schemaVersion: 1 }>) {
    return this.automation.runBatch();
  }
}
