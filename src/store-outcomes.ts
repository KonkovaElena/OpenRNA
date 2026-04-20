import { randomUUID } from "node:crypto";
import { ApiError } from "./errors";
import type { AuditContextInput } from "./store-helpers";
import {
  auditEvent,
  normalizeTraceabilityError,
  sortOutcomeTimeline,
  timelineEvent,
} from "./store-helpers";
import { buildFullTraceability } from "./traceability";
import type {
  AdministrationRecord,
  CaseDomainEventInput,
  CaseRecord,
  ClinicalFollowUpRecord,
  FullTraceabilityRecord,
  ImmuneMonitoringRecord,
  OutcomeTimelineEntry,
} from "./types";

export interface OutcomeStoreMutationContext {
  clock: { nowIso(): string };
  createCaseEvent: (
    caseId: string,
    type: "administration.recorded" | "immune-monitoring.recorded" | "clinical-follow-up.recorded",
    payload: unknown,
    correlationId: AuditContextInput,
    occurredAt?: string,
    updatedAt?: string,
  ) => CaseDomainEventInput;
  appendCaseEvent: (event: CaseDomainEventInput) => Promise<unknown>;
  rebuildCaseProjection: (caseId: string) => Promise<CaseRecord>;
}

function assertOutcomeConstruct(
  record: CaseRecord,
  caseId: string,
  constructId: string,
  constructVersion: number,
): void {
  if (!record.constructDesign) {
    throw new ApiError(
      409,
      "construct_design_required",
      "Outcome events require a stored construct design.",
      "Generate and persist a construct design before recording outcomes.",
    );
  }

  if (record.constructDesign.caseId !== caseId) {
    throw new ApiError(
      409,
      "invalid_transition",
      "Construct design caseId does not match the outcome target case.",
      "Use the construct design linked to this case.",
    );
  }

  if (record.constructDesign.constructId !== constructId || record.constructDesign.version !== constructVersion) {
    throw new ApiError(
      409,
      "construct_mismatch",
      "Outcome event does not match the stored construct design identity.",
      "Record outcomes only against the stored constructId and constructVersion.",
    );
  }
}

function appendOutcomeEntry(record: CaseRecord, entry: OutcomeTimelineEntry): void {
  record.outcomeTimeline.push(structuredClone(entry));
  sortOutcomeTimeline(record.outcomeTimeline);
}

export async function recordAdministrationForCase(
  context: OutcomeStoreMutationContext,
  record: CaseRecord,
  caseId: string,
  administration: AdministrationRecord,
  correlationId: AuditContextInput,
): Promise<CaseRecord> {
  if (administration.caseId !== caseId) {
    throw new ApiError(
      409,
      "invalid_transition",
      "Administration record caseId does not match the target case.",
      "Use an administration record for the target case.",
    );
  }

  assertOutcomeConstruct(record, caseId, administration.constructId, administration.constructVersion);

  const entry: OutcomeTimelineEntry = {
    entryId: `outcome_${randomUUID()}`,
    caseId,
    constructId: administration.constructId,
    constructVersion: administration.constructVersion,
    entryType: "administration",
    occurredAt: administration.administeredAt,
    administration: structuredClone(administration),
  };

  appendOutcomeEntry(record, entry);
  record.timeline.push(
    timelineEvent(
      context.clock,
      "construct_administered",
      `Recorded construct administration ${administration.administrationId} via ${administration.route}.`,
      administration.administeredAt,
    ),
  );
  record.auditEvents.push(
    auditEvent(
      context.clock,
      "outcome.recorded",
      `Recorded administration outcome ${administration.administrationId} for construct ${administration.constructId}.`,
      correlationId,
      administration.administeredAt,
    ),
  );
  record.updatedAt = context.clock.nowIso();

  await context.appendCaseEvent(
    context.createCaseEvent(
      caseId,
      "administration.recorded",
      { entry: structuredClone(entry) },
      correlationId,
      administration.administeredAt,
      record.updatedAt,
    ),
  );

  return context.rebuildCaseProjection(caseId);
}

