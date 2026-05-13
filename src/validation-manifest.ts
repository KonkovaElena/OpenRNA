import { z } from "zod";
import {
  type DerivedArtifactSemanticType,
  derivedArtifactSemanticTypes,
  qcGateOutcomes,
  type WorkflowOutputManifest,
  type WorkflowRunManifest,
  wellKnownQcMetrics,
} from "./types";
import {
  booleanField,
  enumText,
  isoTimestamp,
  numberField,
  optionalText,
  parseObjectWithSchema,
  positiveInteger,
  requiredText,
} from "./validation-helpers";

const manifestInputArtifactSchema = z
  .object({
    artifactId: requiredText("inputArtifactSet[].artifactId"),
    semanticType: requiredText("inputArtifactSet[].semanticType"),
    artifactHash: requiredText("inputArtifactSet[].artifactHash"),
  })
  .strict();

const manifestReferenceAssetSchema = z
  .object({
    assetKind: requiredText("assets[].assetKind"),
    uri: requiredText("assets[].uri"),
    checksum: requiredText("assets[].checksum"),
  })
  .strict();

const manifestReferenceBundleSchema = z
  .object({
    bundleId: requiredText("pinnedReferenceBundle.bundleId"),
    genomeAssembly: requiredText("pinnedReferenceBundle.genomeAssembly"),
    assets: z.array(manifestReferenceAssetSchema, {
      error: "pinnedReferenceBundle.assets must be an array.",
    }),
  })
  .strict();

const manifestSampleSnapshotSchema = z
  .object({
    sampleId: requiredText("sampleSnapshot.sampleId"),
    sampleType: requiredText("sampleSnapshot.sampleType"),
    assayType: requiredText("sampleSnapshot.assayType"),
  })
  .strict();

const workflowRunManifestSchema = z
  .object({
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
  })
  .strict() satisfies z.ZodType<WorkflowRunManifest>;

const outputManifestDerivedArtifactSchema = z
  .object({
    artifactId: requiredText("derivedArtifacts[].artifactId"),
    semanticType: enumText(
      derivedArtifactSemanticTypes,
      "derivedArtifacts[].semanticType",
      "Unsupported derived artifact semantic type.",
    ).transform((value) => value as DerivedArtifactSemanticType),
    artifactHash: requiredText("derivedArtifacts[].artifactHash"),
    producingStep: requiredText("derivedArtifacts[].producingStep"),
    storageUri: optionalText("derivedArtifacts[].storageUri"),
  })
  .strict();

const outputManifestQcSummarySchema = z
  .object({
    outcome: z.enum(qcGateOutcomes, {
      error: `qcSummary.outcome must be ${qcGateOutcomes.join(", ")}.`,
    }),
    results: z.array(
      z
        .object({
          metric: requiredText("qcSummary.results[].metric"),
          metricCategory: z
            .enum(wellKnownQcMetrics, {
              error: "metricCategory must be a known QC metric.",
            })
            .optional(),
          value: numberField("qcSummary.results[].value"),
          threshold: numberField("qcSummary.results[].threshold"),
          pass: booleanField("qcSummary.results[].pass"),
          notes: optionalText("qcSummary.results[].notes"),
        })
        .strict(),
      { error: "qcSummary.results must be an array." },
    ),
    evaluatedAt: requiredText("qcSummary.evaluatedAt"),
  })
  .strict();

const workflowOutputManifestSchema = z
  .object({
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
    inputManifestReference: z
      .object({
        manifestVersion: positiveInteger("inputManifestReference.manifestVersion"),
        workflowRevision: requiredText("inputManifestReference.workflowRevision"),
        configProfile: requiredText("inputManifestReference.configProfile"),
      })
      .strict(),
    provenanceChain: z
      .object({
        referenceBundleId: requiredText("provenanceChain.referenceBundleId"),
        genomeAssembly: requiredText("provenanceChain.genomeAssembly"),
        executorVersion: requiredText("provenanceChain.executorVersion"),
        pipelineRevision: optionalText("provenanceChain.pipelineRevision"),
      })
      .strict(),
  })
  .strict() satisfies z.ZodType<WorkflowOutputManifest>;

export function parseWorkflowRunManifest(value: unknown): WorkflowRunManifest {
  return parseObjectWithSchema(
    value,
    workflowRunManifestSchema,
    "Submit a JSON object with a complete workflow run manifest.",
  );
}

export function parseWorkflowOutputManifest(value: unknown): WorkflowOutputManifest {
  return parseObjectWithSchema(
    value,
    workflowOutputManifestSchema,
    "Submit a JSON object with the workflow output manifest.",
  );
}
