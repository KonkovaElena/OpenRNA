import { ApiError } from "./errors";
import type { AuditContextInput } from "./store-helpers";
import { auditEvent, cloneWorkflowRun, timelineEvent } from "./store-helpers";
import type { WorkflowStoreMutationContext } from "./store-request-workflow";
import type { CaseRecord, WorkflowRunRecord } from "./types";

export async function failWorkflowRunForCase(
  context: WorkflowStoreMutationContext,
  record: CaseRecord,
  failedRun: WorkflowRunRecord,
  correlationId: AuditContextInput,
): Promise<CaseRecord> {
  const run = record.workflowRuns.find((candidate) => candidate.runId === failedRun.runId);
  if (!run) {
    throw new ApiError(404, "run_not_found", "Workflow run was not found on this case.", "Use a valid runId.");
  }
  if (failedRun.status !== "FAILED") {
    throw new ApiError(
      409,
      "invalid_transition",
      "Failed workflow run must be in FAILED status.",
      "Fail the workflow run before persisting terminal state.",
    );
  }

  if (run.status === "FAILED") {
    if ((run.failureReason ?? failedRun.failureReason ?? "") !== (failedRun.failureReason ?? "")) {
      throw new ApiError(
        409,
        "invalid_transition",
        "Workflow failure replay reason does not match the persisted terminal failure.",
        "Replay failure only with the original failure reason.",
      );
    }
    if ((run.failureCategory ?? failedRun.failureCategory ?? "unknown") !== (failedRun.failureCategory ?? "unknown")) {
      throw new ApiError(
        409,
        "invalid_transition",
        "Workflow failure replay category does not match the persisted terminal failure.",
        "Replay failure only with the original failure category.",
      );
    }
    return record;
  }

  if (run.status !== "RUNNING") {
    throw new ApiError(409, "invalid_transition", "Only running workflows can be failed.", "Check run status.");
  }

  const completedAt = failedRun.completedAt ?? context.clock.nowIso();
  Object.assign(run, cloneWorkflowRun({ ...failedRun, caseId: record.caseId, completedAt }));

  await context.applyTransition(record, "WORKFLOW_FAILED", correlationId);
  record.timeline.push(
    timelineEvent(
      context.clock,
      "workflow_failed",
      `Run ${failedRun.runId} failed: ${failedRun.failureReason ?? "unknown failure"}`,
      completedAt,
    ),
  );
  record.auditEvents.push(
    auditEvent(
      context.clock,
      "workflow.failed",
      `Run ${failedRun.runId} failed: ${failedRun.failureReason ?? "unknown failure"}`,
      correlationId,
      completedAt,
    ),
  );
  record.updatedAt = completedAt;
  await context.appendCaseEvent(
    context.createCaseEvent(
      record.caseId,
      "workflow.failed",
      { run: cloneWorkflowRun(run), nextStatus: record.status },
      correlationId,
      completedAt,
      completedAt,
    ),
  );

  return record;
}
