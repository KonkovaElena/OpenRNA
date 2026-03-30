import type { NextflowPollResult } from "../types";

/**
 * Low-level client for interacting with Nextflow CLI / Tower API.
 * Adapters implement this; the NextflowWorkflowRunner delegates to it.
 */
export interface INextflowClient {
  /** Submit a pipeline run. Returns the Nextflow session ID and run name. */
  submit(params: NextflowSubmitParams): Promise<NextflowSubmitResult>;

  /** Poll the status of a submitted run. */
  poll(sessionId: string): Promise<NextflowPollResult>;

  /** Request cancellation of a running pipeline. */
  cancel(sessionId: string): Promise<void>;
}

export interface NextflowSubmitParams {
  workflowName: string;
  revision: string;
  configProfile: string;
  launchDir: string;
  workDir: string;
  params: Record<string, unknown>;
}

export interface NextflowSubmitResult {
  sessionId: string;
  runName: string;
}
