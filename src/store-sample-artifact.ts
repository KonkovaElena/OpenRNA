import { randomUUID } from "node:crypto";
import { ApiError } from "./errors";
import type { AuditContextInput } from "./store-helpers";
import { auditEvent, deriveCaseStatus, timelineEvent } from "./store-helpers";
import type {
  ArtifactRecord,
  CaseDomainEventInput,
  CaseDomainEventType,
  CaseRecord,
  CaseStatus,
  RegisterArtifactInput,
  RegisterSampleInput,
  SampleRecord,
} from "./types";
import { isCompatibleSourceArtifactSemanticType } from "./types";

type ClockLike = { nowIso(): string };

export interface SampleArtifactStoreMutationContext {
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

function assertNoWorkflowRequests(record: CaseRecord): void {
  if (record.workflowRequests.length > 0) {
    throw new ApiError(
      409,
      "invalid_transition",
      "Samples/artifacts cannot be changed after workflow request.",
      "Create a new case version before changing provenance.",
    );
  }
}

function pushWorkflowGateOpened(
  context: SampleArtifactStoreMutationContext,
  record: CaseRecord,
  workflowGateOpened: boolean,
): void {
  if (workflowGateOpened) {
    record.timeline.push(
      timelineEvent(
        context.clock,
        "workflow_gate_opened",
        "Required sample trio, source artifacts, and consent gate are complete.",
      ),
    );
  }
}

export async function registerSampleForCase(
  context: SampleArtifactStoreMutationContext,
  record: CaseRecord,
  input: RegisterSampleInput,
  correlationId: AuditContextInput,
): Promise<{ record: CaseRecord; sampleRecord: SampleRecord; nextStatus: CaseStatus }> {
  assertNoWorkflowRequests(record);

  if (record.samples.some((sample) => sample.sampleType === input.sampleType)) {
    throw new ApiError(
      409,
      "duplicate_sample_type",
      "Sample type already registered.",
      "Submit each required sample type only once in this bootstrap slice.",
    );
  }

  const registeredAt = context.clock.nowIso();
  const sampleRecord: SampleRecord = {
    sampleId: input.sampleId,
    sampleType: input.sampleType,
    assayType: input.assayType,
    accessionId: input.accessionId,
    sourceSite: input.sourceSite,
    registeredAt,
  };
  record.samples.push(sampleRecord);
  record.timeline.push(
    timelineEvent(context.clock, "sample_registered", `${input.sampleType} provenance was registered.`),
  );
  record.auditEvents.push(
    auditEvent(context.clock, "sample.registered", `${input.sampleType} provenance was registered.`, correlationId),
  );

  const nextStatus = deriveCaseStatus(record.caseProfile.consentStatus, record.samples, record.artifacts, false);
  const workflowGateOpened = nextStatus === "READY_FOR_WORKFLOW" && record.status !== "READY_FOR_WORKFLOW";
  pushWorkflowGateOpened(context, record, workflowGateOpened);
  await context.applyTransition(record, nextStatus, correlationId);
  record.updatedAt = registeredAt;

  return { record, sampleRecord, nextStatus };
}

export async function registerArtifactForCase(
  context: SampleArtifactStoreMutationContext,
  record: CaseRecord,
  input: RegisterArtifactInput,
  correlationId: AuditContextInput,
): Promise<{ record: CaseRecord; artifact: ArtifactRecord; nextStatus: CaseStatus }> {
  assertNoWorkflowRequests(record);

  const sample = record.samples.find((candidate) => candidate.sampleId === input.sampleId);
  if (!sample) {
    throw new ApiError(
      409,
      "missing_sample_provenance",
      "Artifact references an unknown sample.",
      "Register the sample provenance before attaching a source artifact.",
    );
  }

  if (!isCompatibleSourceArtifactSemanticType(sample.sampleType, input.semanticType)) {
    throw new ApiError(
      409,
      "artifact_semantic_type_mismatch",
      "Source artifact semantic type is incompatible with the referenced sample type.",
      "Use the canonical source artifact semantic type for the referenced sample.",
    );
  }

  if (
    record.artifacts.some(
      (artifact) =>
        artifact.sampleId === input.sampleId &&
        artifact.semanticType === input.semanticType &&
        artifact.artifactHash === input.artifactHash,
    )
  ) {
    throw new ApiError(
      409,
      "duplicate_artifact",
      "Artifact is already registered for this sample.",
      "Submit each source artifact only once per sample and semantic type in this bootstrap slice.",
    );
  }

  const registeredAt = context.clock.nowIso();
  const artifact: ArtifactRecord = {
    artifactId: `artifact_${randomUUID()}`,
    artifactClass: "SOURCE",
    sampleId: input.sampleId,
    semanticType: input.semanticType,
    schemaVersion: input.schemaVersion,
    artifactHash: input.artifactHash,
    storageUri: input.storageUri,
    mediaType: input.mediaType,
    registeredAt,
  };

  record.artifacts.push(artifact);
  record.timeline.push(
    timelineEvent(context.clock, "artifact_registered", `${input.semanticType} source artifact was cataloged.`),
  );
  record.auditEvents.push(
    auditEvent(
      context.clock,
      "artifact.registered",
      `${input.semanticType} source artifact was cataloged.`,
      correlationId,
    ),
  );

  const nextStatus = deriveCaseStatus(record.caseProfile.consentStatus, record.samples, record.artifacts, false);
  const workflowGateOpened = nextStatus === "READY_FOR_WORKFLOW" && record.status !== "READY_FOR_WORKFLOW";
  pushWorkflowGateOpened(context, record, workflowGateOpened);
  await context.applyTransition(record, nextStatus, correlationId);
  record.updatedAt = registeredAt;

  return { record, artifact, nextStatus };
}
