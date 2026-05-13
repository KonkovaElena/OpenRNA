import { ApiError } from "./errors";
import type { AuditContextInput } from "./store-helpers";
import { auditEvent, cloneWorkflowRun, normalizeAuditContext, timelineEvent } from "./store-helpers";
import type { WorkflowStoreMutationContext } from "./store-request-workflow";
import type { CaseRecord, WorkflowRunRecord } from "./types";

export async function cancelWorkflowRunForCase(
  context: WorkflowStoreMutationContext,
  record: CaseRecord,
  cancelledRun: WorkflowRunRecord,
  correlationId: AuditContextInput,
): Promise<CaseRecord> {
  const run = record.workflowRuns.find((candidate) => candidate.runId === cancelledRun.runId);
  if (!run) {
    throw new ApiError(404, "run_not_found", "Workflow run was not found on this case.", "Use a valid runId.");
  }
  if (cancelledRun.status !== "CANCELLED") {
    throw new ApiError(
      409,
      "invalid_transition",
      "Cancelled workflow run must be in CANCELLED status.",
      "Cancel the workflow run before persisting terminal state.",
    );
  }

  if (run.status === "CANCELLED") {
    return record;
  }

  if (run.status !== "RUNNING" && run.status !== "PENDING") {
    throw new ApiError(
      409,
      "invalid_transition",
      "Only running or pending workflows can be cancelled.",
      "Check run status.",
    );
  }

  const completedAt = cancelledRun.completedAt ?? context.clock.nowIso();
  Object.assign(run, cloneWorkflowRun({ ...cancelledRun, caseId: record.caseId, completedAt }));

  await context.applyTransition(record, "WORKFLOW_CANCELLED", correlationId);
  record.timeline.push(
    timelineEvent(context.clock, "workflow_cancelled", `Run ${cancelledRun.runId} was cancelled.`, completedAt),
  );
  record.auditEvents.push(
    auditEvent(
      context.clock,
      "workflow.cancelled",
      `Workflow run ${cancelledRun.runId} was cancelled.`,
      correlationId,
      completedAt,
    ),
  );
  record.updatedAt = completedAt;
  await context.appendCaseEvent(
    context.createCaseEvent(
      record.caseId,
      "workflow.cancelled",
      { run: cloneWorkflowRun(run), nextStatus: record.status },
      correlationId,
      completedAt,
      completedAt,
    ),
  );

  return record;
}
