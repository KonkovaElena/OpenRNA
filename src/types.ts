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

export const sampleTypes = [
  "TUMOR_DNA",
  "NORMAL_DNA",
  "TUMOR_RNA",
  "FOLLOW_UP",
] as const;

export type SampleType = (typeof sampleTypes)[number];

export const sourceArtifactSemanticTypes = [
  "tumor-dna-fastq",
  "normal-dna-fastq",
  "tumor-rna-fastq",
  "follow-up-fastq",
] as const;

export type SourceArtifactSemanticType =
  (typeof sourceArtifactSemanticTypes)[number];

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

export type DerivedArtifactSemanticType =
  (typeof derivedArtifactSemanticTypes)[number];

export const workflowFailureCategories = [
  "executor_error",
  "pipeline_error",
  "timeout",
  "infrastructure_error",
  "unknown",
] as const;

export type WorkflowFailureCategory =
  (typeof workflowFailureCategories)[number];

export const sourceArtifactSemanticTypeBySampleType: Readonly<
  Record<SampleType, SourceArtifactSemanticType>
> = {
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

export const artifactClasses = [
  "SOURCE",
  "DERIVED",
  "BOARD_PACKET",
  "HANDOFF_PACKET",
  "PAYLOAD",
] as const;

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
  actorId: string;
  authMechanism: AuthMechanism;
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
  reviewOutcomes: ReviewOutcomeRecord[];
  handoffPackets: HandoffPacketRecord[];
  neoantigenRanking?: RankingResult;
  constructDesign?: ConstructDesignPackage;
  outcomeTimeline: OutcomeTimelineEntry[];
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

export interface WorkflowTerminalMetadata {
  durationMs: number;
  executorVersion: string;
  resourceSummary?: Record<string, unknown>;
}

// ─── Nextflow Executor Types (Wave 4) ───────────────────────────────

export interface NextflowTerminalMetadata extends WorkflowTerminalMetadata {
  nextflowSessionId: string;
  nextflowRunName: string;
  launchDir: string;
  workDir: string;
  pipelineRevision: string;
  containerProvenance?: string;
  traceUri?: string;
  timelineUri?: string;
  reportUri?: string;
  outputManifestUri?: string;
}

export const nextflowRunStates = [
  "submitted",
  "running",
  "completed",
  "failed",
  "cancelled",
  "unknown",
] as const;

export type NextflowRunState = (typeof nextflowRunStates)[number];

export interface NextflowPollResult {
  sessionId: string;
  runName: string;
  state: NextflowRunState;
  exitCode?: number;
  errorMessage?: string;
  durationMs?: number;
  traceUri?: string;
  timelineUri?: string;
  reportUri?: string;
}

export const nextflowExitCodeMapping: Readonly<
  Record<number, WorkflowFailureCategory>
> = {
  0: "unknown", // should not be used for failures
  1: "pipeline_error", // general pipeline error
  2: "pipeline_error", // script error
  137: "timeout", // OOM kill / timeout
  143: "timeout", // SIGTERM
  255: "infrastructure_error", // infrastructure / env error
};

export interface WorkflowRunRecord {
  runId: string;
  caseId: string;
  requestId: string;
  status: WorkflowRunStatus;
  workflowName: string;
  referenceBundleId: string;
  pinnedReferenceBundle?: ReferenceBundleManifest;
  executionProfile: string;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  failureReason?: string;
  failureCategory?: WorkflowFailureCategory;
  terminalMetadata?: WorkflowTerminalMetadata;
  manifest?: WorkflowRunManifest;
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

// ─── Well-Known QC Metrics (Wave 5) ─────────────────────────────────

export const wellKnownQcMetrics = [
  "sample_identity_check",
  "min_sequencing_quality",
  "tumor_normal_pairing",
  "callable_region_coverage",
  "variant_calling_success",
  "expression_support",
  "hla_consensus_completeness",
] as const;

export type WellKnownQcMetric = (typeof wellKnownQcMetrics)[number];

export interface QcResult {
  metric: string;
  metricCategory?: WellKnownQcMetric;
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

// ─── HLA Disagreement (Wave 6) ──────────────────────────────────────

export const hlaDisagreementResolutions = [
  "toolA",
  "toolB",
  "majority",
  "unresolved",
] as const;

export type HlaDisagreementResolution =
  (typeof hlaDisagreementResolutions)[number];

export interface HlaDisagreementRecord {
  locus: string;
  toolA: string;
  toolAAllele: string;
  toolB: string;
  toolBAllele: string;
  resolution: HlaDisagreementResolution;
}

export interface HlaConsensusRecord {
  caseId: string;
  alleles: string[];
  perToolEvidence: HlaToolEvidence[];
  confidenceScore: number;
  operatorReviewThreshold: number;
  unresolvedDisagreementCount: number;
  manualReviewRequired: boolean;
  tieBreakNotes?: string;
  referenceVersion: string;
  producedAt: string;
  disagreements?: HlaDisagreementRecord[];
  confidenceDecomposition?: Record<string, number>;
}

export interface RetrievalProvenance {
  uri: string;
  retrievedAt: string;
  integrityHash: string;
}

export interface ReferenceBundleManifest {
  bundleId: string;
  genomeAssembly: string;
  annotationVersion: string;
  knownSitesVersion: string;
  hlaDatabaseVersion: string;
  frozenAt: string;
  transcriptSet?: string;
  callerBundleVersion?: string;
  pipelineRevision?: string;
  retrievalProvenance?: RetrievalProvenance;
}

// ─── Well-Known Workflow Names (Wave 7) ─────────────────────────────

export const wellKnownWorkflowNames = [
  "dna-qc",
  "somatic-calling",
  "annotation",
  "expression-support",
  "hla-typing",
  "combined-evidence",
] as const;

export type WellKnownWorkflowName = (typeof wellKnownWorkflowNames)[number];

/** Maps each well-known workflow to the artifact semantic types it is expected to produce. */
export const workflowArtifactContract: Readonly<
  Record<WellKnownWorkflowName, readonly DerivedArtifactSemanticType[]>
> = {
  "dna-qc": ["alignment-bam", "qc-summary-json"],
  "somatic-calling": ["somatic-vcf", "filtered-maf"],
  annotation: ["annotated-vcf"],
  "expression-support": ["expression-matrix"],
  "hla-typing": ["hla-calls", "hla-calls-raw"],
  "combined-evidence": ["board-evidence-bundle", "run-manifest-artifact"],
};

/** Maps each well-known workflow to workflows that must complete first. */
export const workflowDependencies: Readonly<
  Record<WellKnownWorkflowName, readonly WellKnownWorkflowName[]>
> = {
  "dna-qc": [],
  "somatic-calling": ["dna-qc"],
  annotation: ["somatic-calling"],
  "expression-support": [],
  "hla-typing": [],
  "combined-evidence": ["annotation", "expression-support", "hla-typing"],
};

// ─── Evidence Lineage (Wave 7) ──────────────────────────────────────

export interface EvidenceLineageEdge {
  producerRunId: string;
  producerWorkflow: string;
  artifactId: string;
  semanticType: DerivedArtifactSemanticType;
  consumerRunId: string;
  consumerWorkflow: string;
}

export interface EvidenceLineageGraph {
  edges: EvidenceLineageEdge[];
  roots: string[]; // runIds with no upstream dependencies
  terminal: string[]; // runIds that are not consumed by any downstream
}

// ─── Neoantigen Ranking (Wave 8) ────────────────────────────────────

export interface BindingAffinityEvidence {
  ic50nM: number;
  percentileRank: number;
}

export interface ExpressionSupportEvidence {
  tpm: number;
  variantAlleleFraction: number;
}

export interface ClonalityEvidence {
  vaf: number;
  isClonal: boolean;
}

export const selfFoldingRiskLevels = ["low", "medium", "high"] as const;
export type SelfFoldingRisk = (typeof selfFoldingRiskLevels)[number];

export interface ManufacturabilityEvidence {
  gcContent: number;
  selfFoldingRisk: SelfFoldingRisk;
}

export const toleranceRiskLevels = ["low", "medium", "high"] as const;
export type ToleranceRisk = (typeof toleranceRiskLevels)[number];

export interface SelfSimilarityEvidence {
  closestSelfPeptide: string;
  editDistance: number;
  toleranceRisk: ToleranceRisk;
}

export interface NeoantigenCandidate {
  candidateId: string;
  peptideSequence: string;
  hlaAllele: string;
  bindingAffinity: BindingAffinityEvidence;
  expressionSupport: ExpressionSupportEvidence;
  clonality: ClonalityEvidence;
  manufacturability: ManufacturabilityEvidence;
  selfSimilarity: SelfSimilarityEvidence;
  uncertaintyScore: number;
}

export interface RankingRationale {
  candidateId: string;
  rank: number;
  compositeScore: number;
  featureWeights: Record<string, number>;
  featureScores: Record<string, number>;
  uncertaintyContribution: number;
  explanation: string;
}

export interface ConfidenceInterval {
  lower: number;
  upper: number;
}

export const engineLicenseClasses = [
  "open",
  "restricted",
  "commercial",
] as const;
export type EngineLicenseClass = (typeof engineLicenseClasses)[number];

export interface RankingEngineMetadata {
  name: string;
  version: string;
  licenseClass: EngineLicenseClass;
  evidence?: string;
}

export interface RankingResult {
  caseId: string;
  rankedCandidates: RankingRationale[];
  ensembleMethod: string;
  confidenceInterval: ConfidenceInterval;
  rankedAt: string;
  engineMetadata?: RankingEngineMetadata;
}

// ─── RNA Construct Design (Wave 9) ──────────────────────────────────

export const deliveryModalities = [
  "conventional-mrna",
  "saRNA",
  "circRNA",
] as const;
export type DeliveryModality = (typeof deliveryModalities)[number];

export const epitopeLinkerStrategies = [
  "ggs-flexible",
  "aay-cleavage",
  "direct-fusion",
] as const;
export type EpitopeLinkerStrategy = (typeof epitopeLinkerStrategies)[number];

export interface CodonOptimizationMeta {
  algorithm: string;
  gcContentPercent: number;
  caiScore: number; // Codon Adaptation Index
}

export interface ManufacturabilityCheck {
  checkName: string;
  pass: boolean;
  detail: string;
  severity: "info" | "warning" | "blocking";
}

export interface ConstructDesignPackage {
  constructId: string;
  caseId: string;
  version: number;
  deliveryModality: DeliveryModality;
  linkerStrategy: EpitopeLinkerStrategy;
  sequence: string;
  designRationale: string;
  candidateIds: string[];
  codonOptimization: CodonOptimizationMeta;
  manufacturabilityChecks: ManufacturabilityCheck[];
  designedAt: string;
}

// ─── Outcomes & Learning Loop (Wave 10) ───────────────────────────

export const administrationRoutes = [
  "intramuscular",
  "subcutaneous",
  "intravenous",
] as const;
export type AdministrationRoute = (typeof administrationRoutes)[number];

export const clinicalResponseCategories = [
  "CR",
  "PR",
  "SD",
  "PD",
  "NE",
] as const;
export type ClinicalResponseCategory =
  (typeof clinicalResponseCategories)[number];

export interface AdministrationRecord {
  administrationId: string;
  caseId: string;
  constructId: string;
  constructVersion: number;
  administeredAt: string;
  route: AdministrationRoute;
  doseMicrograms: number;
  batchId?: string;
  notes?: string;
}

export interface ImmuneMonitoringRecord {
  monitoringId: string;
  caseId: string;
  constructId: string;
  constructVersion: number;
  collectedAt: string;
  assayType: string;
  biomarker: string;
  value: number;
  unit: string;
  baselineDelta?: number;
  notes?: string;
}

export interface ClinicalFollowUpRecord {
  followUpId: string;
  caseId: string;
  constructId: string;
  constructVersion: number;
  evaluatedAt: string;
  responseCategory: ClinicalResponseCategory;
  progressionFreeDays?: number;
  overallSurvivalDays?: number;
  notes?: string;
}

export const outcomeEntryTypes = [
  "administration",
  "immune-monitoring",
  "clinical-follow-up",
] as const;
export type OutcomeEntryType = (typeof outcomeEntryTypes)[number];

export type OutcomeTimelineEntry =
  | {
      entryId: string;
      caseId: string;
      constructId: string;
      constructVersion: number;
      entryType: "administration";
      occurredAt: string;
      administration: AdministrationRecord;
    }
  | {
      entryId: string;
      caseId: string;
      constructId: string;
      constructVersion: number;
      entryType: "immune-monitoring";
      occurredAt: string;
      immuneMonitoring: ImmuneMonitoringRecord;
    }
  | {
      entryId: string;
      caseId: string;
      constructId: string;
      constructVersion: number;
      entryType: "clinical-follow-up";
      occurredAt: string;
      clinicalFollowUp: ClinicalFollowUpRecord;
    };

export interface FullTraceabilityRecord {
  caseId: string;
  rankedCandidateIds: string[];
  constructId: string;
  constructVersion: number;
  constructCandidateIds: string[];
  timeline: OutcomeTimelineEntry[];
  administrations: AdministrationRecord[];
  immuneMonitoringRecords: ImmuneMonitoringRecord[];
  clinicalFollowUpRecords: ClinicalFollowUpRecord[];
  reviewOutcomes: ReviewOutcomeRecord[];
  handoffPackets: HandoffPacketRecord[];
}

// ─── Case Event Journal (Wave 2 Foundation) ───────────────────────

export const caseDomainEventTypes = [
  "case.created",
  "sample.registered",
  "artifact.registered",
  "workflow.requested",
  "workflow.started",
  "workflow.completed",
  "workflow.cancelled",
  "workflow.failed",
  "hla.consensus.produced",
  "qc.evaluated",
  "board.packet.generated",
  "review.outcome.recorded",
  "final.release.authorized",
  "handoff.packet.generated",
  "neoantigen.ranking.recorded",
  "construct.design.recorded",
  "administration.recorded",
  "immune-monitoring.recorded",
  "clinical-follow-up.recorded",
  "consent.updated",
  "revision.restarted",
  "hla.review.resolved",
] as const;

export type CaseDomainEventType = (typeof caseDomainEventTypes)[number];

export type DomainEventInput<TType extends string, TPayload> = {
  eventId: string;
  aggregateId: string;
  aggregateType: "case";
  type: TType;
  occurredAt: string;
  updatedAt: string;
  correlationId: string;
  actorId: string;
  authMechanism: AuthMechanism;
  payload: TPayload;
};

export type DomainEventRecord<
  TType extends string,
  TPayload,
> = DomainEventInput<TType, TPayload> & {
  version: number;
};

export interface CaseCreatedEventPayload {
  createdAt: string;
  status: CaseStatus;
  caseProfile: CaseProfile;
}

export interface SampleRegisteredEventPayload {
  sample: SampleRecord;
  nextStatus: CaseStatus;
  workflowGateOpened: boolean;
}

export interface ArtifactRegisteredEventPayload {
  artifact: ArtifactRecord;
  nextStatus: CaseStatus;
  workflowGateOpened: boolean;
}

export interface WorkflowRequestedEventPayload {
  request: WorkflowRequestRecord;
  nextStatus: CaseStatus;
}

export interface WorkflowStartedEventPayload {
  run: WorkflowRunRecord;
  nextStatus: CaseStatus;
}

export interface WorkflowCompletedEventPayload {
  run: WorkflowRunRecord;
  derivedArtifacts: RunArtifact[];
  nextStatus: CaseStatus;
}

export interface WorkflowCancelledEventPayload {
  run: WorkflowRunRecord;
  nextStatus: CaseStatus;
}

export interface WorkflowFailedEventPayload {
  run: WorkflowRunRecord;
  nextStatus: CaseStatus;
}

export interface HlaConsensusProducedEventPayload {
  consensus: HlaConsensusRecord;
}

export interface QcEvaluatedEventPayload {
  runId: string;
  gate: QcGateRecord;
  nextStatus: CaseStatus;
}

export interface BoardPacketGeneratedEventPayload {
  packet: BoardPacketRecord;
  nextStatus: CaseStatus;
}

export interface ReviewOutcomeRecordedEventPayload {
  reviewOutcome: ReviewOutcomeRecord;
  nextStatus: CaseStatus;
}

export interface FinalReleaseAuthorizedEventPayload {
  reviewOutcome: ReviewOutcomeRecord;
  nextStatus: CaseStatus;
}

export interface HandoffPacketGeneratedEventPayload {
  handoffPacket: HandoffPacketRecord;
  nextStatus: CaseStatus;
}

export interface NeoantigenRankingRecordedEventPayload {
  ranking: RankingResult;
}

export interface ConstructDesignRecordedEventPayload {
  constructDesign: ConstructDesignPackage;
}

export interface AdministrationRecordedEventPayload {
  entry: Extract<OutcomeTimelineEntry, { entryType: "administration" }>;
}

export interface ImmuneMonitoringRecordedEventPayload {
  entry: Extract<OutcomeTimelineEntry, { entryType: "immune-monitoring" }>;
}

export interface ClinicalFollowUpRecordedEventPayload {
  entry: Extract<OutcomeTimelineEntry, { entryType: "clinical-follow-up" }>;
}

export interface ConsentUpdatedEventPayload {
  consentStatus: ConsentStatus;
  nextStatus: CaseStatus;
}

export interface RevisionRestartedEventPayload {
  nextStatus: CaseStatus;
}

export interface HlaReviewResolvedEventPayload {
  rationale: string;
  nextStatus: CaseStatus;
}

export type CaseDomainEventInput =
  | DomainEventInput<"case.created", CaseCreatedEventPayload>
  | DomainEventInput<"sample.registered", SampleRegisteredEventPayload>
  | DomainEventInput<"artifact.registered", ArtifactRegisteredEventPayload>
  | DomainEventInput<"workflow.requested", WorkflowRequestedEventPayload>
  | DomainEventInput<"workflow.started", WorkflowStartedEventPayload>
  | DomainEventInput<"workflow.completed", WorkflowCompletedEventPayload>
  | DomainEventInput<"workflow.cancelled", WorkflowCancelledEventPayload>
  | DomainEventInput<"workflow.failed", WorkflowFailedEventPayload>
  | DomainEventInput<"hla.consensus.produced", HlaConsensusProducedEventPayload>
  | DomainEventInput<"qc.evaluated", QcEvaluatedEventPayload>
  | DomainEventInput<"board.packet.generated", BoardPacketGeneratedEventPayload>
  | DomainEventInput<
      "review.outcome.recorded",
      ReviewOutcomeRecordedEventPayload
    >
  | DomainEventInput<
      "final.release.authorized",
      FinalReleaseAuthorizedEventPayload
    >
  | DomainEventInput<
      "handoff.packet.generated",
      HandoffPacketGeneratedEventPayload
    >
  | DomainEventInput<
      "neoantigen.ranking.recorded",
      NeoantigenRankingRecordedEventPayload
    >
  | DomainEventInput<
      "construct.design.recorded",
      ConstructDesignRecordedEventPayload
    >
  | DomainEventInput<
      "administration.recorded",
      AdministrationRecordedEventPayload
    >
  | DomainEventInput<
      "immune-monitoring.recorded",
      ImmuneMonitoringRecordedEventPayload
    >
  | DomainEventInput<
      "clinical-follow-up.recorded",
      ClinicalFollowUpRecordedEventPayload
    >
  | DomainEventInput<"consent.updated", ConsentUpdatedEventPayload>
  | DomainEventInput<"revision.restarted", RevisionRestartedEventPayload>
  | DomainEventInput<"hla.review.resolved", HlaReviewResolvedEventPayload>;

export type CaseDomainEventRecord =
  | DomainEventRecord<"case.created", CaseCreatedEventPayload>
  | DomainEventRecord<"sample.registered", SampleRegisteredEventPayload>
  | DomainEventRecord<"artifact.registered", ArtifactRegisteredEventPayload>
  | DomainEventRecord<"workflow.requested", WorkflowRequestedEventPayload>
  | DomainEventRecord<"workflow.started", WorkflowStartedEventPayload>
  | DomainEventRecord<"workflow.completed", WorkflowCompletedEventPayload>
  | DomainEventRecord<"workflow.cancelled", WorkflowCancelledEventPayload>
  | DomainEventRecord<"workflow.failed", WorkflowFailedEventPayload>
  | DomainEventRecord<
      "hla.consensus.produced",
      HlaConsensusProducedEventPayload
    >
  | DomainEventRecord<"qc.evaluated", QcEvaluatedEventPayload>
  | DomainEventRecord<
      "board.packet.generated",
      BoardPacketGeneratedEventPayload
    >
  | DomainEventRecord<
      "review.outcome.recorded",
      ReviewOutcomeRecordedEventPayload
    >
  | DomainEventRecord<
      "final.release.authorized",
      FinalReleaseAuthorizedEventPayload
    >
  | DomainEventRecord<
      "handoff.packet.generated",
      HandoffPacketGeneratedEventPayload
    >
  | DomainEventRecord<
      "neoantigen.ranking.recorded",
      NeoantigenRankingRecordedEventPayload
    >
  | DomainEventRecord<
      "construct.design.recorded",
      ConstructDesignRecordedEventPayload
    >
  | DomainEventRecord<
      "administration.recorded",
      AdministrationRecordedEventPayload
    >
  | DomainEventRecord<
      "immune-monitoring.recorded",
      ImmuneMonitoringRecordedEventPayload
    >
  | DomainEventRecord<
      "clinical-follow-up.recorded",
      ClinicalFollowUpRecordedEventPayload
    >
  | DomainEventRecord<"consent.updated", ConsentUpdatedEventPayload>
  | DomainEventRecord<"revision.restarted", RevisionRestartedEventPayload>
  | DomainEventRecord<"hla.review.resolved", HlaReviewResolvedEventPayload>;

// ─── Horizon Modality Gate (Wave 11) ───────────────────────────────

export const modalityMaturityLevels = [
  "research",
  "preclinical",
  "clinical",
  "validated",
] as const;
export type ModalityMaturityLevel = (typeof modalityMaturityLevels)[number];

export interface HorizonModality {
  modality: DeliveryModality;
  maturityLevel: ModalityMaturityLevel;
  enabledByDefault: boolean;
  isEnabled: boolean;
  activationReason?: string;
  activatedAt?: string;
}

// ─── Immutable Run Manifest (Wave 2) ────────────────────────────────

export interface ManifestInputArtifact {
  artifactId: string;
  semanticType: string;
  artifactHash: string;
}

export interface ManifestReferenceAsset {
  assetKind: string;
  uri: string;
  checksum: string;
}

export interface ManifestReferenceBundle {
  bundleId: string;
  genomeAssembly: string;
  assets: ManifestReferenceAsset[];
}

export interface ManifestSampleSnapshot {
  sampleId: string;
  sampleType: string;
  assayType: string;
}

export interface WorkflowRunManifest {
  manifestVersion: number;
  executorKind: string;
  workflowName: string;
  workflowRevision: string;
  configProfile: string;
  submissionIntent: string;
  acceptedAt: string;
  inputArtifactSet: ManifestInputArtifact[];
  pinnedReferenceBundle: ManifestReferenceBundle;
  sampleSnapshot: ManifestSampleSnapshot;
  hlaSnapshot?: Record<string, unknown>;
  expectedOutputManifestUri?: string;
  reportUri?: string;
  traceUri?: string;
}

export interface StartWorkflowRunInput {
  runId: string;
  manifest?: WorkflowRunManifest;
}

export interface CompleteWorkflowRunInput {
  derivedArtifacts?: Array<{
    semanticType: DerivedArtifactSemanticType;
    artifactHash: string;
    producingStep: string;
  }>;
}

export interface FailWorkflowRunInput {
  reason: string;
  failureCategory?: WorkflowFailureCategory;
}

export interface RecordHlaConsensusInput {
  alleles: string[];
  perToolEvidence: HlaToolEvidence[];
  confidenceScore: number;
  operatorReviewThreshold?: number;
  tieBreakNotes?: string;
  referenceVersion: string;
}

export interface EvaluateQcGateInput {
  results: Array<{
    metric: string;
    metricCategory?: WellKnownQcMetric;
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
  pinnedReferenceBundles: ReferenceBundleManifest[];
  derivedArtifacts: RunArtifact[];
  hlaConsensus: HlaConsensusRecord;
  latestQcGate: QcGateRecord;
  hlaToolBreakdown?: HlaToolEvidence[];
  hlaDisagreements?: HlaDisagreementRecord[];
  bundleRetrievalProvenance?: RetrievalProvenance[];
  evidenceLineage?: EvidenceLineageGraph;
  neoantigenRanking?: RankingResult;
  constructDesign?: ConstructDesignPackage;
  hlaManualReviewRequired?: boolean;
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

// ─── Wave 15: Review Outcome + Manufacturing Handoff ───────────────

export const reviewDispositions = [
  "approved",
  "rejected",
  "revision-requested",
] as const;
export type ReviewDisposition = (typeof reviewDispositions)[number];

export interface SignatureManifestation {
  meaning: "review" | "release" | "consent";
  signedBy: string;
  signedAt: string;
  signatureHash: string;
  signatureMethod: string;
}

export interface RecordReviewOutcomeInput {
  packetId: string;
  reviewerId: string;
  reviewerRole?: string;
  reviewDisposition: ReviewDisposition;
  rationale: string;
  comments?: string;
  signatureManifestation?: SignatureManifestation;
}

export interface FinalReleaseRecord {
  releaserId: string;
  releaserRole?: string;
  rationale: string;
  comments?: string;
  signatureManifestation?: SignatureManifestation;
  releasedAt: string;
}

export interface ReviewOutcomeRecord {
  reviewId: string;
  caseId: string;
  packetId: string;
  reviewerId: string;
  reviewerRole?: string;
  reviewDisposition: ReviewDisposition;
  rationale: string;
  comments?: string;
  signatureManifestation?: SignatureManifestation;
  finalRelease?: FinalReleaseRecord;
  reviewedAt: string;
}

export interface ReviewOutcomeResult {
  case: CaseRecord;
  reviewOutcome: ReviewOutcomeRecord;
  created: boolean;
}

export interface AuthorizeFinalReleaseInput {
  reviewId: string;
  releaserId: string;
  releaserRole?: string;
  rationale: string;
  comments?: string;
  signatureManifestation?: SignatureManifestation;
}

export interface FinalReleaseAuthorizationResult {
  case: CaseRecord;
  reviewOutcome: ReviewOutcomeRecord;
  created: boolean;
}

export interface GenerateHandoffPacketInput {
  reviewId: string;
  handoffTarget: string;
  requestedBy: string;
  turnaroundDays: number;
  notes?: string;
}

export interface HandoffPacketBoardReference {
  packetId: string;
  boardRoute: string;
  version: number;
  packetHash: string;
  createdAt: string;
}

export interface HandoffPacketSnapshot {
  caseSummary: BoardPacketCaseSummary;
  boardPacket: HandoffPacketBoardReference;
  reviewOutcome: ReviewOutcomeRecord;
  constructDesign: ConstructDesignPackage;
  handoffTarget: string;
  requestedBy: string;
  turnaroundDays: number;
  notes?: string;
}

export interface HandoffPacketRecord {
  handoffId: string;
  caseId: string;
  reviewId: string;
  packetId: string;
  artifactClass: "HANDOFF_PACKET";
  constructId: string;
  constructVersion: number;
  handoffTarget: string;
  schemaVersion: number;
  packetHash: string;
  createdAt: string;
  snapshot: HandoffPacketSnapshot;
}

export interface HandoffPacketGenerationResult {
  case: CaseRecord;
  handoff: HandoffPacketRecord;
  created: boolean;
}

// ─── Workflow Output Manifest (Wave 5) ──────────────────────────────

export interface OutputManifestDerivedArtifact {
  artifactId: string;
  semanticType: DerivedArtifactSemanticType;
  artifactHash: string;
  producingStep: string;
  storageUri?: string;
}

export interface OutputManifestQcSummary {
  outcome: QcGateOutcome;
  results: QcResult[];
  evaluatedAt: string;
}

export interface WorkflowOutputManifest {
  outputManifestVersion: number;
  runId: string;
  caseId: string;
  workflowName: string;
  executionProfile: string;
  completedAt: string;
  durationMs: number;
  derivedArtifacts: OutputManifestDerivedArtifact[];
  qcSummary: OutputManifestQcSummary;
  inputManifestReference: {
    manifestVersion: number;
    workflowRevision: string;
    configProfile: string;
  };
  provenanceChain: {
    referenceBundleId: string;
    genomeAssembly: string;
    executorVersion: string;
    pipelineRevision?: string;
  };
}
