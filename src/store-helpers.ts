import { createHash, randomUUID } from "node:crypto";
import { createAnonymousAuditContext, getCurrentAuditContext } from "./audit-context";
import { ApiError } from "./errors";
import type {
  ArtifactRecord,
  AuditContext,
  CaseAuditEventRecord,
  CaseAuditEventType,
  CaseStatus,
  ConsentStatus,
  EvidenceLineageEdge,
  EvidenceLineageGraph,
  GenerateHandoffPacketInput,
  RecordReviewOutcomeInput,
  ReviewOutcomeRecord,
  RunArtifact,
  SampleRecord,
  TimelineEvent,
  WorkflowRunRecord,
} from "./types";
import { isCompatibleSourceArtifactSemanticType, workflowDependencies } from "./types";

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

export function normalizeAuditContext(context: AuditContextInput): AuditContext {
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
  signatureMetadata?: {
    printedName?: string;
    signatureMeaning?: string;
    signedBy?: string;
    signedAt?: string;
    signatureMethod?: string;
    signatureHash?: string;
    stepUpMethod?: "totp" | "webauthn";
  },
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
    printedName: signatureMetadata?.printedName,
    signatureMeaning: signatureMetadata?.signatureMeaning,
    signedBy: signatureMetadata?.signedBy,
    signedAt: signatureMetadata?.signedAt,
    signatureMethod: signatureMetadata?.signatureMethod,
    signatureHash: signatureMetadata?.signatureHash,
    stepUpMethod: signatureMetadata?.stepUpMethod,
  };
}

function stableAuditEventOrdering(left: CaseAuditEventRecord, right: CaseAuditEventRecord): number {
  const byTimestamp = left.occurredAt.localeCompare(right.occurredAt);
  return byTimestamp !== 0 ? byTimestamp : left.eventId.localeCompare(right.eventId);
}

function buildAuditChainPayload(event: CaseAuditEventRecord, previousEventHash: string | null): string {
  return JSON.stringify({
    eventId: event.eventId,
    type: event.type,
    detail: event.detail,
    correlationId: event.correlationId,
    actorId: event.actorId,
    authMechanism: event.authMechanism,
    occurredAt: event.occurredAt,
    printedName: event.printedName ?? null,
    signatureMeaning: event.signatureMeaning ?? null,
    signedBy: event.signedBy ?? null,
    signedAt: event.signedAt ?? null,
    signatureMethod: event.signatureMethod ?? null,
    signatureHash: event.signatureHash ?? null,
    stepUpMethod: event.stepUpMethod ?? null,
    previousEventHash,
  });
}

export function sealAuditHashChain(events: CaseAuditEventRecord[]): void {
  const ordered = [...events].sort(stableAuditEventOrdering);
  let previousEventHash: string | null = null;

  for (const event of ordered) {
    event.previousEventHash = previousEventHash ?? undefined;
    event.eventHash = computePacketHash(buildAuditChainPayload(event, previousEventHash));
    previousEventHash = event.eventHash;
  }
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
    AWAITING_FINAL_RELEASE: 0,
    APPROVED_FOR_HANDOFF: 0,
    REVISION_REQUESTED: 0,
    REVIEW_REJECTED: 0,
    HANDOFF_PENDING: 0,
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

export function hasRequiredSourceArtifacts(samples: SampleRecord[], artifacts: ArtifactRecord[]): boolean {
  for (const sampleType of requiredSampleTypes) {
    const sample = samples.find((candidate) => candidate.sampleType === sampleType);
    if (!sample) {
      return false;
    }

    const hasCompatibleSourceArtifact = artifacts.some(
      (artifact) =>
        artifact.artifactClass === "SOURCE" &&
        artifact.sampleId === sample.sampleId &&
        isCompatibleSourceArtifactSemanticType(sample.sampleType, artifact.semanticType),
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
  if (hasWorkflowRequest) {
    return "WORKFLOW_REQUESTED";
  }

  if (consentStatus === "missing") {
    return "AWAITING_CONSENT";
  }

  if (hasRequiredSamples(samples) && hasRequiredSourceArtifacts(samples, artifacts)) {
    return "READY_FOR_WORKFLOW";
  }

  return "INTAKING";
}

export function computePacketHash(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
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

export function stableReviewOutcomeSignature(value: RecordReviewOutcomeInput | ReviewOutcomeRecord): string {
  const signatureCandidate = value.signature as {
    printedName?: string;
    meaning?: string;
    stepUpAuth?: { method?: "totp" | "webauthn" };
    stepUpMethod?: "totp" | "webauthn";
  } | undefined;

  return JSON.stringify({
    packetId: value.packetId,
    reviewerId: value.reviewerId,
    reviewerRole: value.reviewerRole ?? null,
    reviewDisposition: value.reviewDisposition,
    rationale: value.rationale,
    comments: value.comments ?? null,
    signature: signatureCandidate
      ? {
          printedName: signatureCandidate.printedName,
          meaning: signatureCandidate.meaning,
          stepUpMethod: signatureCandidate.stepUpAuth?.method ?? signatureCandidate.stepUpMethod ?? null,
        }
      : null,
  });
}

export function stableHandoffPacketSignature(value: GenerateHandoffPacketInput): string {
  return JSON.stringify({
    reviewId: value.reviewId,
    qaReleaseId: value.qaReleaseId,
    handoffTarget: value.handoffTarget,
    requestedBy: value.requestedBy,
    turnaroundDays: value.turnaroundDays,
    notes: value.notes ?? null,
  });
}

export function normalizeTraceabilityError(error: unknown): never {
  if (error instanceof ApiError) {
    throw error;
  }

  if (error instanceof Error) {
    if (
      error.message === "Neoantigen ranking is required to build full traceability." ||
      error.message === "Construct design is required to build full traceability."
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

export function hasSameRunReplayIdentity(existingRun: WorkflowRunRecord, nextRun: WorkflowRunRecord): boolean {
  return (
    existingRun.runId === nextRun.runId &&
    existingRun.caseId === nextRun.caseId &&
    existingRun.requestId === nextRun.requestId &&
    existingRun.workflowName === nextRun.workflowName &&
    existingRun.referenceBundleId === nextRun.referenceBundleId &&
    existingRun.executionProfile === nextRun.executionProfile &&
    JSON.stringify(existingRun.manifest ?? null) === JSON.stringify(nextRun.manifest ?? null)
  );
}

export function stableDerivedArtifactSignature(
  artifact: Pick<RunArtifact, "semanticType" | "artifactHash" | "producingStep">,
): string {
  return `${artifact.semanticType}::${artifact.artifactHash}::${artifact.producingStep}`;
}

export function hasSameDerivedArtifactsForRun(existingArtifacts: RunArtifact[], nextArtifacts: RunArtifact[]): boolean {
  if (existingArtifacts.length !== nextArtifacts.length) {
    return false;
  }

  return existingArtifacts.every((artifact, index) => {
    const nextArtifact = nextArtifacts[index];
    return Boolean(nextArtifact) && stableDerivedArtifactSignature(artifact) === stableDerivedArtifactSignature(nextArtifact);
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
    const workflowDeps = (workflowDependencies as Record<string, readonly string[]>)[run.workflowName];
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