export async function recordImmuneMonitoringForCase(
  context: OutcomeStoreMutationContext,
  record: CaseRecord,
  caseId: string,
  immuneMonitoring: ImmuneMonitoringRecord,
  correlationId: AuditContextInput,
): Promise<CaseRecord> {
  if (immuneMonitoring.caseId !== caseId) {
    throw new ApiError(
      409,
      "invalid_transition",
      "Immune monitoring record caseId does not match the target case.",
      "Use an immune monitoring record for the target case.",
    );
  }

  assertOutcomeConstruct(record, caseId, immuneMonitoring.constructId, immuneMonitoring.constructVersion);

  const entry: OutcomeTimelineEntry = {
    entryId: `outcome_${randomUUID()}`,
    caseId,
    constructId: immuneMonitoring.constructId,
    constructVersion: immuneMonitoring.constructVersion,
    entryType: "immune-monitoring",
    occurredAt: immuneMonitoring.collectedAt,
    immuneMonitoring: structuredClone(immuneMonitoring),
  };

  appendOutcomeEntry(record, entry);
  record.timeline.push(
    timelineEvent(
      context.clock,
      "immune_monitoring_recorded",
      `Recorded immune monitoring ${immuneMonitoring.monitoringId} for biomarker ${immuneMonitoring.biomarker}.`,
      immuneMonitoring.collectedAt,
    ),
  );
  record.auditEvents.push(
    auditEvent(
      context.clock,
      "outcome.recorded",
      `Recorded immune monitoring outcome ${immuneMonitoring.monitoringId} for construct ${immuneMonitoring.constructId}.`,
      correlationId,
      immuneMonitoring.collectedAt,
    ),
  );
  record.updatedAt = context.clock.nowIso();

  await context.appendCaseEvent(
    context.createCaseEvent(
      caseId,
      "immune-monitoring.recorded",
      { entry: structuredClone(entry) },
      correlationId,
      immuneMonitoring.collectedAt,
      record.updatedAt,
    ),
  );

  return context.rebuildCaseProjection(caseId);
}

export async function recordClinicalFollowUpForCase(
  context: OutcomeStoreMutationContext,
  record: CaseRecord,
  caseId: string,
  clinicalFollowUp: ClinicalFollowUpRecord,
  correlationId: AuditContextInput,
): Promise<CaseRecord> {
  if (clinicalFollowUp.caseId !== caseId) {
    throw new ApiError(
      409,
      "invalid_transition",
      "Clinical follow-up record caseId does not match the target case.",
      "Use a clinical follow-up record for the target case.",
    );
  }

  assertOutcomeConstruct(record, caseId, clinicalFollowUp.constructId, clinicalFollowUp.constructVersion);

  const entry: OutcomeTimelineEntry = {
    entryId: `outcome_${randomUUID()}`,
    caseId,
    constructId: clinicalFollowUp.constructId,
    constructVersion: clinicalFollowUp.constructVersion,
    entryType: "clinical-follow-up",
    occurredAt: clinicalFollowUp.evaluatedAt,
    clinicalFollowUp: structuredClone(clinicalFollowUp),
  };

  appendOutcomeEntry(record, entry);
  record.timeline.push(
    timelineEvent(
      context.clock,
      "clinical_follow_up_recorded",
      `Recorded clinical follow-up ${clinicalFollowUp.followUpId} with response ${clinicalFollowUp.responseCategory}.`,
      clinicalFollowUp.evaluatedAt,
    ),
  );
  record.auditEvents.push(
    auditEvent(
      context.clock,
      "outcome.recorded",
      `Recorded clinical follow-up outcome ${clinicalFollowUp.followUpId} for construct ${clinicalFollowUp.constructId}.`,
      correlationId,
      clinicalFollowUp.evaluatedAt,
    ),
  );
  record.updatedAt = context.clock.nowIso();

  await context.appendCaseEvent(
    context.createCaseEvent(
      caseId,
      "clinical-follow-up.recorded",
      { entry: structuredClone(entry) },
      correlationId,
      clinicalFollowUp.evaluatedAt,
      record.updatedAt,
    ),
  );

  return context.rebuildCaseProjection(caseId);
}

export function getOutcomeTimelineForCase(record: CaseRecord): OutcomeTimelineEntry[] {
  return structuredClone(record.outcomeTimeline);
}

export function getFullTraceabilityForCase(record: CaseRecord): FullTraceabilityRecord {
  try {
    return buildFullTraceability(record, record.outcomeTimeline);
  } catch (error) {
    normalizeTraceabilityError(error);
  }
}