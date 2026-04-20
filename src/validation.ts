import { z, type ZodError } from "zod";
import { ApiError } from "./errors";
import {
  administrationRoutes,
  assayTypes,
  clinicalResponseCategories,
  consentStatuses,
  deliveryModalities,
  derivedArtifactSemanticTypes,
  qcGateOutcomes,
  reviewDispositions,
  sampleTypes,
  selfFoldingRiskLevels,
  sourceArtifactSemanticTypes,
  toleranceRiskLevels,
  wellKnownQcMetrics,
  workflowFailureCategories,
  type AssayType,
  type AdministrationRecord,
  type CaseProfile,
  type ClinicalFollowUpRecord,
  type CompleteWorkflowRunInput,
  type ConsentStatus,
  type CreateCaseInput,
  type DeliveryModality,
  type DerivedArtifactSemanticType,
  type EvaluateQcGateInput,
  type ImmuneMonitoringRecord,
  type FailWorkflowRunInput,
  type HlaToolEvidence,
  type NeoantigenCandidate,
  type RankingRationale,
  type ReferenceBundleManifest,
  type RecordHlaConsensusInput,
  type RecordReviewOutcomeInput,
  type RegisterArtifactInput,
  type RegisterSampleInput,
  type RequestWorkflowInput,
  type SampleType,
  type StartWorkflowRunInput,
  type GenerateHandoffPacketInput,
  type WorkflowOutputManifest,
  type WorkflowRunManifest,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(fieldName: string) {
  return z.string({ error: `${fieldName} is required.` }).trim().min(1, `${fieldName} is required.`);
}

function optionalText(fieldName: string) {
  return z.preprocess(
    (value) => {
      if (value === undefined || value === null) {
        return undefined;
      }

      if (typeof value !== "string") {
        return value;
      }

      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    },
    z.string({ error: `${fieldName} must be a string.` }).trim().optional(),
  );
}

function positiveInteger(fieldName: string) {
  return z.number({ error: `${fieldName} must be a positive integer.` }).int().min(1, `${fieldName} must be a positive integer.`);
}

function numberField(fieldName: string) {
  return z.number({ error: `${fieldName} must be a number.` });
}

function isoTimestamp(fieldName: string) {
  return z.string({ error: `${fieldName} is required.` })
    .trim()
    .min(1, `${fieldName} is required.`)
    .datetime({ message: `${fieldName} must be a valid ISO 8601 timestamp.` });
}

function booleanField(fieldName: string) {
  return z.boolean({ error: `${fieldName} must be a boolean.` });
}

function enumText<const TValues extends readonly [string, ...string[]]>(
  values: TValues,
  fieldName: string,
  unsupportedMessage: string,
) {
  return requiredText(fieldName).refine((value): value is TValues[number] => values.includes(value as TValues[number]), {
    message: unsupportedMessage,
  });
}

function nonEmptyStringArray(fieldName: string, itemFieldName: string) {
  return z.array(requiredText(itemFieldName), {
    error: `${fieldName} must be a non-empty array of strings.`,
  }).min(1, `${fieldName} must be a non-empty array of strings.`);
}

function firstIssueMessage(error: ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

function parseObjectWithSchema<T>(
  value: unknown,
  schema: z.ZodType<T>,
  nextStep: string,
): T {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_input", "Request body must be an object.", nextStep);
  }

  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(400, "invalid_input", firstIssueMessage(result.error), nextStep);
  }

  return result.data;
}

const caseProfileSchema = z.object({
  patientKey: requiredText("caseProfile.patientKey"),
  indication: requiredText("caseProfile.indication"),
  siteId: requiredText("caseProfile.siteId"),
  protocolVersion: requiredText("caseProfile.protocolVersion"),
  consentStatus: enumText(consentStatuses, "caseProfile.consentStatus", "Unsupported consent status.").transform(
    (value) => value as ConsentStatus,
  ),
  boardRoute: optionalText("caseProfile.boardRoute"),
}).strict() satisfies z.ZodType<CaseProfile>;

