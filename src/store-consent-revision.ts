import { ApiError } from "./errors";
import type { AuditContextInput } from "./store-helpers";
import { auditEvent, deriveCaseStatus, timelineEvent } from "./store-helpers";
import type { CaseDomainEventInput, CaseDomainEventType, CaseRecord, CaseStatus, ConsentStatus } from "./types";

type ClockLike = { nowIso(): string };

export interface ConsentRevisionStoreMutationContext {
  clock: ClockLike;
  applyTransition: (record: CaseRecord, nextStatus: CaseStatus, correlationId?: AuditContextInput) => Promise<void>;
  createCaseEvent: (
    caseId: string,
    type: CaseDomainEventType,
    payload: unknown,
    correlationId: AuditContextInput,
    occurredAt?: string,
    updatedAt?: string,
  ) => CaseDomainEventInput;
  appendCaseEvent: (event: CaseDomainEventInput) => Promise<CaseDomainEventInput>;
}

export async function syncConsentStatusForCase(
  context: ConsentRevisionStoreMutationContext,
  record: CaseRecord,
  caseId: string,
  consentStatus: ConsentStatus,
  correlationId: AuditContextInput,
): Promise<{ record: CaseRecord; nextStatus: CaseStatus }> {
  if (record.status === "CONSENT_WITHDRAWN" && consentStatus !== "withdrawn") {
    throw new ApiError(
      409,
      "new_case_required_after_consent_withdrawal",
      "Renewed consent cannot reopen a terminal consent-withdrawn case.",
      "Create a new case linked to the renewed consent record rather than mutating the withdrawn case.",
    );
  }

  record.caseProfile = { ...record.caseProfile, consentStatus };
  const nextStatus = deriveCaseStatus(
    consentStatus,
    record.samples,
    record.artifacts,
    record.workflowRequests.length > 0,
  );
  await context.applyTransition(record, nextStatus, correlationId);
  record.timeline.push(
    timelineEvent(context.clock, "consent_updated", `Consent status synchronized to '${consentStatus}'.`),
  );
  record.auditEvents.push(
    auditEvent(context.clock, "consent.updated", `Consent status changed to '${consentStatus}'.`, correlationId),
  );
  record.updatedAt = context.clock.nowIso();
  await context.appendCaseEvent(
    context.createCaseEvent(caseId, "consent.updated", { consentStatus, nextStatus }, correlationId),
  );

  return { record, nextStatus };
}

export async function restartFromRevisionForCase(
  context: ConsentRevisionStoreMutationContext,
  record: CaseRecord,
  caseId: string,
  correlationId: AuditContextInput,
): Promise<CaseRecord> {
  if (record.status !== "REVISION_REQUESTED") {
    throw new ApiError(
      409,
      "invalid_transition",
      `restartFromRevision requires REVISION_REQUESTED status, current: ${record.status}.`,
      "Only cases in REVISION_REQUESTED status can be restarted.",
    );
  }
  await context.applyTransition(record, "READY_FOR_WORKFLOW", correlationId);
  record.timeline.push(
    timelineEvent(context.clock, "revision_restarted", "Case restarted from board revision for a new workflow cycle."),
  );
  record.auditEvents.push(
    auditEvent(context.clock, "revision.restarted", "Pipeline restarted after board revision request.", correlationId),
  );
  record.updatedAt = context.clock.nowIso();
  await context.appendCaseEvent(
    context.createCaseEvent(caseId, "revision.restarted", { nextStatus: record.status }, correlationId),
  );

  return record;
}

export async function resolveHlaReviewForCase(
  context: ConsentRevisionStoreMutationContext,
  record: CaseRecord,
  caseId: string,
  resolution: { rationale: string },
  correlationId: AuditContextInput,
): Promise<CaseRecord> {
  if (record.status !== "HLA_REVIEW_REQUIRED") {
    throw new ApiError(
      409,
      "invalid_transition",
      `resolveHlaReview requires HLA_REVIEW_REQUIRED status, current: ${record.status}.`,
      "Only cases in HLA_REVIEW_REQUIRED status can have their HLA review resolved.",
    );
  }
  await context.applyTransition(record, "AWAITING_REVIEW", correlationId);
  record.timeline.push(
    timelineEvent(context.clock, "hla_review_resolved", `HLA review resolved: ${resolution.rationale}`),
  );
  record.auditEvents.push(
    auditEvent(
      context.clock,
      "hla.review.resolved",
      `Operator resolved HLA review: ${resolution.rationale}`,
      correlationId,
    ),
  );
  record.updatedAt = context.clock.nowIso();
  await context.appendCaseEvent(
    context.createCaseEvent(
      caseId,
      "hla.review.resolved",
      { rationale: resolution.rationale, nextStatus: record.status },
      correlationId,
    ),
  );

  return record;
}
