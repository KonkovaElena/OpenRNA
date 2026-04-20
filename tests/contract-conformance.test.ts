import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseWorkflowOutputManifest,
  parseCompleteWorkflowRunInput,
  parseEvaluateQcGateInput,
} from "../src/validation";
import type { WorkflowOutputManifest } from "../src/types";

/**
 * 5.D — Contract conformance: proves an external executor can emit a full
 * WorkflowOutputManifest and the control plane can decompose it into the
 * existing completeRun + evaluateQcGate inputs without data loss.
 */
describe("5.D — Executor output manifest → control-plane ingestion", () => {
  const executorPayload: Record<string, unknown> = {
    outputManifestVersion: 1,
    runId: "run-exec-001",
    caseId: "case-abc",
    workflowName: "somatic-pipeline",
    executionProfile: "standard",
    completedAt: "2026-03-27T14:30:00Z",
    durationMs: 7200000,
    derivedArtifacts: [
      {
        artifactId: "art-vcf-1",
        semanticType: "somatic-vcf",
        artifactHash: "sha256:abcdef",
        producingStep: "variant-calling",
      },
      {
        artifactId: "art-bam-1",
        semanticType: "alignment-bam",
        artifactHash: "sha256:112233",
        producingStep: "alignment",
        storageUri: "s3://bucket/alignments/bam1",
      },
      {
        artifactId: "art-qc-1",
        semanticType: "qc-summary-json",
        artifactHash: "sha256:qcqcqc",
        producingStep: "qc-aggregation",
      },
    ],
    qcSummary: {
      outcome: "PASSED",
      results: [
        { metric: "coverage_depth", metricCategory: "callable_region_coverage", value: 120, threshold: 80, pass: true },
        { metric: "identity_check", metricCategory: "sample_identity_check", value: 0.998, threshold: 0.95, pass: true },
        { metric: "hla_completeness", metricCategory: "hla_consensus_completeness", value: 1.0, threshold: 0.8, pass: true },
      ],
      evaluatedAt: "2026-03-27T14:31:00Z",
    },
    inputManifestReference: {
      manifestVersion: 2,
      workflowRevision: "v3.1.0",
      configProfile: "standard",
    },
    provenanceChain: {
      referenceBundleId: "ref-grch38-v2",
      genomeAssembly: "GRCh38",
      executorVersion: "24.10.2",
      pipelineRevision: "abc1234",
    },
  };

  it("parses the full executor payload without error", () => {
    const manifest = parseWorkflowOutputManifest(executorPayload);
    assert.equal(manifest.runId, "run-exec-001");
    assert.equal(manifest.derivedArtifacts.length, 3);
    assert.equal(manifest.qcSummary.results.length, 3);
  });

  it("derived artifacts map losslessly to completeRun input", () => {
    const manifest: WorkflowOutputManifest = parseWorkflowOutputManifest(executorPayload);

    // Transform manifest artifacts → completeRun payload
    const completePayload = {
      derivedArtifacts: manifest.derivedArtifacts.map((a) => ({
        semanticType: a.semanticType,
        artifactHash: a.artifactHash,
        producingStep: a.producingStep,
      })),
    };

    const parsed = parseCompleteWorkflowRunInput(completePayload);
    assert.ok(parsed.derivedArtifacts);
    assert.equal(parsed.derivedArtifacts.length, 3);
    assert.equal(parsed.derivedArtifacts[0].semanticType, "somatic-vcf");
    assert.equal(parsed.derivedArtifacts[1].semanticType, "alignment-bam");
    assert.equal(parsed.derivedArtifacts[2].semanticType, "qc-summary-json");
  });

  it("QC summary maps losslessly to evaluateQcGate input", () => {
    const manifest: WorkflowOutputManifest = parseWorkflowOutputManifest(executorPayload);

    // Transform manifest QC → evaluateQcGate payload
    const qcPayload = {
      results: manifest.qcSummary.results.map((r) => ({
        metric: r.metric,
        metricCategory: r.metricCategory,
        value: r.value,
        threshold: r.threshold,
        pass: r.pass,
        notes: r.notes,
      })),
    };

    const parsed = parseEvaluateQcGateInput(qcPayload);
    assert.equal(parsed.results.length, 3);
    assert.equal(parsed.results[0].metricCategory, "callable_region_coverage");
    assert.equal(parsed.results[1].metricCategory, "sample_identity_check");
    assert.equal(parsed.results[2].metricCategory, "hla_consensus_completeness");
  });

  it("provenance chain preserves executor metadata", () => {
    const manifest: WorkflowOutputManifest = parseWorkflowOutputManifest(executorPayload);
    assert.equal(manifest.provenanceChain.referenceBundleId, "ref-grch38-v2");
    assert.equal(manifest.provenanceChain.genomeAssembly, "GRCh38");
    assert.equal(manifest.provenanceChain.executorVersion, "24.10.2");
    assert.equal(manifest.provenanceChain.pipelineRevision, "abc1234");
  });

  it("manifest round-trips through JSON serialization", () => {
    const manifest = parseWorkflowOutputManifest(executorPayload);
    const serialized = JSON.stringify(manifest);
    const roundTripped = parseWorkflowOutputManifest(JSON.parse(serialized));
    assert.deepStrictEqual(roundTripped, manifest);
  });
});
