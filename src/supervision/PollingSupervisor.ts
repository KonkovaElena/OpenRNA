import type { NextflowWorkflowRunner } from "../adapters/NextflowWorkflowRunner";

export interface PollingSupervisorOptions {
  /** Polling interval in milliseconds. Default: 30_000 (30s). */
  intervalMs?: number;
  /** Optional callback for errors during polling. */
  onError?: (runId: string, error: unknown) => void;
  /** Optional callback when a run transitions to a terminal state. */
  onTransition?: (runId: string, newStatus: string) => void;
}

/**
 * Periodically polls all active Nextflow runs and applies state transitions.
 *
 * Designed to be started once during application bootstrap and stopped
 * on graceful shutdown. Each tick is isolated — a failing poll for one
 * run does not block others.
 */
export class PollingSupervisor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly onError: PollingSupervisorOptions["onError"];
  private readonly onTransition: PollingSupervisorOptions["onTransition"];

  constructor(
    private readonly runner: NextflowWorkflowRunner,
    options: PollingSupervisorOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? 30_000;
    this.onError = options.onError;
    this.onTransition = options.onTransition;
  }

  /** Start the polling loop. No-op if already started. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    // Don't keep the process alive just because the supervisor is running.
    if (typeof this.timer === "object" && "unref" in this.timer) {
      this.timer.unref();
    }
  }

  /** Stop the polling loop. Safe to call multiple times. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Run one polling cycle (public so tests can drive it synchronously). */
  async tick(): Promise<void> {
    const activeIds = this.runner.getActiveRunIds();
    await Promise.allSettled(
      activeIds.map(async (runId) => {
        try {
          const before = (await this.runner.getRun(runId)).status;
          const after = await this.runner.pollAndTransition(runId);
          if (after.status !== before && this.onTransition) {
            this.onTransition(runId, after.status);
          }
        } catch (err) {
          if (this.onError) this.onError(runId, err);
        }
      }),
    );
  }
}
