import { randomUUID } from "node:crypto";
import { ApiError } from "./errors";
import type { IStateMachineGuard } from "./ports/IStateMachineGuard";
import type { IWorkflowDispatchSink } from "./ports/IWorkflowDispatchSink";
import type { AuditContextInput } from "./store-helpers";
import {
  auditEvent,
  cloneWorkflowRun,
  deriveCaseStatus,
  hasSameDerivedArtifactsForRun,
  hasSameRunReplayIdentity,
  normalizeAuditContext,
  timelineEvent,
} from "./store-helpers";
import type {
  CaseDomainEventInput,
  CaseDomainEventRecord,
  CaseRecord,
  CaseStatus,
  RequestWorkflowInput,
  WorkflowDispatchRecord,
  WorkflowRequestRecord,
  WorkflowRunRecord,
} from "./types";

type ClockLike = { nowIso(): string };

export interface WorkflowStoreMutationContext {
  clock: ClockLike;
  applyTransition: (record: CaseRecord, nextStatus: CaseStatus, correlationId?: AuditContextInput) => Promise<void>;
  createCaseEvent: (
    caseId: string,
    type: string,
    payload: unknown,
    correlationId: AuditContextInput,
    occurredAt?: string,
    updatedAt?: string,
  ) => CaseDomainEventInput;
  appendCaseEvent: (event: CaseDomainEventInput) => Promise<CaseDomainEventRecord>;
  workflowDispatchSink?: IWorkflowDispatchSink;
  stateMachineGuard?: IStateMachineGuard;
}

export async function requestWorkflowForCase(
  context: WorkflowStoreMutationContext,
  record: CaseRecord,
  input: RequestWorkflowInput,
  correlationId: AuditContextInput,
): Promise<CaseRecord> {
  const auditContext = normalizeAuditContext(correlationId);
  const requestedAt = context.clock.nowIso();

  if (input.idempotencyKey) {
    const existingRequest = record.workflowRequests.find(
      (workflowRequest) => workflowRequest.idempotencyKey === input.idempotencyKey,
    );
    if (existingRequest) {
      if (
        existingRequest.workflowName !== input.workflowName ||
        existingRequest.referenceBundleId !== input.referenceBundleId ||
        existingRequest.executionProfile !== input.executionProfile
      ) {
        throw new ApiError(
          409,
          "idempotency_mismatch",
          "Idempotency key was already used with a different payload.",
          "Use a new idempotency key for a different workflow request.",
        );
      }
      return record;
    }
  }

  if (record.status !== "READY_FOR_WORKFLOW") {
    throw new ApiError(
      409,
      "invalid_transition",
      "Case is not ready for workflow request.",
      "Complete consent and register tumor DNA, normal DNA, tumor RNA, and their source artifacts before requesting a workflow.",
    );
  }

  const workflowRequest: WorkflowRequestRecord = {
    requestId: `run_${randomUUID()}`,
    workflowName: input.workflowName,
    referenceBundleId: input.referenceBundleId,
    executionProfile: input.executionProfile,
    requestedBy: input.requestedBy,
    requestedAt,
    idempotencyKey: input.idempotencyKey,
    correlationId: auditContext.correlationId,
  };

  if (context.workflowDispatchSink) {
    const dispatchRecord: WorkflowDispatchRecord = {
      dispatchId: `dispatch_${randomUUID()}`,
      caseId: record.caseId,
      requestId: workflowRequest.requestId,
      workflowName: workflowRequest.workflowName,
      referenceBundleId: workflowRequest.referenceBundleId,
      executionProfile: workflowRequest.executionProfile,
      requestedBy: workflowRequest.requestedBy,
      requestedAt: workflowRequest.requestedAt,
      idempotencyKey: workflowRequest.idempotencyKey,
      correlationId: auditContext.correlationId,
      status: "PENDING",
    };
    await context.workflowDispatchSink.recordWorkflowRequested(dispatchRecord);
  }

  const nextStatus = deriveCaseStatus(record.caseProfile.consentStatus, record.samples, record.artifacts, true);
  record.workflowRequests.push(workflowRequest);

  await context.applyTransition(record, nextStatus, correlationId);
  record.timeline.push(
    timelineEvent(
      context.clock,
      "workflow_requested",
      `${input.workflowName} requested with reference bundle ${input.referenceBundleId}.`,
    ),
  );
  record.auditEvents.push(
    auditEvent(context.clock, "workflow.requested", `${input.workflowName} workflow was requested.`, correlationId),
  );
  record.updatedAt = requestedAt;
  await context.appendCaseEvent(
    context.createCaseEvent(
      record.caseId,
      "workflow.requested",
      { request: structuredClone(workflowRequest), nextStatus },
      correlationId,
      requestedAt,
      requestedAt,
    ),
  );

  return record;
}