const createCaseInputSchema = z.object({
  caseProfile: caseProfileSchema,
}).strict() satisfies z.ZodType<CreateCaseInput>;

const registerSampleInputSchema = z.object({
  sampleId: requiredText("sampleId"),
  sampleType: enumText(sampleTypes, "sampleType", "Unsupported sample type.").transform(
    (value) => value as SampleType,
  ),
  assayType: enumText(assayTypes, "assayType", "Unsupported assay type.").transform(
    (value) => value as AssayType,
  ),
  accessionId: requiredText("accessionId"),
  sourceSite: requiredText("sourceSite"),
}).strict() satisfies z.ZodType<RegisterSampleInput>;

const registerArtifactInputSchema = z.object({
  sampleId: requiredText("sampleId"),
  semanticType: enumText(
    sourceArtifactSemanticTypes,
    "semanticType",
    "Unsupported source artifact semantic type.",
  ),
  schemaVersion: positiveInteger("schemaVersion"),
  artifactHash: requiredText("artifactHash"),
  storageUri: optionalText("storageUri"),
  mediaType: optionalText("mediaType"),
}).strict() satisfies z.ZodType<RegisterArtifactInput>;

const requestWorkflowInputSchema = z.object({
  workflowName: requiredText("workflowName"),
  referenceBundleId: requiredText("referenceBundleId"),
  executionProfile: requiredText("executionProfile"),
  requestedBy: optionalText("requestedBy"),
  idempotencyKey: optionalText("idempotencyKey"),
}).strict() satisfies z.ZodType<RequestWorkflowInput>;

const startWorkflowRunInputSchema = z.object({
  runId: requiredText("runId"),
}).strict() satisfies z.ZodType<StartWorkflowRunInput>;

const completeWorkflowRunInputSchema = z.object({
  derivedArtifacts: z.array(
    z.object({
      semanticType: enumText(
        derivedArtifactSemanticTypes,
        "derivedArtifacts[].semanticType",
        "Unsupported derived artifact semantic type.",
      ).transform((value) => value as DerivedArtifactSemanticType),
      artifactHash: requiredText("derivedArtifacts[].artifactHash"),
      producingStep: requiredText("derivedArtifacts[].producingStep"),
    }).strict(),
    { error: "derivedArtifacts must be an array of artifact objects." },
  ).default([]),
}).strict() satisfies z.ZodType<CompleteWorkflowRunInput>;

const failWorkflowRunInputSchema = z.object({
  reason: requiredText("reason"),
  failureCategory: z.enum(workflowFailureCategories, {
    error: "failureCategory must be one of: " + workflowFailureCategories.join(", "),
  }).optional(),
}).strict() satisfies z.ZodType<FailWorkflowRunInput>;

const manifestInputArtifactSchema = z.object({
  artifactId: requiredText("inputArtifactSet[].artifactId"),
  semanticType: requiredText("inputArtifactSet[].semanticType"),
  artifactHash: requiredText("inputArtifactSet[].artifactHash"),
}).strict();

const manifestReferenceAssetSchema = z.object({
  assetKind: requiredText("assets[].assetKind"),
  uri: requiredText("assets[].uri"),
  checksum: requiredText("assets[].checksum"),
}).strict();

const manifestReferenceBundleSchema = z.object({
  bundleId: requiredText("pinnedReferenceBundle.bundleId"),
  genomeAssembly: requiredText("pinnedReferenceBundle.genomeAssembly"),
  assets: z.array(manifestReferenceAssetSchema, {
    error: "pinnedReferenceBundle.assets must be an array.",
  }),
}).strict();

const manifestSampleSnapshotSchema = z.object({
  sampleId: requiredText("sampleSnapshot.sampleId"),
  sampleType: requiredText("sampleSnapshot.sampleType"),
  assayType: requiredText("sampleSnapshot.assayType"),
}).strict();

