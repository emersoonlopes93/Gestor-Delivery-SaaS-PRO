import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { BILLING_AUTOMATION_QUEUE, BILLING_AUTOMATION_RUN_JOB } from './billing-automation.constants';
import { BillingRecurringAutomationService } from './billing-recurring-automation.service';

@Processor(BILLING_AUTOMATION_QUEUE)
export class BillingRecurringAutomationProcessor extends WorkerHost {
  constructor(private readonly automation: BillingRecurringAutomationService) {
    super();
  }

  async process(job: Job<{ schemaVersion: 1 }>): Promise<unknown> {
    if (job.name !== BILLING_AUTOMATION_RUN_JOB || job.data?.schemaVersion !== 1) {
      return { ignored: true, reason: 'unsupported_billing_automation_job' };
    }
    return this.automation.runBatch();
  }
}
