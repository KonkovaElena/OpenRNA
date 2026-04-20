import type { DerivedArtifactSemanticType, NextflowPollResult, NextflowTerminalMetadata, WorkflowFailureCategory, WorkflowRunRecord } from "../types";
import { nextflowExitCodeMapping } from "../types";
import type { IWorkflowRunner, WorkflowRunRequest } from "../ports/IWorkflowRunner";
import type { INextflowClient } from "../ports/INextflowClient";
import { ApiError } from "../errors";

interface TrackedRun {
  record: WorkflowRunRecord;
  sessionId: string;
  runName: string;
  launchDir: string;
  workDir: string;
}

/**
 * Nextflow-backed IWorkflowRunner.
 *
 * Delegates CLI/API calls to INextflowClient; maintains in-memory
 * run state (a Postgres-backed variant would store sessionId in the DB).
 */
export class NextflowWorkflowRunner implements IWorkflowRunner {
  private readonly runs = new Map<string, TrackedRun>();

  constructor(
    private readonly client: INextflowClient,
    private readonly launchDir: string = "/nf/launch",
    private readonly workDir: string = "/nf/work",
  ) {}

  async startRun(request: WorkflowRunRequest): Promise<WorkflowRunRecord> {
    const existing = this.runs.get(request.runId);
    if (existing) {
      if (
        existing.record.caseId !== request.caseId ||
        existing.record.requestId !== request.requestId ||
        existing.record.workflowName !== request.workflowName
      ) {
        throw new ApiError(409, "invalid_transition", "Replay mismatch", "Use the original metadata.");
      }
      if (existing.record.status === "RUNNING" || existing.record.status === "PENDING") {
        return structuredClone(existing.record);
      }
      throw new ApiError(409, "invalid_transition", "Terminal runs cannot be restarted.", "Create a new request.");
    }

    const now = new Date().toISOString();

    const result = await this.client.submit({
      workflowName: request.workflowName,
      revision: request.manifest?.workflowRevision ?? "main",
      configProfile: request.executionProfile,
      launchDir: this.launchDir,
      workDir: this.workDir,
      params: {},
    });

    const record: WorkflowRunRecord = {
      runId: request.runId,
      caseId: request.caseId,
      requestId: request.requestId,
      status: "RUNNING",
      workflowName: request.workflowName,
      referenceBundleId: request.referenceBundleId,
      executionProfile: request.executionProfile,
      acceptedAt: now,
      startedAt: now,
      ...(request.manifest ? { manifest: structuredClone(request.manifest) } : {}),
    };

    this.runs.set(request.runId, {
      record,
      sessionId: result.sessionId,
      runName: result.runName,
      launchDir: this.launchDir,
      workDir: this.workDir,
    });

    return structuredClone(record);
  }

  async getRun(runId: string): Promise<WorkflowRunRecord> {
    const tracked = this.runs.get(runId);
    if (!tracked) {
      throw new ApiError(404, "run_not_found", "Workflow run was not found.", "Use a valid runId.");
    }
    return structuredClone(tracked.record);
  }

  async cancelRun(runId: string): Promise<WorkflowRunRecord> {
    const tracked = this.runs.get(runId);
    if (!tracked) {
      throw new ApiError(404, "run_not_found", "Workflow run was not found.", "Use a valid runId.");
    }
    if (tracked.record.status === "CANCELLED") {
      return structuredClone(tracked.record);
    }
    if (tracked.record.status !== "RUNNING" && tracked.record.status !== "PENDING") {
      throw new ApiError(409, "invalid_transition", "Only running/pending runs can be cancelled.", "Check status first.");
    }

    await this.client.cancel(tracked.sessionId);

    tracked.record = {
      ...tracked.record,
      status: "CANCELLED",
      completedAt: new Date().toISOString(),
    };
    return structuredClone(tracked.record);
  }

  async listRunsByCaseId(caseId: string): Promise<WorkflowRunRecord[]> {
    return [...this.runs.values()]
      .filter((t) => t.record.caseId === caseId)
      .map((t) => structuredClone(t.record));
  }

