import { createHash, randomUUID } from "node:crypto";
import {
  createAnonymousAuditContext,
  getCurrentAuditContext,
} from "./audit-context";
import { ApiError } from "./errors";
import type {
  AuthorizeFinalReleaseInput,
  ArtifactRecord,
  AuditChainVerificationResult,
  AuditContext,
  CaseAuditEventRecord,
  CaseAuditEventType,
  CaseStatus,
  ConsentStatus,
  EvidenceLineageEdge,
  EvidenceLineageGraph,
  GenerateHandoffPacketInput,
  RecordReviewOutcomeInput,
  RunArtifact,
  SampleRecord,
  TimelineEvent,
  WorkflowRunRecord,
} from "./types";
import {
  isCompatibleSourceArtifactSemanticType,
  workflowDependencies,
} from "./types";

export type AuditContextInput = string | AuditContext;

const requiredSampleTypes: ReadonlySet<SampleRecord["sampleType"]> = new Set([
  "TUMOR_DNA",
  "NORMAL_DNA",
  "TUMOR_RNA",
]);

export function timelineEvent(
  clock: { nowIso(): string },
  type: string,
  detail: string,
  at: string = clock.nowIso(),
): TimelineEvent {
  return { at, type, detail };
}

export function normalizeAuditContext(
  context: AuditContextInput,
): AuditContext {
  if (typeof context !== "string") {
    return context;
  }

  const currentContext = getCurrentAuditContext();
  if (currentContext) {
    return {
      correlationId: context,
      actorId: currentContext.actorId,
      authMechanism: currentContext.authMechanism,
    };
  }

  return createAnonymousAuditContext(context);
}

export function auditEvent(
  clock: { nowIso(): string },
  type: CaseAuditEventType,
  detail: string,
  correlationId: AuditContextInput,
  occurredAt: string = clock.nowIso(),
): CaseAuditEventRecord {
  const context = normalizeAuditContext(correlationId);
  return {
    eventId: `event_${randomUUID()}`,
    type,
    detail,
    correlationId: context.correlationId,
    actorId: context.actorId,
    authMechanism: context.authMechanism,
    occurredAt,
  };
}

export function emptyStatusCounts(): Record<CaseStatus, number> {
  return {
    INTAKING: 0,
    AWAITING_CONSENT: 0,
    READY_FOR_WORKFLOW: 0,
    WORKFLOW_REQUESTED: 0,
    WORKFLOW_RUNNING: 0,
    WORKFLOW_COMPLETED: 0,
    WORKFLOW_CANCELLED: 0,
    WORKFLOW_FAILED: 0,
    QC_PASSED: 0,
    QC_FAILED: 0,
    AWAITING_REVIEW: 0,
    HLA_REVIEW_REQUIRED: 0,
    AWAITING_FINAL_RELEASE: 0,
    APPROVED_FOR_HANDOFF: 0,
    REVISION_REQUESTED: 0,
    REVIEW_REJECTED: 0,
    HANDOFF_PENDING: 0,
    CONSENT_WITHDRAWN: 0,
  };
}

export function hasRequiredSamples(samples: SampleRecord[]): boolean {
  const seen = new Set(samples.map((sample) => sample.sampleType));
  for (const sampleType of requiredSampleTypes) {
    if (!seen.has(sampleType)) {
      return false;
    }
  }

  return true;
}

export function hasRequiredSourceArtifacts(
  samples: SampleRecord[],
  artifacts: ArtifactRecord[],
): boolean {
  for (const sampleType of requiredSampleTypes) {
    const sample = samples.find(
      (candidate) => candidate.sampleType === sampleType,
    );
    if (!sample) {
      return false;
    }

    const hasCompatibleSourceArtifact = artifacts.some(
      (artifact) =>
        artifact.artifactClass === "SOURCE" &&
        artifact.sampleId === sample.sampleId &&
        isCompatibleSourceArtifactSemanticType(
          sample.sampleType,
          artifact.semanticType,
        ),
    );

    if (!hasCompatibleSourceArtifact) {
      return false;
    }
  }

  return true;
}

