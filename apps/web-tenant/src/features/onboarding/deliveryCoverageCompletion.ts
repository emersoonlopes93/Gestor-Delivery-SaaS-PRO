export type DeliveryCoverageCompletionStatus = 'saving' | 'saved' | 'error';

export interface DeliveryCoverageCompletionDependencies {
  markStep: () => Promise<void>;
  revalidate: () => Promise<void>;
  advance: () => void;
  onStatus: (status: DeliveryCoverageCompletionStatus) => void;
}

/**
 * Keeps the delivery coverage completion flow resumable. A retry continues at
 * the first phase that did not complete, so a persisted coverage is never PUT
 * again merely because marking or revalidation failed.
 */
export class DeliveryCoverageCompletion {
  private persistCompleted = false;
  private markCompleted = false;
  private inFlight: Promise<boolean> | null = null;

  constructor(private readonly dependencies: DeliveryCoverageCompletionDependencies) {}

  submit(persist: () => Promise<void>): Promise<boolean> {
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.run(persist).finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  private async run(persist: () => Promise<void>): Promise<boolean> {
    this.dependencies.onStatus('saving');

    try {
      if (!this.persistCompleted) {
        await persist();
        this.persistCompleted = true;
      }

      if (!this.markCompleted) {
        await this.dependencies.markStep();
        this.markCompleted = true;
      }

      await this.dependencies.revalidate();
      this.dependencies.advance();
      this.dependencies.onStatus('saved');
      return true;
    } catch {
      this.dependencies.onStatus('error');
      return false;
    }
  }
}
