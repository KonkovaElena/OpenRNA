import { randomUUID } from "node:crypto";
import type { WorkflowRunRecord } from "../types";
import type { IWorkflowRunner, WorkflowRunRequest } from "../ports/IWorkflowRunner";
import { ApiError } from "../errors";

export class InMemoryWorkflowRunner implements IWorkflowRunner {
  private readonly runs = new Map<string, WorkflowRunRecord>();

  async startRun(request: WorkflowRunRequest): Promise<WorkflowRunRecord> {
    const runId = `run_${randomUUID()}`;
    const run: WorkflowRunRecord = {
      runId,
      caseId: request.caseId,
      requestId: request.requestId,
      status: "RUNNING",
      workflowName: request.workflowName,
      referenceBundleId: request.referenceBundleId,
      executionProfile: request.executionProfile,
      startedAt: new Date().toISOString(),
    };
    this.runs.set(runId, run);
    return run;
  }

  async getRun(runId: string): Promise<WorkflowRunRecord> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new ApiError(404, "run_not_found", "Workflow run was not found.", "Use a valid runId.");
    }
    return run;
  }

  async cancelRun(runId: string): Promise<WorkflowRunRecord> {
    const run = await this.getRun(runId);
    if (run.status !== "RUNNING" && run.status !== "PENDING") {
      throw new ApiError(409, "invalid_transition", "Only running or pending runs can be cancelled.", "Check run status first.");
    }
    run.status = "CANCELLED";
    run.completedAt = new Date().toISOString();
    return run;
  }

  async listRunsByCaseId(caseId: string): Promise<WorkflowRunRecord[]> {
    return [...this.runs.values()].filter((r) => r.caseId === caseId);
  }

  async completeRun(
    runId: string,
    _derivedArtifacts?: Array<{ semanticType: string; artifactHash: string; producingStep: string }>,
  ): Promise<WorkflowRunRecord> {
    const run = await this.getRun(runId);
    if (run.status !== "RUNNING") {
      throw new ApiError(409, "invalid_transition", "Only running workflows can be completed.", "Check run status first.");
    }
    run.status = "COMPLETED";
    run.completedAt = new Date().toISOString();
    return run;
  }

  async failRun(runId: string, reason: string): Promise<WorkflowRunRecord> {
    const run = await this.getRun(runId);
    if (run.status !== "RUNNING") {
      throw new ApiError(409, "invalid_transition", "Only running workflows can be failed.", "Check run status first.");
    }
    run.status = "FAILED";
    run.failureReason = reason;
    run.completedAt = new Date().toISOString();
    return run;
  }

  /** Test helper: seed a run directly. */
  seedRun(run: WorkflowRunRecord): void {
    this.runs.set(run.runId, run);
  }
}
