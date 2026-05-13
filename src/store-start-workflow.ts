import { ApiError } from "./errors";
import type { AuditContextInput } from "./store-helpers";
import { auditEvent, cloneWorkflowRun, hasSameRunReplayIdentity, timelineEvent } from "./store-helpers";
import type { WorkflowStoreMutationContext } from "./store-request-workflow";
import type { CaseRecord, WorkflowRunRecord } from "./types";

export async function buildWorkflowStartedEventPayload(
  run: WorkflowRunRecord,
  nextStatus: CaseRecord["status"],
): Promise<unknown> {
  return { run: cloneWorkflowRun(run), nextStatus };
}

export async function startWorkflowRunForCase(
  context: WorkflowStoreMutationContext,
  record: CaseRecord,
  startedRun: WorkflowRunRecord,
  correlationId: AuditContextInput,
): Promise<CaseRecord> {
  const request = record.workflowRequests[record.workflowRequests.length - 1];
  if (!request) {
    throw new ApiError(
      409,
      "invalid_transition",
      "Case must have a workflow request before starting a run.",
      "Request a workflow before starting a run.",
    );
  }
  if (startedRun.caseId !== record.caseId) {
    throw new ApiError(
      409,
      "invalid_transition",
      "Workflow run caseId does not match the target case.",
      "Use a run created for this case.",
    );
  }
  if (startedRun.status !== "RUNNING") {
    throw new ApiError(
      409,
      "invalid_transition",
      "Started workflow run must be in RUNNING status.",
      "Start the workflow run before persisting it.",
    );
  }

  const existingRun = record.workflowRuns.find((candidate) => candidate.runId === startedRun.runId);
  if (existingRun) {
    if (!hasSameRunReplayIdentity(existingRun, startedRun)) {
      throw new ApiError(
        409,
        "invalid_transition",
        "Workflow run replay payload does not match the persisted run.",
        "Replay start only with the original run identity fields.",
      );
    }
    if (existingRun.status === "RUNNING") {
      return record;
    }
    throw new ApiError(
      409,
      "invalid_transition",
      "Terminal workflow runs cannot be started again.",
      "Create a new workflow request instead of replaying start on a terminal run.",
    );
  }

  if (record.status !== "WORKFLOW_REQUESTED") {
    throw new ApiError(
      409,
      "invalid_transition",
      "Case must be in WORKFLOW_REQUESTED status to start a run.",
      "Request a workflow before starting a run.",
    );
  }

  const nowIso = context.clock.nowIso();
  const run = cloneWorkflowRun({
    ...startedRun,
    requestId: startedRun.requestId || request.requestId,
    workflowName: startedRun.workflowName || request.workflowName,
    referenceBundleId: startedRun.referenceBundleId || request.referenceBundleId,
    executionProfile: startedRun.executionProfile || request.executionProfile,
    acceptedAt: startedRun.acceptedAt ?? nowIso,
    startedAt: startedRun.startedAt ?? nowIso,
  });
  const startedAt = run.startedAt ?? nowIso;
  run.startedAt = startedAt;
  record.workflowRuns.push(run);

  await context.applyTransition(record, "WORKFLOW_RUNNING", correlationId);
  record.timeline.push(
    timelineEvent(context.clock, "workflow_started", `Workflow run ${run.runId} started.`, startedAt),
  );
  record.auditEvents.push(
    auditEvent(context.clock, "workflow.started", `Workflow run ${run.runId} started.`, correlationId, startedAt),
  );
  record.updatedAt = startedAt;
  await context.appendCaseEvent(
    context.createCaseEvent(
      record.caseId,
      "workflow.started",
      { run: cloneWorkflowRun(run), nextStatus: record.status },
      correlationId,
      startedAt,
      startedAt,
    ),
  );

  return record;
}
