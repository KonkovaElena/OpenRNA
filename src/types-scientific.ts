// ─── Evidence Lineage ───────────────────────────────────────────────

export interface EvidenceLineageEdge {
  producerRunId: string;
  producerWorkflow: string;
  artifactId: string;
  semanticType: import("./types-core").DerivedArtifactSemanticType;
  consumerRunId: string;
  consumerWorkflow: string;
}

export interface EvidenceLineageGraph {
  edges: EvidenceLineageEdge[];
  roots: string[]; // runIds with no upstream dependencies
  terminal: string[]; // runIds that are not consumed by any downstream
}

// ─── Neoantigen Ranking ─────────────────────────────────────────────

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

export const engineLicenseClasses = ["open", "restricted", "commercial"] as const;
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

// ─── RNA Construct Design ───────────────────────────────────────────

export const deliveryModalities = ["conventional-mrna", "saRNA", "circRNA"] as const;
export type DeliveryModality = (typeof deliveryModalities)[number];

export const epitopeLinkerStrategies = ["ggs-flexible", "aay-cleavage", "direct-fusion"] as const;
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

// ─── Outcomes & Learning Loop ───────────────────────────────────────

export const administrationRoutes = ["intramuscular", "subcutaneous", "intravenous"] as const;
export type AdministrationRoute = (typeof administrationRoutes)[number];

export const clinicalResponseCategories = ["CR", "PR", "SD", "PD", "NE"] as const;
export type ClinicalResponseCategory = (typeof clinicalResponseCategories)[number];

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

export const outcomeEntryTypes = ["administration", "immune-monitoring", "clinical-follow-up"] as const;
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
  reviewOutcomes: import("./types-review").ReviewOutcomeRecord[];
  handoffPackets: import("./types-review").HandoffPacketRecord[];
}

// ─── Horizon Modality Gate ──────────────────────────────────────────

export const modalityMaturityLevels = ["research", "preclinical", "clinical", "validated"] as const;
export type ModalityMaturityLevel = (typeof modalityMaturityLevels)[number];

export interface HorizonModality {
  modality: DeliveryModality;
  maturityLevel: ModalityMaturityLevel;
  enabledByDefault: boolean;
  isEnabled: boolean;
  activationReason?: string;
  activatedAt?: string;
}
