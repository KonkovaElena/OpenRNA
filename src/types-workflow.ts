// ─── Workflow Run Backbone ──────────────────────────────────────────

export const workflowRunStatuses = ["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"] as const;

export type WorkflowRunStatus = (typeof workflowRunStatuses)[number];

export const qcGateOutcomes = ["PASSED", "FAILED", "WARN"] as const;

export type QcGateOutcome = (typeof qcGateOutcomes)[number];

export interface WorkflowTerminalMetadata {
  durationMs: number;
  executorVersion: string;
  resourceSummary?: Record<string, unknown>;
}

// ─── Nextflow Executor Types ────────────────────────────────────────

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

export const nextflowRunStates = ["submitted", "running", "completed", "failed", "cancelled", "unknown"] as const;

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

export const nextflowExitCodeMapping: Readonly<Record<number, import("./types-core").WorkflowFailureCategory>> = {
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
  workflowName: string;
  referenceBundleId: string;
  pinnedReferenceBundle?: ReferenceBundleManifest;
  executionProfile: string;
  status: WorkflowRunStatus;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  failedAt?: string;
  failureReason?: string;
  failureCategory?: import("./types-core").WorkflowFailureCategory;
  terminalMetadata?: WorkflowTerminalMetadata;
  manifest?: WorkflowRunManifest;
}

// ─── Well-Known QC Metrics ──────────────────────────────────────────

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

// ─── HLA Types ──────────────────────────────────────────────────────

export interface HlaToolEvidence {
  toolName: string;
  alleles: string[];
  confidence: number;
  rawOutput?: string;
}

export const hlaDisagreementResolutions = ["toolA", "toolB", "majority", "unresolved"] as const;

export type HlaDisagreementResolution = (typeof hlaDisagreementResolutions)[number];

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

// ─── Well-Known Workflow Names ──────────────────────────────────────

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
  Record<WellKnownWorkflowName, readonly import("./types-core").DerivedArtifactSemanticType[]>
> = {
  "dna-qc": ["alignment-bam", "qc-summary-json"],
  "somatic-calling": ["somatic-vcf", "filtered-maf"],
  annotation: ["annotated-vcf"],
  "expression-support": ["expression-matrix"],
  "hla-typing": ["hla-calls", "hla-calls-raw"],
  "combined-evidence": ["board-evidence-bundle", "run-manifest-artifact"],
};

/** Maps each well-known workflow to workflows that must complete first. */
export const workflowDependencies: Readonly<Record<WellKnownWorkflowName, readonly WellKnownWorkflowName[]>> = {
  "dna-qc": [],
  "somatic-calling": ["dna-qc"],
  annotation: ["somatic-calling"],
  "expression-support": [],
  "hla-typing": [],
  "combined-evidence": ["annotation", "expression-support", "hla-typing"],
};

// ─── Immutable Run Manifest ─────────────────────────────────────────

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
    semanticType: import("./types-core").DerivedArtifactSemanticType;
    artifactHash: string;
    producingStep: string;
  }>;
}

export interface FailWorkflowRunInput {
  reason: string;
  failureCategory?: import("./types-core").WorkflowFailureCategory;
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
