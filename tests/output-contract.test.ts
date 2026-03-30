import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseEvaluateQcGateInput,
  parseCompleteWorkflowRunInput,
  parseWorkflowOutputManifest,
} from "../src/validation";
import { derivedArtifactSemanticTypes, wellKnownQcMetrics } from "../src/types";

// ─── 5.A: Expanded Derived Artifact Types ──────────────────────────

describe("5.A — Expanded Derived Artifact Semantic Types", () => {
  it("accepts all 10 declared derived artifact types", () => {
    assert.equal(derivedArtifactSemanticTypes.length, 10);
    const expected = [
      "somatic-vcf", "filtered-maf", "hla-calls",
      "alignment-bam", "annotated-vcf", "expression-matrix",
      "hla-calls-raw", "qc-summary-json", "run-manifest-artifact",
      "board-evidence-bundle",
    ];
    assert.deepStrictEqual([...derivedArtifactSemanticTypes], expected);
  });

  for (const semType of ["alignment-bam", "annotated-vcf", "expression-matrix", "qc-summary-json"] as const) {
    it(`completeRun accepts new type '${semType}'`, () => {
      const input = parseCompleteWorkflowRunInput({
        derivedArtifacts: [
          { semanticType: semType, artifactHash: "sha256:abc", producingStep: "step1" },
        ],
      });
      assert.ok(input.derivedArtifacts);
      assert.equal(input.derivedArtifacts[0].semanticType, semType);
    });
  }

  it("rejects unknown derived artifact type", () => {
    assert.throws(
      () => parseCompleteWorkflowRunInput({
        derivedArtifacts: [
          { semanticType: "unknown-type", artifactHash: "sha256:abc", producingStep: "s" },
        ],
      }),
      (err: any) => err.message.includes("Unsupported derived artifact semantic type"),
    );
  });
});

// ─── 5.B: QC Evidence Contract ──────────────────────────────────────

describe("5.B — QC Evidence Contract", () => {
  it("wellKnownQcMetrics has 7 entries", () => {
    assert.equal(wellKnownQcMetrics.length, 7);
  });

  it("accepts QC result without metricCategory (backward compat)", () => {
    const input = parseEvaluateQcGateInput({
      results: [{ metric: "cov", value: 30, threshold: 20, pass: true }],
    });
    assert.equal(input.results[0].metricCategory, undefined);
  });

  it("accepts QC result with valid metricCategory", () => {
    const input = parseEvaluateQcGateInput({
      results: [
        { metric: "cov", metricCategory: "callable_region_coverage", value: 30, threshold: 20, pass: true },
      ],
    });
    assert.equal(input.results[0].metricCategory, "callable_region_coverage");
  });

  it("rejects QC result with unknown metricCategory", () => {
    assert.throws(
      () => parseEvaluateQcGateInput({
        results: [
          { metric: "cov", metricCategory: "unknown_metric", value: 30, threshold: 20, pass: true },
        ],
      }),
      (err: any) => err.message.includes("metricCategory must be a known QC metric"),
    );
  });

  for (const cat of wellKnownQcMetrics) {
    it(`accepts wellKnownQcMetric '${cat}'`, () => {
      const input = parseEvaluateQcGateInput({
        results: [{ metric: "m", metricCategory: cat, value: 1, threshold: 0, pass: true }],
      });
      assert.equal(input.results[0].metricCategory, cat);
    });
  }
});

// ─── 5.C: Workflow Output Manifest ──────────────────────────────────

function validManifest(): Record<string, unknown> {
  return {
    outputManifestVersion: 1,
    runId: "run-1",
    caseId: "case-1",
    workflowName: "somatic-pipeline",
    executionProfile: "standard",
    completedAt: "2026-03-27T12:00:00Z",
    durationMs: 3600000,
    derivedArtifacts: [
      {
        artifactId: "art-1",
        semanticType: "somatic-vcf",
        artifactHash: "sha256:aaa",
        producingStep: "variant-calling",
      },
    ],
    qcSummary: {
      outcome: "PASSED",
      results: [
        { metric: "cov", value: 30, threshold: 20, pass: true },
      ],
      evaluatedAt: "2026-03-27T12:00:05Z",
    },
    inputManifestReference: {
      manifestVersion: 1,
      workflowRevision: "v2.3.1",
      configProfile: "default",
    },
    provenanceChain: {
      referenceBundleId: "ref-1",
      genomeAssembly: "GRCh38",
      executorVersion: "24.10.0",
    },
  };
}

describe("5.C — Workflow Output Manifest schema", () => {
  it("accepts a valid manifest", () => {
    const m = parseWorkflowOutputManifest(validManifest());
    assert.equal(m.runId, "run-1");
    assert.equal(m.derivedArtifacts.length, 1);
    assert.equal(m.qcSummary.outcome, "PASSED");
  });

  it("accepts manifest with storageUri on artifact", () => {
    const raw = validManifest();
    (raw.derivedArtifacts as any[])[0].storageUri = "s3://bucket/key";
    const m = parseWorkflowOutputManifest(raw);
    assert.equal(m.derivedArtifacts[0].storageUri, "s3://bucket/key");
  });

  it("accepts manifest with pipelineRevision", () => {
    const raw = validManifest();
    (raw.provenanceChain as any).pipelineRevision = "abc123";
    const m = parseWorkflowOutputManifest(raw);
    assert.equal(m.provenanceChain.pipelineRevision, "abc123");
  });

  it("accepts manifest with metricCategory in qcSummary result", () => {
    const raw = validManifest();
    (raw.qcSummary as any).results[0].metricCategory = "callable_region_coverage";
    const m = parseWorkflowOutputManifest(raw);
    assert.equal(m.qcSummary.results[0].metricCategory, "callable_region_coverage");
  });

  it("rejects manifest missing runId", () => {
    const raw = validManifest();
    delete raw.runId;
    assert.throws(
      () => parseWorkflowOutputManifest(raw),
      (err: any) => err.message.includes("runId"),
    );
  });

  it("rejects manifest missing caseId", () => {
    const raw = validManifest();
    delete raw.caseId;
    assert.throws(
      () => parseWorkflowOutputManifest(raw),
      (err: any) => err.message.includes("caseId"),
    );
  });

  it("rejects manifest with invalid artifact semanticType", () => {
    const raw = validManifest();
    (raw.derivedArtifacts as any[])[0].semanticType = "bad-type";
    assert.throws(
      () => parseWorkflowOutputManifest(raw),
      (err: any) => err.message.includes("Unsupported derived artifact semantic type"),
    );
  });

  it("rejects manifest with invalid qcSummary outcome", () => {
    const raw = validManifest();
    (raw.qcSummary as any).outcome = "MAYBE";
    assert.throws(
      () => parseWorkflowOutputManifest(raw),
      (err: any) => err.message.includes("outcome"),
    );
  });

  it("rejects manifest with non-integer outputManifestVersion", () => {
    const raw = validManifest();
    raw.outputManifestVersion = 1.5;
    assert.throws(
      () => parseWorkflowOutputManifest(raw),
      (err: any) => err.message.includes("int"),
    );
  });

  it("rejects manifest with unknown extra field (strict)", () => {
    const raw = validManifest();
    raw.extra = "oops";
    assert.throws(() => parseWorkflowOutputManifest(raw));
  });

  it("rejects non-object body", () => {
    assert.throws(
      () => parseWorkflowOutputManifest("not-an-object"),
      (err: any) => err.message.includes("must be an object"),
    );
  });
});
