import type { DerivedArtifactSemanticType, WorkflowRunRecord } from "../types";
import type { IWorkflowRunner, WorkflowRunRequest } from "../ports/IWorkflowRunner";
import { ApiError } from "../errors";

export class InMemoryWorkflowRunner implements IWorkflowRunner {
  private readonly runs = new Map<string, WorkflowRunRecord>();

  async startRun(request: WorkflowRunRequest): Promise<WorkflowRunRecord> {
    const existingRun = this.runs.get(request.runId);
    if (existingRun) {
      if (
        existingRun.caseId !== request.caseId ||
        existingRun.requestId !== request.requestId ||
        existingRun.workflowName !== request.workflowName ||
        existingRun.referenceBundleId !== request.referenceBundleId ||
        existingRun.executionProfile !== request.executionProfile
      ) {
        throw new ApiError(
          409,
          "invalid_transition",
          "Workflow run replay payload does not match the existing run.",
          "Reuse the existing run only with the original workflow request metadata.",
        );
      }

      if (existingRun.status === "RUNNING" || existingRun.status === "PENDING") {
        return structuredClone(existingRun);
      }

      throw new ApiError(
        409,
        "invalid_transition",
        "Terminal workflow runs cannot be started again.",
        "Create a new workflow request instead of replaying start on a terminal run.",
      );
    }

    const now = new Date().toISOString();
    const run: WorkflowRunRecord = {
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
    this.runs.set(run.runId, run);
    return structuredClone(run);
  }

  async getRun(runId: string): Promise<WorkflowRunRecord> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new ApiError(404, "run_not_found", "Workflow run was not found.", "Use a valid runId.");
    }
    return structuredClone(run);
  }

  async cancelRun(runId: string): Promise<WorkflowRunRecord> {
    const run = await this.getRun(runId);
    if (run.status === "CANCELLED") {
      return structuredClone(run);
    }
    if (run.status !== "RUNNING" && run.status !== "PENDING") {
      throw new ApiError(409, "invalid_transition", "Only running or pending runs can be cancelled.", "Check run status first.");
    }
    const cancelledRun: WorkflowRunRecord = {
      ...run,
      status: "CANCELLED",
      completedAt: new Date().toISOString(),
    };
    this.runs.set(runId, cancelledRun);
    return structuredClone(cancelledRun);
  }

  async listRunsByCaseId(caseId: string): Promise<WorkflowRunRecord[]> {
    return [...this.runs.values()]
      .filter((r) => r.caseId === caseId)
      .map((run) => structuredClone(run));
  }

  async completeRun(
    runId: string,
    _derivedArtifacts?: Array<{ semanticType: DerivedArtifactSemanticType; artifactHash: string; producingStep: string }>,
  ): Promise<WorkflowRunRecord> {
    const run = await this.getRun(runId);
    if (run.status === "COMPLETED") {
      return structuredClone(run);
    }
    if (run.status !== "RUNNING") {
      throw new ApiError(409, "invalid_transition", "Only running workflows can be completed.", "Check run status first.");
    }
    const completedRun: WorkflowRunRecord = {
      ...run,
      status: "COMPLETED",
      completedAt: new Date().toISOString(),
    };
    this.runs.set(runId, completedRun);
    return structuredClone(completedRun);
  }

  async failRun(runId: string, reason: string, failureCategory?: import("../types").WorkflowFailureCategory): Promise<WorkflowRunRecord> {
    const run = await this.getRun(runId);
    const category = failureCategory ?? "unknown";
    if (run.status === "FAILED") {
      if ((run.failureReason ?? reason) !== reason) {
        throw new ApiError(
          409,
          "invalid_transition",
          "Workflow failure replay reason does not match the existing terminal failure.",
          "Replay failure only with the original failure reason.",
        );
      }

      return structuredClone(run);
    }
    if (run.status !== "RUNNING") {
      throw new ApiError(409, "invalid_transition", "Only running workflows can be failed.", "Check run status first.");
    }
    const failedRun: WorkflowRunRecord = {
      ...run,
      status: "FAILED",
      failureReason: reason,
      failureCategory: category,
      completedAt: new Date().toISOString(),
    };
    this.runs.set(runId, failedRun);
    return structuredClone(failedRun);
  }

  /** Test helper: seed a run directly. */
  seedRun(run: WorkflowRunRecord): void {
    this.runs.set(run.runId, run);
  }
}