export function deriveCaseStatus(
  consentStatus: ConsentStatus,
  samples: SampleRecord[],
  artifacts: ArtifactRecord[],
  hasWorkflowRequest: boolean,
): CaseStatus {
  if (consentStatus === "withdrawn") {
    return "CONSENT_WITHDRAWN";
  }

  if (hasWorkflowRequest) {
    return "WORKFLOW_REQUESTED";
  }

  if (consentStatus === "missing") {
    return "AWAITING_CONSENT";
  }

  if (
    hasRequiredSamples(samples) &&
    hasRequiredSourceArtifacts(samples, artifacts)
  ) {
    return "READY_FOR_WORKFLOW";
  }

  return "INTAKING";
}

export function computePacketHash(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

/**
 * Computes the canonical SHA-256 fingerprint for a single audit event record.
 *
 * Formula: SHA-256(eventId | "|" | type | "|" | detail | "|" |
 *                  correlationId | "|" | actorId | "|" | authMechanism | "|" | occurredAt)
 *
 * Per FDA Data Integrity Guidance 2018 (ALCOA+ Accurate principle): the hash
 * covers the immutable identity and integrity fields of the record. Optional
 * metadata fields (recordHash, prevHash) are excluded to avoid circularity.
 */
export function computeAuditEventRecordHash(
  event: Pick<
    CaseAuditEventRecord,
    | "eventId"
    | "type"
    | "detail"
    | "correlationId"
    | "actorId"
    | "authMechanism"
    | "occurredAt"
  >,
): string {
  const payload = [
    event.eventId,
    event.type,
    event.detail,
    event.correlationId,
    event.actorId,
    event.authMechanism,
    event.occurredAt,
  ].join("|");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * Verifies the hash-chain integrity of an ordered array of audit events.
 * Events must be in chronological order (ascending occurredAt / eventId).
 * Returns the first detected inconsistency if any.
 */
export function verifyAuditChainIntegrity(
  events: readonly CaseAuditEventRecord[],
): AuditChainVerificationResult {
  if (events.length === 0) {
    return { valid: true, eventCount: 0, detail: "No audit events." };
  }

  let expectedPrev: string | undefined = undefined;

  for (const event of events) {
    // prevHash check: only enforce when the event explicitly declares prevHash
    if (event.prevHash !== undefined && event.prevHash !== expectedPrev) {
      return {
        valid: false,
        eventCount: events.length,
        firstBreakAt: event.eventId,
        detail: `prevHash mismatch on event ${event.eventId}: expected ${
          expectedPrev ?? "genesis (undefined)"
        }, found ${event.prevHash}.`,
      };
    }

    // recordHash check
    const expectedRecordHash = computeAuditEventRecordHash(event);
    if (
      event.recordHash !== undefined &&
      event.recordHash !== expectedRecordHash
    ) {
      return {
        valid: false,
        eventCount: events.length,
        firstBreakAt: event.eventId,
        detail: `recordHash mismatch on event ${event.eventId}.`,
      };
    }

    expectedPrev = event.recordHash ?? computeAuditEventRecordHash(event);
  }

  return { valid: true, eventCount: events.length };
}

export function cloneWorkflowRun(run: WorkflowRunRecord): WorkflowRunRecord {
  return structuredClone(run);
}

export function sortOutcomeTimeline(
  entries: Array<{ occurredAt: string; entryId: string }>,
): void {
  entries.sort((left, right) => {
    const byTime = left.occurredAt.localeCompare(right.occurredAt);
    return byTime !== 0 ? byTime : left.entryId.localeCompare(right.entryId);
  });
}

export function stableReviewOutcomeSignature(
  value: RecordReviewOutcomeInput,
): string {
  return JSON.stringify({
    packetId: value.packetId,
    reviewerId: value.reviewerId,
    reviewerRole: value.reviewerRole ?? null,
    reviewDisposition: value.reviewDisposition,
    rationale: value.rationale,
    comments: value.comments ?? null,
  });
}

export function stableHandoffPacketSignature(
  value: GenerateHandoffPacketInput,
): string {
  return JSON.stringify({
    reviewId: value.reviewId,
    handoffTarget: value.handoffTarget,
    requestedBy: value.requestedBy,
    turnaroundDays: value.turnaroundDays,
    notes: value.notes ?? null,
  });
}

export function stableFinalReleaseSignature(
  value: AuthorizeFinalReleaseInput,
): string {
  return JSON.stringify({
    reviewId: value.reviewId,
    releaserId: value.releaserId,
    releaserRole: value.releaserRole ?? null,
    rationale: value.rationale,
    comments: value.comments ?? null,
  });
}

export function normalizeTraceabilityError(error: unknown): never {
  if (error instanceof ApiError) {
    throw error;
  }

  if (error instanceof Error) {
    if (
      error.message ===
        "Neoantigen ranking is required to build full traceability." ||
      error.message ===
        "Construct design is required to build full traceability."
    ) {
      throw new ApiError(
        409,
        "traceability_not_ready",
        error.message,
        "Record both neoantigen ranking and construct design before requesting full traceability.",
      );
    }

    throw new ApiError(
      409,
      "traceability_invalid",
      error.message,
      "Repair the stored ranking, construct design, or outcome timeline before requesting full traceability.",
    );
  }

  throw new ApiError(
    500,
    "internal_error",
    "Traceability evaluation failed unexpectedly.",
    "Retry the request or inspect server logs.",
  );
}

export function hasSameRunReplayIdentity(
  existingRun: WorkflowRunRecord,
  nextRun: WorkflowRunRecord,
): boolean {
  return (
    existingRun.runId === nextRun.runId &&
    existingRun.caseId === nextRun.caseId &&
    existingRun.requestId === nextRun.requestId &&
    existingRun.workflowName === nextRun.workflowName &&
    existingRun.referenceBundleId === nextRun.referenceBundleId &&
    existingRun.executionProfile === nextRun.executionProfile &&
    JSON.stringify(existingRun.manifest ?? null) ===
      JSON.stringify(nextRun.manifest ?? null)
  );
}

export function stableDerivedArtifactSignature(
  artifact: Pick<
    RunArtifact,
    "semanticType" | "artifactHash" | "producingStep"
  >,
): string {
  return `${artifact.semanticType}::${artifact.artifactHash}::${artifact.producingStep}`;
}

export function hasSameDerivedArtifactsForRun(
  existingArtifacts: RunArtifact[],
  nextArtifacts: RunArtifact[],
): boolean {
  if (existingArtifacts.length !== nextArtifacts.length) {
    return false;
  }

  return existingArtifacts.every((artifact, index) => {
    const nextArtifact = nextArtifacts[index];
    return (
      Boolean(nextArtifact) &&
      stableDerivedArtifactSignature(artifact) ===
        stableDerivedArtifactSignature(nextArtifact)
    );
  });
}

export function buildEvidenceLineage(
  completedRuns: WorkflowRunRecord[],
  derivedArtifacts: RunArtifact[],
): EvidenceLineageGraph {
  const edges: EvidenceLineageEdge[] = [];
  const runsByWorkflow = new Map<string, WorkflowRunRecord>();
  for (const run of completedRuns) {
    runsByWorkflow.set(run.workflowName, run);
  }

  const artifactsByRun = new Map<string, RunArtifact[]>();
  for (const art of derivedArtifacts) {
    const currentArtifacts = artifactsByRun.get(art.runId) ?? [];
    currentArtifacts.push(art);
    artifactsByRun.set(art.runId, currentArtifacts);
  }

  for (const run of completedRuns) {
    const workflowDeps = (
      workflowDependencies as Record<string, readonly string[]>
    )[run.workflowName];
    if (!workflowDeps) {
      continue;
    }

    for (const dependencyName of workflowDeps) {
      const upstreamRun = runsByWorkflow.get(dependencyName);
      if (!upstreamRun) {
        continue;
      }

      const upstreamArtifacts = artifactsByRun.get(upstreamRun.runId) ?? [];
      for (const artifact of upstreamArtifacts) {
        edges.push({
          producerRunId: upstreamRun.runId,
          producerWorkflow: dependencyName,
          artifactId: artifact.artifactId,
          semanticType: artifact.semanticType,
          consumerRunId: run.runId,
          consumerWorkflow: run.workflowName,
        });
      }
    }
  }

  const allProducers = new Set(edges.map((edge) => edge.producerRunId));
  const allConsumers = new Set(edges.map((edge) => edge.consumerRunId));
  const allRunIds = completedRuns.map((run) => run.runId);

  return {
    edges,
    roots: allRunIds.filter((runId) => !allConsumers.has(runId)),
    terminal: allRunIds.filter((runId) => !allProducers.has(runId)),
  };
}