export async function buildWorkflowStartedEventPayload(
  run: WorkflowRunRecord,
  nextStatus: CaseStatus,
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

export async function completeWorkflowRunForCase(
  context: WorkflowStoreMutationContext,
  record: CaseRecord,
  completedRun: WorkflowRunRecord,
  derivedArtifacts: import("./types").RunArtifact[],
  correlationId: AuditContextInput,
): Promise<CaseRecord> {
  const run = record.workflowRuns.find((candidate) => candidate.runId === completedRun.runId);
  if (!run) {
    throw new ApiError(404, "run_not_found", "Workflow run was not found on this case.", "Use a valid runId.");
  }
  if (completedRun.status !== "COMPLETED") {
    throw new ApiError(
      409,
      "invalid_transition",
      "Completed workflow run must be in COMPLETED status.",
      "Complete the workflow run before persisting terminal state.",
    );
  }

  if (run.status === "COMPLETED") {
    const existingDerivedArtifacts = record.derivedArtifacts.filter(
      (artifact) => artifact.runId === completedRun.runId,
    );
    if (!hasSameDerivedArtifactsForRun(existingDerivedArtifacts, derivedArtifacts ?? [])) {
      throw new ApiError(
        409,
        "invalid_transition",
        "Workflow completion replay emitted a different derived artifact set.",
        "Replay completion only with the original derived artifact payload.",
      );
    }
    return record;
  }

  if (run.status !== "RUNNING") {
    throw new ApiError(409, "invalid_transition", "Only running workflows can be completed.", "Check run status.");
  }

  const completedAt = completedRun.completedAt ?? context.clock.nowIso();
  Object.assign(run, cloneWorkflowRun({ ...completedRun, caseId: record.caseId, completedAt }));

  if (derivedArtifacts) {
    for (const artifact of derivedArtifacts) {
      record.derivedArtifacts.push(artifact);
    }
  }

  await context.applyTransition(record, "WORKFLOW_COMPLETED", correlationId);
  for (const artifact of derivedArtifacts ?? []) {
    record.auditEvents.push(
      auditEvent(
        context.clock,
        "artifact.derived",
        `Derived artifact ${artifact.semanticType} from run ${completedRun.runId}.`,
        correlationId,
        completedAt,
      ),
    );
  }
  record.timeline.push(
    timelineEvent(
      context.clock,
      "workflow_completed",
      `Run ${completedRun.runId} completed with ${(derivedArtifacts ?? []).length} derived artifacts.`,
      completedAt,
    ),
  );
  record.auditEvents.push(
    auditEvent(context.clock, "workflow.completed", `Run ${completedRun.runId} completed.`, correlationId, completedAt),
  );
  record.updatedAt = completedAt;
  await context.appendCaseEvent(
    context.createCaseEvent(
      record.caseId,
      "workflow.completed",
      {
        run: cloneWorkflowRun(run),
        derivedArtifacts: structuredClone(derivedArtifacts ?? []),
        nextStatus: record.status,
      },
      correlationId,
      completedAt,
      completedAt,
    ),
  );

  return record;
}

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
