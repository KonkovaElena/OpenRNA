import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEvidenceLineage,
  deriveCaseStatus,
  hasRequiredSamples,
  hasRequiredSourceArtifacts,
  stableHandoffPacketSignature,
  stableReviewOutcomeSignature,
} from "../src/store-helpers";
import { buildEvidenceLineage as buildEvidenceLineageFromStore } from "../src/store";
import type {
  ArtifactRecord,
  GenerateHandoffPacketInput,
  RecordReviewOutcomeInput,
  RunArtifact,
  SampleRecord,
  WorkflowRunRecord,
} from "../src/types";

function buildSample(sampleType: SampleRecord["sampleType"], sampleId: string): SampleRecord {
  return {
    sampleId,
    sampleType,
    assayType: sampleType === "TUMOR_RNA" ? "RNA_SEQ" : "WES",
    accessionId: `acc-${sampleId}`,
    sourceSite: "site-001",
    registeredAt: "2026-04-04T13:00:00.000Z",
  };
}

function buildSourceArtifact(sampleId: string, semanticType: ArtifactRecord["semanticType"]): ArtifactRecord {
  return {
    artifactId: `artifact-${sampleId}-${semanticType}`,
    artifactClass: "SOURCE",
    sampleId,
    semanticType,
    schemaVersion: 1,
    artifactHash: `sha256:${sampleId}:${semanticType}`,
    storageUri: `artifact://${sampleId}/${semanticType}`,
    mediaType: "application/gzip",
    registeredAt: "2026-04-04T13:00:00.000Z",
  };
}

function buildCompletedRun(
  runId: string,
  workflowName: WorkflowRunRecord["workflowName"],
): WorkflowRunRecord {
  return {
    runId,
    caseId: "case-store-helper-001",
    requestId: `request-${runId}`,
    status: "COMPLETED",
    workflowName,
    referenceBundleId: "GRCh38-2026a",
    executionProfile: "standard",
    startedAt: "2026-04-04T13:00:00.000Z",
    completedAt: "2026-04-04T13:05:00.000Z",
  };
}

test("store helpers expose readiness rules through a dedicated module", () => {
  const samples = [
    buildSample("TUMOR_DNA", "tumor-dna-001"),
    buildSample("NORMAL_DNA", "normal-dna-001"),
    buildSample("TUMOR_RNA", "tumor-rna-001"),
  ];
  const artifacts = [
    buildSourceArtifact("tumor-dna-001", "tumor-dna-fastq"),
    buildSourceArtifact("normal-dna-001", "normal-dna-fastq"),
    buildSourceArtifact("tumor-rna-001", "tumor-rna-fastq"),
  ];

  assert.equal(hasRequiredSamples(samples), true);
  assert.equal(hasRequiredSourceArtifacts(samples, artifacts), true);
  assert.equal(deriveCaseStatus("complete", samples, artifacts, false), "READY_FOR_WORKFLOW");
  assert.equal(deriveCaseStatus("complete", samples, artifacts, true), "WORKFLOW_REQUESTED");
  assert.equal(deriveCaseStatus("missing", samples, artifacts, false), "AWAITING_CONSENT");
});

test("store helpers keep review and handoff signatures deterministic", () => {
  const reviewInput: RecordReviewOutcomeInput = {
    packetId: "packet-001",
    reviewerId: "reviewer-001",
    reviewerRole: "molecular-oncologist",
    reviewDisposition: "approved",
    rationale: "Evidence supports release.",
    comments: "Ready for handoff.",
  };

  const handoffInput: GenerateHandoffPacketInput = {
    reviewId: "review-001",
    qaReleaseId: "qa-release-001",
    handoffTarget: "cmc-facility-a",
    requestedBy: "operator-001",
    turnaroundDays: 14,
    notes: "Use release train A.",
  };

  assert.equal(stableReviewOutcomeSignature(reviewInput), stableReviewOutcomeSignature({ ...reviewInput }));
  assert.notEqual(
    stableReviewOutcomeSignature(reviewInput),
    stableReviewOutcomeSignature({ ...reviewInput, reviewDisposition: "revision-requested" }),
  );
  assert.equal(stableHandoffPacketSignature(handoffInput), stableHandoffPacketSignature({ ...handoffInput }));
  assert.notEqual(
    stableHandoffPacketSignature(handoffInput),
    stableHandoffPacketSignature({ ...handoffInput, turnaroundDays: 21 }),
  );
});

test("store helpers build workflow evidence lineage and preserve store.ts compatibility", () => {
  const dnaQcRun = buildCompletedRun("run-dna-qc", "dna-qc");
  const somaticRun = buildCompletedRun("run-somatic", "somatic-calling");
  const annotationRun = buildCompletedRun("run-annotation", "annotation");
  const hlaRun = buildCompletedRun("run-hla", "hla-typing");
  const combinedRun = buildCompletedRun("run-combined", "combined-evidence");

  const derivedArtifacts: RunArtifact[] = [
    {
      artifactId: "art-dna-qc",
      runId: dnaQcRun.runId,
      artifactClass: "DERIVED",
      semanticType: "qc-summary-json",
      artifactHash: "sha256:dna-qc",
      producingStep: "dna-qc",
      registeredAt: "2026-04-04T13:05:00.000Z",
    },
    {
      artifactId: "art-somatic",
      runId: somaticRun.runId,
      artifactClass: "DERIVED",
      semanticType: "somatic-vcf",
      artifactHash: "sha256:somatic",
      producingStep: "somatic-calling",
      registeredAt: "2026-04-04T13:06:00.000Z",
    },
    {
      artifactId: "art-annotation",
      runId: annotationRun.runId,
      artifactClass: "DERIVED",
      semanticType: "annotated-vcf",
      artifactHash: "sha256:annotation",
      producingStep: "annotation",
      registeredAt: "2026-04-04T13:07:00.000Z",
    },
    {
      artifactId: "art-hla",
      runId: hlaRun.runId,
      artifactClass: "DERIVED",
      semanticType: "hla-calls",
      artifactHash: "sha256:hla",
      producingStep: "hla-typing",
      registeredAt: "2026-04-04T13:08:00.000Z",
    },
  ];

  const helperLineage = buildEvidenceLineage(
    [dnaQcRun, somaticRun, annotationRun, hlaRun, combinedRun],
    derivedArtifacts,
  );
  const storeLineage = buildEvidenceLineageFromStore(
    [dnaQcRun, somaticRun, annotationRun, hlaRun, combinedRun],
    derivedArtifacts,
  );

  assert.deepEqual(storeLineage, helperLineage);
  assert.equal(helperLineage.roots.includes(dnaQcRun.runId), true);
  assert.equal(helperLineage.terminal.includes(combinedRun.runId), true);
  assert.equal(
    helperLineage.edges.some(
      (edge) => edge.producerRunId === somaticRun.runId && edge.consumerRunId === annotationRun.runId,
    ),
    true,
  );
  assert.equal(
    helperLineage.edges.some(
      (edge) => edge.producerRunId === annotationRun.runId && edge.consumerRunId === combinedRun.runId,
    ),
    true,
  );
  assert.equal(
    helperLineage.edges.some(
      (edge) => edge.producerRunId === hlaRun.runId && edge.consumerRunId === combinedRun.runId,
    ),
    true,
  );
});