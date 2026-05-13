import { randomUUID } from "node:crypto";
import { ApiError } from "./errors";
import type { IWorkflowDispatchSink } from "./ports/IWorkflowDispatchSink";
import type { AuditContextInput } from "./store-helpers";
import { auditEvent, deriveCaseStatus, normalizeAuditContext, timelineEvent } from "./store-helpers";
import type {
  CaseDomainEventInput,
  CaseDomainEventRecord,
  CaseRecord,
  CaseStatus,
  RequestWorkflowInput,
  WorkflowDispatchRecord,
  WorkflowRequestRecord,
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
