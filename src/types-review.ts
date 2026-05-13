// ─── Board Packets ──────────────────────────────────────────────────

export interface BoardPacketCaseSummary {
  caseId: string;
  status: import("./types-core").CaseStatus;
  indication: string;
  siteId: string;
  protocolVersion: string;
  boardRoute: string;
}

export interface BoardPacketSnapshot {
  caseSummary: BoardPacketCaseSummary;
  workflowRuns: import("./types-workflow").WorkflowRunRecord[];
  pinnedReferenceBundles: import("./types-workflow").ReferenceBundleManifest[];
  derivedArtifacts: import("./types-core").RunArtifact[];
  hlaConsensus: import("./types-workflow").HlaConsensusRecord;
  latestQcGate: import("./types-workflow").QcGateRecord;
  hlaToolBreakdown?: import("./types-workflow").HlaToolEvidence[];
  hlaDisagreements?: import("./types-workflow").HlaDisagreementRecord[];
  bundleRetrievalProvenance?: import("./types-workflow").RetrievalProvenance[];
  evidenceLineage?: import("./types-scientific").EvidenceLineageGraph;
  neoantigenRanking?: import("./types-scientific").RankingResult;
  constructDesign?: import("./types-scientific").ConstructDesignPackage;
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
  case: import("./types").CaseRecord;
  packet: BoardPacketRecord;
  created: boolean;
}

// ─── Review Outcome + Manufacturing Handoff ─────────────────────────

export const reviewDispositions = ["approved", "rejected", "revision-requested"] as const;
export type ReviewDisposition = (typeof reviewDispositions)[number];

export interface SignatureManifestation {
  meaning: "review" | "release" | "consent";
  signedBy: string;
  signedAt: string;
  signatureHash: string;
  signatureMethod: string;
  /**
   * Server-side HMAC-SHA256 seal computed from (caseId | recordId | signedBy |
   * meaning | signedAt) keyed with `SIGNATURE_SEAL_KEY`.
   *
   * When present, the server verifies this field on read and rejects tampered
   * records. Satisfies 21 CFR Part 11 §11.70 (electronic signature / record
   * linking) and FDA Data Integrity Guidance 2018 ALCOA+ Accurate principle.
   */
  serverSeal?: string;
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
  case: import("./types").CaseRecord;
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
  case: import("./types").CaseRecord;
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
  constructDesign: import("./types-scientific").ConstructDesignPackage;
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
  case: import("./types").CaseRecord;
  handoff: HandoffPacketRecord;
  created: boolean;
}

// ─── Workflow Output Manifest ─────────────────────────────────────

export interface OutputManifestDerivedArtifact {
  artifactId: string;
  semanticType: import("./types-core").DerivedArtifactSemanticType;
  artifactHash: string;
  producingStep: string;
  storageUri?: string;
}

export interface OutputManifestQcSummary {
  outcome: import("./types-workflow").QcGateOutcome;
  results: import("./types-workflow").QcResult[];
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