const workflowRunManifestSchema = z.object({
  manifestVersion: numberField("manifestVersion"),
  executorKind: requiredText("executorKind"),
  workflowName: requiredText("workflowName"),
  workflowRevision: requiredText("workflowRevision"),
  configProfile: requiredText("configProfile"),
  submissionIntent: requiredText("submissionIntent"),
  acceptedAt: isoTimestamp("acceptedAt"),
  inputArtifactSet: z.array(manifestInputArtifactSchema, {
    error: "inputArtifactSet must be an array of artifact objects.",
  }),
  pinnedReferenceBundle: manifestReferenceBundleSchema,
  sampleSnapshot: manifestSampleSnapshotSchema,
  hlaSnapshot: z.record(z.string(), z.unknown()).optional(),
  expectedOutputManifestUri: optionalText("expectedOutputManifestUri"),
  reportUri: optionalText("reportUri"),
  traceUri: optionalText("traceUri"),
}).strict() satisfies z.ZodType<WorkflowRunManifest>;

const hlaToolEvidenceSchema = z.object({
  toolName: requiredText("perToolEvidence[].toolName"),
  alleles: nonEmptyStringArray("perToolEvidence[].alleles", "perToolEvidence[].alleles[]"),
  confidence: numberField("perToolEvidence[].confidence")
    .finite()
    .min(0, "confidence must be between 0 and 1.")
    .max(1, "confidence must be between 0 and 1.")
    .multipleOf(0.001, "confidence must have at most 3 decimal places."),
  rawOutput: optionalText("perToolEvidence[].rawOutput"),
}).strict() satisfies z.ZodType<HlaToolEvidence>;

const recordHlaConsensusInputSchema = z.object({
  alleles: nonEmptyStringArray("alleles", "alleles[]"),
  perToolEvidence: z.array(hlaToolEvidenceSchema, {
    error: "perToolEvidence must be a non-empty array.",
  }).min(1, "perToolEvidence must be a non-empty array."),
  confidenceScore: numberField("confidenceScore")
    .finite()
    .min(0, "confidenceScore must be between 0 and 1.")
    .max(1, "confidenceScore must be between 0 and 1.")
    .multipleOf(0.001, "confidenceScore must have at most 3 decimal places."),
  tieBreakNotes: optionalText("tieBreakNotes"),
  referenceVersion: requiredText("referenceVersion"),
}).strict() satisfies z.ZodType<RecordHlaConsensusInput>;

const evaluateQcGateInputSchema = z.object({
  results: z.array(
    z.object({
      metric: requiredText("results[].metric"),
      metricCategory: z.enum(wellKnownQcMetrics, {
        error: "metricCategory must be a known QC metric.",
      }).optional(),
      value: numberField("results[].value"),
      threshold: numberField("results[].threshold"),
      pass: booleanField("results[].pass"),
      notes: optionalText("results[].notes"),
    }).strict(),
    { error: "results must be a non-empty array." },
  ).min(1, "results must be a non-empty array."),
}).strict() satisfies z.ZodType<EvaluateQcGateInput>;

type DesignConstructInput = {
  rankedCandidates: RankingRationale[];
  deliveryModality?: DeliveryModality;
};

type RecordNeoantigenRankingInput = {
  candidates: NeoantigenCandidate[];
};

export type ActivateModalityInput = {
  activationReason: string;
};

type RecordAdministrationInput = Omit<AdministrationRecord, "caseId">;
type RecordImmuneMonitoringInput = Omit<ImmuneMonitoringRecord, "caseId">;
type RecordClinicalFollowUpInput = Omit<ClinicalFollowUpRecord, "caseId">;

const rankingRationaleSchema = z.object({
  candidateId: requiredText("rankedCandidates[].candidateId"),
  rank: positiveInteger("rankedCandidates[].rank"),
  compositeScore: numberField("rankedCandidates[].compositeScore")
    .finite()
    .min(0, "compositeScore must be between 0 and 1.")
    .max(1, "compositeScore must be between 0 and 1.")
    .multipleOf(0.001, "compositeScore must have at most 3 decimal places."),
  featureWeights: z.record(z.string(), z.number(), {
    error: "rankedCandidates[].featureWeights must be an object of numeric weights.",
  }),
  featureScores: z.record(z.string(), z.number(), {
    error: "rankedCandidates[].featureScores must be an object of numeric scores.",
  }),
  uncertaintyContribution: numberField("rankedCandidates[].uncertaintyContribution")
    .finite()
    .min(0, "uncertaintyContribution must be >= 0.")
    .max(1, "uncertaintyContribution must be <= 1.")
    .multipleOf(0.001, "uncertaintyContribution must have at most 3 decimal places."),
  explanation: requiredText("rankedCandidates[].explanation"),
}).strict() satisfies z.ZodType<RankingRationale>;

