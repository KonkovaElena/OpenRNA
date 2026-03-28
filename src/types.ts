export const caseStatuses = [
  "INTAKING",
  "AWAITING_CONSENT",
  "READY_FOR_WORKFLOW",
  "WORKFLOW_REQUESTED",
  "WORKFLOW_RUNNING",
  "WORKFLOW_COMPLETED",
  "WORKFLOW_FAILED",
  "QC_PASSED",
  "QC_FAILED",
  "ON_HOLD",
] as const;

export type CaseStatus = (typeof caseStatuses)[number];

export const consentStatuses = ["complete", "missing"] as const;

export type ConsentStatus = (typeof consentStatuses)[number];

export const sampleTypes = ["TUMOR_DNA", "NORMAL_DNA", "TUMOR_RNA", "FOLLOW_UP"] as const;

export type SampleType = (typeof sampleTypes)[number];

export const assayTypes = ["WES", "WGS", "RNA_SEQ", "PANEL", "OTHER"] as const;

export type AssayType = (typeof assayTypes)[number];

export const artifactClasses = ["SOURCE", "DERIVED", "BOARD_PACKET", "PAYLOAD"] as const;

export type ArtifactClass = (typeof artifactClasses)[number];

export const caseAuditEventTypes = [
  "case.created",
  "sample.registered",
  "artifact.registered",
  "workflow.requested",
  "workflow.started",
  "workflow.completed",
  "workflow.failed",
  "qc.evaluated",
  "hla.consensus.produced",
  "artifact.derived",
  "board.packet.generated",
] as const;

export type CaseAuditEventType = (typeof caseAuditEventTypes)[number];

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

export interface ArtifactRecord {
  artifactId: string;
  artifactClass: ArtifactClass;
  sampleId: string;
  semanticType: string;
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
  correlationId: string;
  occurredAt: string;
}

export interface CaseRecord {
  caseId: string;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  caseProfile: CaseProfile;
  samples: SampleRecord[];
  artifacts: ArtifactRecord[];
  workflowRequests: WorkflowRequestRecord[];
  timeline: TimelineEvent[];
  auditEvents: CaseAuditEventRecord[];
  // Phase 2
  workflowRuns: WorkflowRunRecord[];
  derivedArtifacts: RunArtifact[];
  hlaConsensus?: HlaConsensusRecord;
  qcGates: QcGateRecord[];
  boardPackets: BoardPacketRecord[];
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
  semanticType: string;
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

// ─── Phase 2: Scientific Workflow Backbone ───────────────────────────

export const workflowRunStatuses = [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type WorkflowRunStatus = (typeof workflowRunStatuses)[number];

export const qcGateOutcomes = ["PASSED", "FAILED", "WARN"] as const;

export type QcGateOutcome = (typeof qcGateOutcomes)[number];

export interface WorkflowRunRecord {
  runId: string;
  caseId: string;
  requestId: string;
  status: WorkflowRunStatus;
  workflowName: string;
  referenceBundleId: string;
  executionProfile: string;
  startedAt?: string;
  completedAt?: string;
  failureReason?: string;
  runMetadata?: Record<string, unknown>;
}

export interface RunArtifact {
  artifactId: string;
  runId: string;
  artifactClass: "DERIVED";
  semanticType: string;
  artifactHash: string;
  producingStep: string;
  registeredAt: string;
}

export interface QcResult {
  metric: string;
  value: number;
  threshold: number;
  pass: boolean;
  notes?: string;
}

export interface QcGateRecord {
  runId: string;
  outcome: QcGateOutcome;
  results: QcResult[];
  evaluatedAt: string;
}

export interface HlaToolEvidence {
  toolName: string;
  alleles: string[];
  confidence: number;
  rawOutput?: string;
}

export interface HlaConsensusRecord {
  caseId: string;
  alleles: string[];
  perToolEvidence: HlaToolEvidence[];
  confidenceScore: number;
  tieBreakNotes?: string;
  referenceVersion: string;
  producedAt: string;
}

export interface ReferenceBundleManifest {
  bundleId: string;
  genomeAssembly: string;
  annotationVersion: string;
  knownSitesVersion: string;
  frozenAt: string;
}

export interface StartWorkflowRunInput {
  runId: string;
}

export interface CompleteWorkflowRunInput {
  derivedArtifacts?: Array<{
    semanticType: string;
    artifactHash: string;
    producingStep: string;
  }>;
}

export interface FailWorkflowRunInput {
  reason: string;
}

export interface RecordHlaConsensusInput {
  alleles: string[];
  perToolEvidence: HlaToolEvidence[];
  confidenceScore: number;
  tieBreakNotes?: string;
  referenceVersion: string;
}

export interface EvaluateQcGateInput {
  results: Array<{
    metric: string;
    value: number;
    threshold: number;
    pass: boolean;
    notes?: string;
  }>;
}

export interface BoardPacketCaseSummary {
  caseId: string;
  status: CaseStatus;
  indication: string;
  siteId: string;
  protocolVersion: string;
  boardRoute: string;
}

export interface BoardPacketSnapshot {
  caseSummary: BoardPacketCaseSummary;
  workflowRuns: WorkflowRunRecord[];
  derivedArtifacts: RunArtifact[];
  hlaConsensus: HlaConsensusRecord;
  latestQcGate: QcGateRecord;
}

export interface BoardPacketRecord {
  packetId: string;
  caseId: string;
  artifactClass: "BOARD_PACKET";
  boardRoute: string;
  version: number;
  schemaVersion: number;
  packetHash: string;
  createdAt: string;
  snapshot: BoardPacketSnapshot;
}

export interface BoardPacketGenerationResult {
  case: CaseRecord;
  packet: BoardPacketRecord;
  created: boolean;
}