  async completeRun(
    runId: string,
    _derivedArtifacts?: Array<{ semanticType: DerivedArtifactSemanticType; artifactHash: string; producingStep: string }>,
  ): Promise<WorkflowRunRecord> {
    const tracked = this.runs.get(runId);
    if (!tracked) {
      throw new ApiError(404, "run_not_found", "Workflow run was not found.", "Use a valid runId.");
    }
    if (tracked.record.status === "COMPLETED") {
      return structuredClone(tracked.record);
    }
    if (tracked.record.status !== "RUNNING") {
      throw new ApiError(409, "invalid_transition", "Only running workflows can be completed.", "Check status first.");
    }

    tracked.record = {
      ...tracked.record,
      status: "COMPLETED",
      completedAt: new Date().toISOString(),
    };
    return structuredClone(tracked.record);
  }

  async failRun(runId: string, reason: string, failureCategory?: WorkflowFailureCategory): Promise<WorkflowRunRecord> {
    const tracked = this.runs.get(runId);
    if (!tracked) {
      throw new ApiError(404, "run_not_found", "Workflow run was not found.", "Use a valid runId.");
    }
    if (tracked.record.status === "FAILED") {
      return structuredClone(tracked.record);
    }
    if (tracked.record.status !== "RUNNING" && tracked.record.status !== "PENDING") {
      throw new ApiError(409, "invalid_transition", "Only active runs can be failed.", "Check status first.");
    }

    tracked.record = {
      ...tracked.record,
      status: "FAILED",
      failureReason: reason,
      failureCategory: failureCategory ?? "unknown",
      completedAt: new Date().toISOString(),
    };
    return structuredClone(tracked.record);
  }

  // ─── Polling Integration ────────────────────────────────────────────

  /** Poll Nextflow for a run's current state and apply terminal transition. */
  async pollAndTransition(runId: string): Promise<WorkflowRunRecord> {
    const tracked = this.runs.get(runId);
    if (!tracked) {
      throw new ApiError(404, "run_not_found", "Workflow run was not found.", "Use a valid runId.");
    }
    if (tracked.record.status !== "RUNNING" && tracked.record.status !== "PENDING") {
      return structuredClone(tracked.record);
    }

    const poll = await this.client.poll(tracked.sessionId);
    return this.applyPollResult(tracked, poll);
  }

  /** Apply a poll result to update the tracked run. */
  applyPollResult(tracked: TrackedRun, poll: NextflowPollResult): WorkflowRunRecord {
    if (poll.state === "completed") {
      const metadata: NextflowTerminalMetadata = {
        durationMs: poll.durationMs ?? 0,
        executorVersion: "nextflow",
        nextflowSessionId: poll.sessionId,
        nextflowRunName: poll.runName,
        launchDir: tracked.launchDir,
        workDir: tracked.workDir,
        pipelineRevision: tracked.record.manifest?.workflowRevision ?? "unknown",
        traceUri: poll.traceUri,
        timelineUri: poll.timelineUri,
        reportUri: poll.reportUri,
      };
      tracked.record = {
        ...tracked.record,
        status: "COMPLETED",
        completedAt: new Date().toISOString(),
        terminalMetadata: metadata,
      };
    } else if (poll.state === "failed") {
      const category = mapExitCodeToCategory(poll.exitCode);
      const metadata: NextflowTerminalMetadata = {
        durationMs: poll.durationMs ?? 0,
        executorVersion: "nextflow",
        nextflowSessionId: poll.sessionId,
        nextflowRunName: poll.runName,
        launchDir: tracked.launchDir,
        workDir: tracked.workDir,
        pipelineRevision: tracked.record.manifest?.workflowRevision ?? "unknown",
        traceUri: poll.traceUri,
      };
      tracked.record = {
        ...tracked.record,
        status: "FAILED",
        failureReason: poll.errorMessage ?? `Nextflow exited with code ${poll.exitCode ?? "unknown"}`,
        failureCategory: category,
        completedAt: new Date().toISOString(),
        terminalMetadata: metadata,
      };
    } else if (poll.state === "cancelled") {
      tracked.record = {
        ...tracked.record,
        status: "CANCELLED",
        completedAt: new Date().toISOString(),
      };
    }
    // "running" / "submitted" / "unknown" → no state change

    return structuredClone(tracked.record);
  }

  /** Get the tracked runs that are still active (for polling supervisor). */
  getActiveRunIds(): string[] {
    return [...this.runs.entries()]
      .filter(([, t]) => t.record.status === "RUNNING" || t.record.status === "PENDING")
      .map(([id]) => id);
  }
}

export function mapExitCodeToCategory(exitCode?: number): WorkflowFailureCategory {
  if (exitCode === undefined || exitCode === null) return "unknown";
  return nextflowExitCodeMapping[exitCode] ?? "pipeline_error";
}