const designConstructInputSchema = z.object({
  rankedCandidates: z.array(rankingRationaleSchema, {
    error: "rankedCandidates must be an array of ranking rationale objects.",
  }),
  deliveryModality: z.enum(deliveryModalities, {
    error: "deliveryModality must be one of: " + deliveryModalities.join(", ") + ".",
  }).optional(),
}).strict() satisfies z.ZodType<DesignConstructInput>;

const neoantigenCandidateSchema = z.object({
  candidateId: requiredText("candidates[].candidateId"),
  peptideSequence: requiredText("candidates[].peptideSequence"),
  hlaAllele: requiredText("candidates[].hlaAllele"),
  bindingAffinity: z.object({
    ic50nM: numberField("candidates[].bindingAffinity.ic50nM")
      .finite()
      .min(0, "candidates[].bindingAffinity.ic50nM must be >= 0."),
    percentileRank: numberField("candidates[].bindingAffinity.percentileRank")
      .finite()
      .min(0, "candidates[].bindingAffinity.percentileRank must be >= 0."),
  }).strict(),
  expressionSupport: z.object({
    tpm: numberField("candidates[].expressionSupport.tpm")
      .finite()
      .min(0, "candidates[].expressionSupport.tpm must be >= 0."),
    variantAlleleFraction: numberField("candidates[].expressionSupport.variantAlleleFraction")
      .finite()
      .min(0, "candidates[].expressionSupport.variantAlleleFraction must be between 0 and 1.")
      .max(1, "candidates[].expressionSupport.variantAlleleFraction must be between 0 and 1."),
  }).strict(),
  clonality: z.object({
    vaf: numberField("candidates[].clonality.vaf")
      .finite()
      .min(0, "candidates[].clonality.vaf must be between 0 and 1.")
      .max(1, "candidates[].clonality.vaf must be between 0 and 1."),
    isClonal: booleanField("candidates[].clonality.isClonal"),
  }).strict(),
  manufacturability: z.object({
    gcContent: numberField("candidates[].manufacturability.gcContent")
      .finite()
      .min(0, "candidates[].manufacturability.gcContent must be between 0 and 1.")
      .max(1, "candidates[].manufacturability.gcContent must be between 0 and 1."),
    selfFoldingRisk: z.enum(selfFoldingRiskLevels, {
      error: "candidates[].manufacturability.selfFoldingRisk must be one of: " + selfFoldingRiskLevels.join(", ") + ".",
    }),
  }).strict(),
  selfSimilarity: z.object({
    closestSelfPeptide: requiredText("candidates[].selfSimilarity.closestSelfPeptide"),
    editDistance: z.number({ error: "candidates[].selfSimilarity.editDistance must be a non-negative integer." })
      .int()
      .min(0, "candidates[].selfSimilarity.editDistance must be a non-negative integer."),
    toleranceRisk: z.enum(toleranceRiskLevels, {
      error: "candidates[].selfSimilarity.toleranceRisk must be one of: " + toleranceRiskLevels.join(", ") + ".",
    }),
  }).strict(),
  uncertaintyScore: numberField("candidates[].uncertaintyScore")
    .finite()
    .min(0, "candidates[].uncertaintyScore must be between 0 and 1.")
    .max(1, "candidates[].uncertaintyScore must be between 0 and 1."),
}).strict() satisfies z.ZodType<NeoantigenCandidate>;

const recordNeoantigenRankingInputSchema = z.object({
  candidates: z.array(neoantigenCandidateSchema, {
    error: "candidates must be a non-empty array of neoantigen candidates.",
  }).min(1, "candidates must be a non-empty array of neoantigen candidates."),
}).strict() satisfies z.ZodType<RecordNeoantigenRankingInput>;

