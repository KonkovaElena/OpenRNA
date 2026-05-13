import { z } from "zod";
import {
  type DeliveryModality,
  deliveryModalities,
  type EpitopeLinkerStrategy,
  type EvaluateQcGateInput,
  epitopeLinkerStrategies,
  type HlaToolEvidence,
  type NeoantigenCandidate,
  type RankingRationale,
  type RecordHlaConsensusInput,
  selfFoldingRiskLevels,
  toleranceRiskLevels,
  wellKnownQcMetrics,
} from "./types";
import {
  booleanField,
  nonEmptyStringArray,
  numberField,
  optionalText,
  parseObjectWithSchema,
  positiveInteger,
  requiredText,
} from "./validation-helpers";

const hlaToolEvidenceSchema = z
  .object({
    toolName: requiredText("perToolEvidence[].toolName"),
    alleles: nonEmptyStringArray("perToolEvidence[].alleles", "perToolEvidence[].alleles[]"),
    confidence: numberField("perToolEvidence[].confidence")
      .finite()
      .min(0, "confidence must be between 0 and 1.")
      .max(1, "confidence must be between 0 and 1.")
      .multipleOf(0.001, "confidence must have at most 3 decimal places."),
    rawOutput: optionalText("perToolEvidence[].rawOutput"),
  })
  .strict() satisfies z.ZodType<HlaToolEvidence>;

const recordHlaConsensusInputSchema = z
  .object({
    alleles: nonEmptyStringArray("alleles", "alleles[]"),
    perToolEvidence: z
      .array(hlaToolEvidenceSchema, {
        error: "perToolEvidence must be a non-empty array.",
      })
      .min(1, "perToolEvidence must be a non-empty array."),
    confidenceScore: numberField("confidenceScore")
      .finite()
      .min(0, "confidenceScore must be between 0 and 1.")
      .max(1, "confidenceScore must be between 0 and 1.")
      .multipleOf(0.001, "confidenceScore must have at most 3 decimal places."),
    operatorReviewThreshold: z
      .number({ error: "operatorReviewThreshold must be a non-negative integer." })
      .int("operatorReviewThreshold must be a non-negative integer.")
      .min(0, "operatorReviewThreshold must be a non-negative integer.")
      .optional(),
    tieBreakNotes: optionalText("tieBreakNotes"),
    referenceVersion: requiredText("referenceVersion"),
  })
  .strict() satisfies z.ZodType<RecordHlaConsensusInput>;

const evaluateQcGateInputSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            metric: requiredText("results[].metric"),
            metricCategory: z
              .enum(wellKnownQcMetrics, {
                error: "metricCategory must be a known QC metric.",
              })
              .optional(),
            value: numberField("results[].value"),
            threshold: numberField("results[].threshold"),
            pass: booleanField("results[].pass"),
            notes: optionalText("results[].notes"),
          })
          .strict(),
        { error: "results must be a non-empty array." },
      )
      .min(1, "results must be a non-empty array."),
  })
  .strict() satisfies z.ZodType<EvaluateQcGateInput>;

const rankingRationaleSchema = z
  .object({
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
  })
  .strict() satisfies z.ZodType<RankingRationale>;

export type DesignConstructInput = {
  rankedCandidates: RankingRationale[];
  deliveryModality?: DeliveryModality;
  linkerStrategy?: EpitopeLinkerStrategy;
};

const designConstructInputSchema = z
  .object({
    rankedCandidates: z.array(rankingRationaleSchema, {
      error: "rankedCandidates must be an array of ranking rationale objects.",
    }),
    deliveryModality: z
      .enum(deliveryModalities, {
        error: `deliveryModality must be one of: ${deliveryModalities.join(", ")}.`,
      })
      .optional(),
    linkerStrategy: z
      .enum(epitopeLinkerStrategies, {
        error: `linkerStrategy must be one of: ${epitopeLinkerStrategies.join(", ")}.`,
      })
      .optional(),
  })
  .strict() satisfies z.ZodType<DesignConstructInput>;

