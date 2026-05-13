// ─── Core Domain Enumerations & Primitives ───────────────────────────

export const caseStatuses = [
  "INTAKING",
  "AWAITING_CONSENT",
  "READY_FOR_WORKFLOW",
  "WORKFLOW_REQUESTED",
  "WORKFLOW_RUNNING",
  "WORKFLOW_COMPLETED",
  "WORKFLOW_CANCELLED",
  "WORKFLOW_FAILED",
  "QC_PASSED",
  "QC_FAILED",
  "AWAITING_REVIEW",
  "HLA_REVIEW_REQUIRED",
  "AWAITING_FINAL_RELEASE",
  "APPROVED_FOR_HANDOFF",
  "REVISION_REQUESTED",
  "REVIEW_REJECTED",
  "HANDOFF_PENDING",
  "CONSENT_WITHDRAWN",
] as const;

export type CaseStatus = (typeof caseStatuses)[number];

export const consentStatuses = ["complete", "missing", "withdrawn"] as const;

export type ConsentStatus = (typeof consentStatuses)[number];

export const sampleTypes = ["TUMOR_DNA", "NORMAL_DNA", "TUMOR_RNA", "FOLLOW_UP"] as const;

export type SampleType = (typeof sampleTypes)[number];

export const sourceArtifactSemanticTypes = [
  "tumor-dna-fastq",
  "normal-dna-fastq",
  "tumor-rna-fastq",
  "follow-up-fastq",
] as const;

export type SourceArtifactSemanticType = (typeof sourceArtifactSemanticTypes)[number];

export const derivedArtifactSemanticTypes = [
  "somatic-vcf",
  "filtered-maf",
  "hla-calls",
  "alignment-bam",
  "annotated-vcf",
  "expression-matrix",
  "hla-calls-raw",
  "qc-summary-json",
  "run-manifest-artifact",
  "board-evidence-bundle",
] as const;

export type DerivedArtifactSemanticType = (typeof derivedArtifactSemanticTypes)[number];

export const workflowFailureCategories = [
  "executor_error",
  "pipeline_error",
  "timeout",
  "infrastructure_error",
  "unknown",
] as const;

export type WorkflowFailureCategory = (typeof workflowFailureCategories)[number];

export const sourceArtifactSemanticTypeBySampleType: Readonly<Record<SampleType, SourceArtifactSemanticType>> = {
  TUMOR_DNA: "tumor-dna-fastq",
  NORMAL_DNA: "normal-dna-fastq",
  TUMOR_RNA: "tumor-rna-fastq",
  FOLLOW_UP: "follow-up-fastq",
};

export function isCompatibleSourceArtifactSemanticType(
  sampleType: SampleType,
  semanticType: SourceArtifactSemanticType,
): boolean {
  return sourceArtifactSemanticTypeBySampleType[sampleType] === semanticType;
}

export const assayTypes = ["WES", "WGS", "RNA_SEQ", "PANEL", "OTHER"] as const;

export type AssayType = (typeof assayTypes)[number];

export const artifactClasses = ["SOURCE", "DERIVED", "BOARD_PACKET", "HANDOFF_PACKET", "PAYLOAD"] as const;

export type ArtifactClass = (typeof artifactClasses)[number];

export const caseAuditEventTypes = [
  "case.created",
  "sample.registered",
  "artifact.registered",
  "workflow.requested",
  "workflow.started",
  "workflow.completed",
  "workflow.cancelled",
  "workflow.failed",
  "qc.evaluated",
  "hla.consensus.produced",
  "artifact.derived",
  "candidate.rank-generated",
  "payload.generated",
  "outcome.recorded",
  "board.packet.generated",
  "review.outcome.recorded",
  "final.release.authorized",
  "handoff.packet.generated",
  "consent.updated",
  "revision.restarted",
  "hla.review.resolved",
] as const;

export type CaseAuditEventType = (typeof caseAuditEventTypes)[number];

export const authMechanisms = ["anonymous", "api-key", "jwt-bearer"] as const;

export type AuthMechanism = (typeof authMechanisms)[number];

export interface AuditContext {
  correlationId: string;
  actorId: string;
  authMechanism: AuthMechanism;
}

export interface CaseProfile {
  patientKey: string;
  indication: string;
  siteId: string;
  protocolVersion: string;
  consentStatus: ConsentStatus;
  boardRoute?: string;
}

export interface SampleRecord {
  sampleId: string;
  sampleType: SampleType;
  assayType: AssayType;
  accessionId: string;
  sourceSite: string;
  registeredAt: string;
}

export interface RunArtifact {
  artifactId: string;
  runId: string;
  artifactClass: "DERIVED";
  semanticType: DerivedArtifactSemanticType;
  artifactHash: string;
  producingStep: string;
  registeredAt: string;
}

export interface ArtifactRecord {
  artifactId: string;
  artifactClass: ArtifactClass;
  sampleId: string;
  semanticType: SourceArtifactSemanticType;
  schemaVersion: number;
  artifactHash: string;
  storageUri?: string;
  mediaType?: string;
  registeredAt: string;
}

export interface WorkflowRequestRecord {
  requestId: string;
  workflowName: string;
  referenceBundleId: string;
  executionProfile: string;
  requestedBy?: string;
  requestedAt: string;
  idempotencyKey?: string;
  correlationId?: string;
}

export interface WorkflowDispatchRecord {
  dispatchId: string;
  caseId: string;
  requestId: string;
  workflowName: string;
  referenceBundleId: string;
  executionProfile: string;
  requestedBy?: string;
  requestedAt: string;
  idempotencyKey?: string;
  correlationId?: string;
  runId: string;
  status: "PENDING";
}

export interface TimelineEvent {
  at: string;
  type: string;
  detail: string;
}

export interface CaseAuditEventRecord {
  eventId: string;
  type: CaseAuditEventType;
  detail: string;
  actorId: string;
  authMechanism: AuthMechanism;
  correlationId: string;
  occurredAt: string;
  prevHash?: string; // SHA-256 of previous event in chain; undefined = genesis
}

export interface AuditChainVerificationResult {
  valid: boolean;
  eventCount: number;
  firstBreakAt?: string; // eventId of first inconsistency
  detail?: string;
}

export interface CreateCaseInput {
  caseProfile: CaseProfile;
}

export interface RegisterSampleInput {
  sampleId: string;
  sampleType: SampleType;
  assayType: AssayType;
  accessionId: string;
  sourceSite: string;
}

export interface RegisterArtifactInput {
  sampleId: string;
  semanticType: SourceArtifactSemanticType;
  schemaVersion: number;
  artifactHash: string;
  storageUri?: string;
  mediaType?: string;
}

export interface RequestWorkflowInput {
  workflowName: string;
  referenceBundleId: string;
  executionProfile: string;
  requestedBy?: string;
  idempotencyKey?: string;
}

export interface OperationsSummary {
  totalCases: number;
  statusCounts: Record<CaseStatus, number>;
  awaitingConsentCount: number;
  readyForWorkflowCount: number;
  workflowRequestedCount: number;
}