const activateModalityInputSchema = z.object({
  activationReason: z.string({ error: "activationReason is required." }).trim().min(3, "activationReason must be at least 3 characters."),
}).strict() satisfies z.ZodType<ActivateModalityInput>;

const recordReviewOutcomeInputSchema = z.object({
  packetId: requiredText("packetId"),
  reviewerId: requiredText("reviewerId"),
  reviewerRole: optionalText("reviewerRole"),
  reviewDisposition: z.enum(reviewDispositions, {
    error: "reviewDisposition must be one of: " + reviewDispositions.join(", ") + ".",
  }),
  rationale: requiredText("rationale"),
  comments: optionalText("comments"),
}).strict() satisfies z.ZodType<RecordReviewOutcomeInput>;

const generateHandoffPacketInputSchema = z.object({
  reviewId: requiredText("reviewId"),
  handoffTarget: requiredText("handoffTarget"),
  requestedBy: requiredText("requestedBy"),
  turnaroundDays: positiveInteger("turnaroundDays"),
  notes: optionalText("notes"),
}).strict() satisfies z.ZodType<GenerateHandoffPacketInput>;

const recordAdministrationInputSchema = z.object({
  administrationId: requiredText("administrationId"),
  constructId: requiredText("constructId"),
  constructVersion: positiveInteger("constructVersion"),
  administeredAt: isoTimestamp("administeredAt"),
  route: enumText(administrationRoutes, "route", "Unsupported administration route.").transform(
    (value) => value as AdministrationRecord["route"],
  ),
  doseMicrograms: numberField("doseMicrograms").positive("doseMicrograms must be a positive number."),
  batchId: optionalText("batchId"),
  notes: optionalText("notes"),
}).strict() satisfies z.ZodType<RecordAdministrationInput>;

const recordImmuneMonitoringInputSchema = z.object({
  monitoringId: requiredText("monitoringId"),
  constructId: requiredText("constructId"),
  constructVersion: positiveInteger("constructVersion"),
  collectedAt: isoTimestamp("collectedAt"),
  assayType: requiredText("assayType"),
  biomarker: requiredText("biomarker"),
  value: numberField("value"),
  unit: requiredText("unit"),
  baselineDelta: numberField("baselineDelta").optional(),
  notes: optionalText("notes"),
}).strict() satisfies z.ZodType<RecordImmuneMonitoringInput>;

const recordClinicalFollowUpInputSchema = z.object({
  followUpId: requiredText("followUpId"),
  constructId: requiredText("constructId"),
  constructVersion: positiveInteger("constructVersion"),
  evaluatedAt: isoTimestamp("evaluatedAt"),
  responseCategory: enumText(
    clinicalResponseCategories,
    "responseCategory",
    "Unsupported clinical response category.",
  ).transform((value) => value as ClinicalFollowUpRecord["responseCategory"]),
  progressionFreeDays: positiveInteger("progressionFreeDays").optional(),
  overallSurvivalDays: positiveInteger("overallSurvivalDays").optional(),
  notes: optionalText("notes"),
}).strict() satisfies z.ZodType<RecordClinicalFollowUpInput>;

export function parseCreateCaseInput(value: unknown): CreateCaseInput {
  return parseObjectWithSchema(
    value,
    createCaseInputSchema,
    "Submit a JSON object with case profile data.",
  );
}

export function parseRegisterSampleInput(value: unknown): RegisterSampleInput {
  return parseObjectWithSchema(
    value,
    registerSampleInputSchema,
    "Submit a JSON object with sample provenance.",
  );
}

export function parseRegisterArtifactInput(value: unknown): RegisterArtifactInput {
  return parseObjectWithSchema(
    value,
    registerArtifactInputSchema,
    "Submit a JSON object with artifact catalog data.",
  );
}

export function parseRequestWorkflowInput(value: unknown): RequestWorkflowInput {
  return parseObjectWithSchema(
    value,
    requestWorkflowInputSchema,
    "Submit a JSON object with workflow request details.",
  );
}