const neoantigenCandidateSchema = z
  .object({
    candidateId: requiredText("candidates[].candidateId"),
    peptideSequence: requiredText("candidates[].peptideSequence"),
    hlaAllele: requiredText("candidates[].hlaAllele"),
    bindingAffinity: z
      .object({
        ic50nM: numberField("candidates[].bindingAffinity.ic50nM")
          .finite()
          .min(0, "candidates[].bindingAffinity.ic50nM must be >= 0."),
        percentileRank: numberField("candidates[].bindingAffinity.percentileRank")
          .finite()
          .min(0, "candidates[].bindingAffinity.percentileRank must be >= 0."),
      })
      .strict(),
    expressionSupport: z
      .object({
        tpm: numberField("candidates[].expressionSupport.tpm")
          .finite()
          .min(0, "candidates[].expressionSupport.tpm must be >= 0."),
        variantAlleleFraction: numberField("candidates[].expressionSupport.variantAlleleFraction")
          .finite()
          .min(0, "candidates[].expressionSupport.variantAlleleFraction must be between 0 and 1.")
          .max(1, "candidates[].expressionSupport.variantAlleleFraction must be between 0 and 1."),
      })
      .strict(),
    clonality: z
      .object({
        vaf: numberField("candidates[].clonality.vaf")
          .finite()
          .min(0, "candidates[].clonality.vaf must be between 0 and 1.")
          .max(1, "candidates[].clonality.vaf must be between 0 and 1."),
        isClonal: booleanField("candidates[].clonality.isClonal"),
      })
      .strict(),
    manufacturability: z
      .object({
        gcContent: numberField("candidates[].manufacturability.gcContent")
          .finite()
          .min(0, "candidates[].manufacturability.gcContent must be between 0 and 1.")
          .max(1, "candidates[].manufacturability.gcContent must be between 0 and 1."),
        selfFoldingRisk: z.enum(selfFoldingRiskLevels, {
          error: `candidates[].manufacturability.selfFoldingRisk must be one of: ${selfFoldingRiskLevels.join(", ")}.`,
        }),
      })
      .strict(),
    selfSimilarity: z
      .object({
        closestSelfPeptide: requiredText("candidates[].selfSimilarity.closestSelfPeptide"),
        editDistance: z
          .number({ error: "candidates[].selfSimilarity.editDistance must be a non-negative integer." })
          .int()
          .min(0, "candidates[].selfSimilarity.editDistance must be a non-negative integer."),
        toleranceRisk: z.enum(toleranceRiskLevels, {
          error: `candidates[].selfSimilarity.toleranceRisk must be one of: ${toleranceRiskLevels.join(", ")}.`,
        }),
      })
      .strict(),
    uncertaintyScore: numberField("candidates[].uncertaintyScore")
      .finite()
      .min(0, "candidates[].uncertaintyScore must be between 0 and 1.")
      .max(1, "candidates[].uncertaintyScore must be between 0 and 1."),
  })
  .strict() satisfies z.ZodType<NeoantigenCandidate>;

type RecordNeoantigenRankingInput = {
  candidates: NeoantigenCandidate[];
};

const recordNeoantigenRankingInputSchema = z
  .object({
    candidates: z
      .array(neoantigenCandidateSchema, {
        error: "candidates must be a non-empty array of neoantigen candidates.",
      })
      .min(1, "candidates must be a non-empty array of neoantigen candidates."),
  })
  .strict() satisfies z.ZodType<RecordNeoantigenRankingInput>;

export type ActivateModalityInput = {
  activationReason: string;
};

const activateModalityInputSchema = z
  .object({
    activationReason: z
      .string({ error: "activationReason is required." })
      .trim()
      .min(3, "activationReason must be at least 3 characters."),
  })
  .strict() satisfies z.ZodType<ActivateModalityInput>;

export function parseRecordHlaConsensusInput(value: unknown): RecordHlaConsensusInput {
  return parseObjectWithSchema(value, recordHlaConsensusInputSchema, "Submit a JSON object with HLA consensus data.");
}

export function parseEvaluateQcGateInput(value: unknown): EvaluateQcGateInput {
  return parseObjectWithSchema(value, evaluateQcGateInputSchema, "Submit a JSON object with QC results.");
}

export function parseConstructDesignInput(value: unknown): DesignConstructInput {
  return parseObjectWithSchema(
    value,
    designConstructInputSchema,
    "Submit a JSON object with rankedCandidates and optional deliveryModality/linkerStrategy.",
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