export function parseStartWorkflowRunInput(value: unknown): StartWorkflowRunInput {
  return parseObjectWithSchema(
    value,
    startWorkflowRunInputSchema,
    "Submit a JSON object with run details.",
  );
}

export function parseCompleteWorkflowRunInput(value: unknown): CompleteWorkflowRunInput {
  return parseObjectWithSchema(
    value,
    completeWorkflowRunInputSchema,
    "Submit a JSON object with completion details.",
  );
}

export function parseFailWorkflowRunInput(value: unknown): FailWorkflowRunInput {
  return parseObjectWithSchema(
    value,
    failWorkflowRunInputSchema,
    "Submit a JSON object with failure reason.",
  );
}

export function parseRecordHlaConsensusInput(value: unknown): RecordHlaConsensusInput {
  return parseObjectWithSchema(
    value,
    recordHlaConsensusInputSchema,
    "Submit a JSON object with HLA consensus data.",
  );
}

export function parseEvaluateQcGateInput(value: unknown): EvaluateQcGateInput {
  return parseObjectWithSchema(
    value,
    evaluateQcGateInputSchema,
    "Submit a JSON object with QC results.",
  );
}

export function parseConstructDesignInput(value: unknown): DesignConstructInput {
  return parseObjectWithSchema(
    value,
    designConstructInputSchema,
    "Submit a JSON object with rankedCandidates and an optional deliveryModality.",
  );
}

export function parseRecordNeoantigenRankingInput(value: unknown): RecordNeoantigenRankingInput {
  return parseObjectWithSchema(
    value,
    recordNeoantigenRankingInputSchema,
    "Submit a JSON object with a non-empty candidates array for neoantigen ranking.",
  );
}

export function parseActivateModalityInput(value: unknown): ActivateModalityInput {
  return parseObjectWithSchema(
    value,
    activateModalityInputSchema,
    "Submit a JSON object with activationReason describing why the modality is being enabled.",
  );
}

export function parseRecordReviewOutcomeInput(value: unknown): RecordReviewOutcomeInput {
  return parseObjectWithSchema(
    value,
    recordReviewOutcomeInputSchema,
    "Submit a JSON object with packetId, reviewer identity, reviewDisposition, and rationale.",
  );
}

export function parseGenerateHandoffPacketInput(value: unknown): GenerateHandoffPacketInput {
  return parseObjectWithSchema(
    value,
    generateHandoffPacketInputSchema,
    "Submit a JSON object with reviewId, handoffTarget, requestedBy, and turnaroundDays.",
  );
}

export function parseRecordAdministrationInput(value: unknown): RecordAdministrationInput {
  return parseObjectWithSchema(
    value,
    recordAdministrationInputSchema,
    "Submit a JSON object with administration outcome data and omit caseId from the body.",
  );
}

export function parseRecordImmuneMonitoringInput(value: unknown): RecordImmuneMonitoringInput {
  return parseObjectWithSchema(
    value,
    recordImmuneMonitoringInputSchema,
    "Submit a JSON object with immune monitoring outcome data and omit caseId from the body.",
  );
}

export function parseRecordClinicalFollowUpInput(value: unknown): RecordClinicalFollowUpInput {
  return parseObjectWithSchema(
    value,
    recordClinicalFollowUpInputSchema,
    "Submit a JSON object with clinical follow-up outcome data and omit caseId from the body.",
  );
}

export function parseWorkflowRunManifest(value: unknown): WorkflowRunManifest {
  return parseObjectWithSchema(
    value,
    workflowRunManifestSchema,
    "Submit a JSON object with a complete workflow run manifest.",
  );
}

// ─── Workflow Output Manifest (Wave 5) ──────────────────────────────

const outputManifestDerivedArtifactSchema = z.object({
  artifactId: requiredText("derivedArtifacts[].artifactId"),
  semanticType: enumText(
    derivedArtifactSemanticTypes,
    "derivedArtifacts[].semanticType",
    "Unsupported derived artifact semantic type.",
  ).transform((value) => value as DerivedArtifactSemanticType),
  artifactHash: requiredText("derivedArtifacts[].artifactHash"),
  producingStep: requiredText("derivedArtifacts[].producingStep"),
  storageUri: optionalText("derivedArtifacts[].storageUri"),
}).strict();

const outputManifestQcSummarySchema = z.object({
  outcome: z.enum(qcGateOutcomes, {
    error: "qcSummary.outcome must be " + qcGateOutcomes.join(", ") + ".",
  }),
  results: z.array(
    z.object({
      metric: requiredText("qcSummary.results[].metric"),
      metricCategory: z.enum(wellKnownQcMetrics, {
        error: "metricCategory must be a known QC metric.",
      }).optional(),
      value: numberField("qcSummary.results[].value"),
      threshold: numberField("qcSummary.results[].threshold"),
      pass: booleanField("qcSummary.results[].pass"),
      notes: optionalText("qcSummary.results[].notes"),
    }).strict(),
    { error: "qcSummary.results must be an array." },
  ),
  evaluatedAt: requiredText("qcSummary.evaluatedAt"),
}).strict();

const workflowOutputManifestSchema = z.object({
  outputManifestVersion: positiveInteger("outputManifestVersion"),
  runId: requiredText("runId"),
  caseId: requiredText("caseId"),
  workflowName: requiredText("workflowName"),
  executionProfile: requiredText("executionProfile"),
  completedAt: isoTimestamp("completedAt"),
  durationMs: numberField("durationMs"),
  derivedArtifacts: z.array(outputManifestDerivedArtifactSchema, {
    error: "derivedArtifacts must be an array.",
  }),
  qcSummary: outputManifestQcSummarySchema,
  inputManifestReference: z.object({
    manifestVersion: positiveInteger("inputManifestReference.manifestVersion"),
    workflowRevision: requiredText("inputManifestReference.workflowRevision"),
    configProfile: requiredText("inputManifestReference.configProfile"),
  }).strict(),
  provenanceChain: z.object({
    referenceBundleId: requiredText("provenanceChain.referenceBundleId"),
    genomeAssembly: requiredText("provenanceChain.genomeAssembly"),
    executorVersion: requiredText("provenanceChain.executorVersion"),
    pipelineRevision: optionalText("provenanceChain.pipelineRevision"),
  }).strict(),
}).strict() satisfies z.ZodType<WorkflowOutputManifest>;

export function parseWorkflowOutputManifest(value: unknown): WorkflowOutputManifest {
  return parseObjectWithSchema(
    value,
    workflowOutputManifestSchema,
    "Submit a JSON object with the workflow output manifest.",
  );
}

// ─── Register Reference Bundle (Wave 6) ─────────────────────────────

const retrievalProvenanceSchema = z.object({
  uri: requiredText("retrievalProvenance.uri"),
  retrievedAt: isoTimestamp("retrievalProvenance.retrievedAt"),
  integrityHash: requiredText("retrievalProvenance.integrityHash"),
}).strict();

const registerBundleSchema = z.object({
  bundleId: requiredText("bundleId"),
  genomeAssembly: requiredText("genomeAssembly"),
  annotationVersion: requiredText("annotationVersion"),
  knownSitesVersion: requiredText("knownSitesVersion"),
  hlaDatabaseVersion: requiredText("hlaDatabaseVersion"),
  frozenAt: isoTimestamp("frozenAt"),
  transcriptSet: optionalText("transcriptSet"),
  callerBundleVersion: optionalText("callerBundleVersion"),
  pipelineRevision: optionalText("pipelineRevision"),
  retrievalProvenance: z.preprocess(
    (v) => (v === null || v === undefined ? undefined : v),
    retrievalProvenanceSchema.optional(),
  ),
}).strict() satisfies z.ZodType<ReferenceBundleManifest>;

export function parseRegisterBundleInput(value: unknown): ReferenceBundleManifest {
  return parseObjectWithSchema(
    value,
    registerBundleSchema,
    "Submit a JSON object describing the reference bundle.",
  );
}